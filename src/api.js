/**
 * AI-powered paper analysis.
 *
 * The actual model API call happens server-side in the `analyze-paper`
 * Supabase Edge Function — this file just authenticates the request (via the
 * signed-in user's Supabase session) and streams progress back into the UI.
 * There is no API key here and none in the browser at all: it lives only as
 * an Edge Function secret. Every analysis is metered against the caller's
 * account balance server-side (see supabase/functions/analyze-paper).
 */

import { MERGED_SPEC_KEYS, MODEL_TIERS, modelForPhase } from "../supabase/functions/_shared/paperSpec.js";
import { getAccessToken, functionsUrl, supabaseAnonKey } from "./supabase.js";

const TIER_STORAGE = "paper-playground-model-tier";

export { MODEL_TIERS };

export function getModelTier() {
  try {
    const saved = localStorage.getItem(TIER_STORAGE);
    return MODEL_TIERS.find((t) => t.id === saved) || MODEL_TIERS[0];
  } catch {
    return MODEL_TIERS[0];
  }
}

export function setModelTier(id) {
  try { localStorage.setItem(TIER_STORAGE, id); } catch { /* non-fatal */ }
}

/**
 * The analysis runs as FIVE sequential edge-function calls — the hosting
 * platform kills any single function at 150s of wall clock (400s on Pro),
 * which a full one-shot analysis always exceeds on real papers. Each phase
 * returns a slice of the PaperSpec; the PDF is prompt-cached server-side so
 * later phases re-read it at ~10% of the input price.
 *
 * `foundations` is split out of `overview` deliberately: emitting the slider
 * demos, the governing equations AND two narrated walkthroughs on top of the
 * paper's framing was what pushed the first call past the kill window on the
 * Advanced (Opus) tier, halting runs mid-way.
 *
 * `model` is then split out of `foundations` so the two can run on DIFFERENT
 * models — the Advanced tier routes the narrative phases (overview,
 * foundations) to Sonnet and the hard ones (model, method, results) to Opus.
 * See MODEL_TIERS.phaseModels in paperSpec.js.
 */
const PHASES = [
  { id: "overview",    title: "Story & framing", from: 3,  to: 22,
    keys: ["meta", "archetype", "story", "mindmap", "conclusion", "references", "conceptFigures"] },
  { id: "foundations", title: "Background", from: 22, to: 38,
    keys: ["foundations", "explainer"] },
  { id: "model",       title: "The model & equations", from: 38, to: 55,
    keys: ["model", "explainer"] },
  { id: "method",      title: "Interactive method layer", from: 55, to: 76,
    keys: ["protocol", "blocks", "explorables"] },
  { id: "results",     title: "Result figures", from: 76, to: 99,
    keys: ["resultFigures", "checkpoints", "claims", "flashcards"] },
];

/** Merge one phase's returned slice into the accumulating spec. Most keys just
 *  overwrite; MERGED_SPEC_KEYS (`explainer`) are produced in halves by two
 *  phases, so overwriting would throw the first half away. */
function mergePhase(spec, phase, phaseSpec) {
  for (const k of phase.keys) {
    const v = phaseSpec?.[k];
    if (v === undefined) continue;
    spec[k] = MERGED_SPEC_KEYS.includes(k) && v && typeof v === "object"
      ? { ...(spec[k] || {}), ...v }
      : v;
  }
  return spec;
}

/* Completed phases are cached for the session (keyed by document), so a
 * failed or retried analysis NEVER re-pays for stages that already
 * succeeded — retrying resumes where it left off. */
const phaseCache = new Map();

/** Cheap stable key for a base64 document (sampled — full hashing of a
 *  30MB string on the main thread isn't worth it for a session cache). */
function docKey(pdfBase64) {
  const n = pdfBase64.length;
  let h = 0;
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 512))) {
    h = ((h << 5) - h + pdfBase64.charCodeAt(i)) | 0;
  }
  return `${n}:${h}`;
}

/**
 * Next-faster tier to fall back to when a phase times out.
 *
 * It must step down the MODEL, not just the tier: with per-phase routing,
 * Advanced already runs `overview` on Sonnet 5, and "falling back" to the
 * Standard tier would re-run the identical model and time out again. So skip
 * any tier that resolves to the same model for this phase.
 */
const FALLBACK_ORDER = ["advanced", "standard", "basic", "fast"];
function fallbackTier(tier, phase) {
  const i = FALLBACK_ORDER.indexOf(tier.id);
  if (i === -1) return null;
  const current = modelForPhase(tier, phase?.id).model;
  for (let j = i + 1; j < FALLBACK_ORDER.length; j++) {
    const next = MODEL_TIERS.find((t) => t.id === FALLBACK_ORDER[j]);
    if (next && modelForPhase(next, phase?.id).model !== current) return next;
  }
  return null;
}

/** One phase call: streams NDJSON progress, returns {spec, cost, remainingBalance}.
 *  `repair` is an optional list of validation problems from a previous
 *  attempt, fed back to the analyzer so it regenerates correctly. */
async function runPhase(paper, tier, hints, phase, contextSpec, token, report, repair = null, codeText = null) {
  let res;
  try {
    res = await fetch(`${functionsUrl}/analyze-paper`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      /* `paper` is either { pdfPath } — the paper already in private storage,
       * named once per phase — or { pdfBase64 } for callers with nothing
       * stored. The path form is what stops a five-phase analysis re-uploading
       * the whole PDF five times over the reader's uplink. */
      body: JSON.stringify({ ...paper, tierId: tier.id, hints, phase: phase.id, contextSpec, repair, codeText }),
    });
  } catch (netErr) {
    /* fetch() rejects only when the request never completed: DNS, TLS, the
     * connection dropping while the PDF was still going up. The browser's own
     * text for this is a bare "network error", which is what the reader was
     * shown when a whole paid analysis died — no stage named, no hint that a
     * retry would work, and (because it surfaced as an unknown error) no
     * retry attempted. The upload is the vulnerable part: every phase re-sends
     * the entire base64 PDF, so a 20 MB paper goes up five times.
     *
     * Nothing was billed — the model call never started — so this is always
     * safe to retry, and it is typed so the caller does. */
    const e = new Error(
      `The connection dropped while sending the paper for the "${phase.title}" stage.`,
    );
    e.code = "network";
    e.cause = netErr;
    throw e;
  }

  if (!res.ok || !res.body) {
    let message = `Analysis request failed (${res.status}).`;
    try { message = (await res.json())?.error || message; } catch { /* non-JSON error body */ }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let errorMessage = null;
  let errorCode = null;

  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch {
      /* The stream died after the model call was already running — which means
       * it was billed. Retrying the same tier would pay twice for the same
       * stage, so this is reported as the wall-clock kill it almost always is
       * and the caller steps DOWN a tier instead. */
      const e = new Error(
        `The connection to the analyzer dropped during the "${phase.title}" stage.`,
      );
      e.code = "timeout";
      throw e;
    }
    const { done, value } = chunk;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;

      let event;
      try { event = JSON.parse(line); } catch { continue; }

      if (event.type === "progress") {
        // Map this phase's 0-100% into its slice of the overall bar.
        const pct = phase.from + (Math.min(100, event.pct) / 100) * (phase.to - phase.from);
        report(pct, `${phase.title} — ${event.label}`);
      } else if (event.type === "result") {
        result = event;
      } else if (event.type === "error") {
        errorMessage = event.message;
        errorCode = event.code || null;
      }
    }
  }

  if (errorMessage) {
    const e = new Error(errorMessage);
    e.code = errorCode;
    throw e;
  }
  if (!result) {
    // A silent disconnect is almost always the platform's wall-clock kill —
    // treat it like a timeout so the caller's fallback retry kicks in.
    const e = new Error(
      `The connection dropped during the "${phase.title}" stage — the server hit its time limit.`
    );
    e.code = "timeout";
    throw e;
  }
  return result;
}

/** Cap on total model calls for one phase, across retries and tier steps.
 *  Every attempt costs real money even when it fails, so a phase that simply
 *  cannot succeed must give up rather than grind down the whole ladder. */
const MAX_PHASE_ATTEMPTS = 4;

/** Resends of a phase whose upload never reached the server. These cost
 *  nothing (no model call happened), so they are separate from the paid
 *  attempt budget above — but not unlimited, because a genuinely offline
 *  browser should be told so rather than looped on. */
const MAX_NETWORK_RETRIES = 3;

/**
 * Run one phase, recovering from the two failures that otherwise abandon a
 * half-finished (and already paid for) run:
 *
 *  - `timeout` — the stage outran the hosting window. Step DOWN to a faster
 *    tier. This used to fall back exactly once, so a paper heavy enough to
 *    time out twice still escaped as an error.
 *  - `parse` — the model's reply wasn't valid JSON. Almost always transient,
 *    so ask the same tier again before giving up any quality.
 *
 * Returns { result, tier } — the tier that succeeded, so a follow-up quality
 * retry doesn't jump back to one we already know is too slow for this paper.
 */
async function runPhaseWithFallback(paper, tier, hints, phase, contextSpec, token, report, codeText) {
  let attempt = tier;
  let retriedThisTier = false;
  let netRetries = 0;
  for (let calls = 1; ; calls++) {
    try {
      const result = await runPhase(paper, attempt, hints, phase, contextSpec, token, report, null, codeText);
      return { result, tier: attempt };
    } catch (err) {
      const code = err?.code;

      /* A dropped upload never reached the model, so nothing was charged and
       * nothing about the request needs to change — just send it again. This
       * does NOT consume the paid-attempt budget for that reason, and it does
       * not step down a tier: an interrupted upload says nothing about whether
       * this paper is too slow for this tier. */
      if (code === "network") {
        if (++netRetries > MAX_NETWORK_RETRIES) {
          const e = new Error(
            `${err.message} Check your connection and start the analysis again — the stages that already finished are kept and won't be charged twice.`,
          );
          e.code = "network";
          throw e;
        }
        report(phase.from, `${phase.title} — connection interrupted, resending the paper (attempt ${netRetries + 1})…`);
        await new Promise((r) => setTimeout(r, 1500 * netRetries));
        calls--;   // free retry: it costs nothing, so it buys no paid attempt
        continue;
      }

      if (code !== "timeout" && code !== "parse") throw err;
      if (calls >= MAX_PHASE_ATTEMPTS) throw err;

      // A malformed reply is worth one more go at the SAME level before
      // trading quality away for reliability.
      if (code === "parse" && !retriedThisTier) {
        retriedThisTier = true;
        report(phase.from, `${phase.title} — the analyzer's reply came back malformed, asking again…`);
        continue;
      }

      const next = fallbackTier(attempt, phase);
      if (!next) throw err;
      // The tier's own label, never the model's name — see MODEL_TIERS.
      report(
        phase.from,
        code === "timeout"
          ? `${phase.title} — took too long, retrying at the ${next.label} level…`
          : `${phase.title} — couldn't read the reply, retrying at the ${next.label} level…`,
      );
      attempt = next;
      retriedThisTier = false;
    }
  }
}

/**
 * Analyze a paper PDF with the given model tier (defaults to the stored/most-
 * capable tier). `hints` is optional reader guidance {domain, focus, signal,
 * notes} appended to the prompt. onProgress({pct,label}) is called as the
 * request advances. Returns { spec, cost, remainingBalance }.
 *
 * `pdfBase64` is always needed for the session phase cache (it identifies the
 * document). `pdfPath` — the paper's key in private storage — is what actually
 * travels: naming it once per phase replaces five full uploads of the same
 * bytes. Without a path the base64 goes up as before, so a deployment or an
 * account with no storage still analyses fine.
 */
export async function analyzePaper(pdfBase64, onProgress, tier = getModelTier(), hints = null, validators = null, codeText = null, pdfPath = null) {
  const report = (pct, label) => onProgress?.({ pct, label });

  if (!functionsUrl) {
    throw new Error("Sign-in is not configured for this deployment — analysis is unavailable.");
  }

  const token = await getAccessToken();
  if (!token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  report(2, "Uploading the paper…");

  const paper = pdfPath ? { pdfPath } : { pdfBase64 };

  const spec = {};
  let totalCost = 0;
  let remainingBalance = null;
  // cache key covers the code too — analyzing the same PDF with vs without
  // uploaded code must never reuse the other run's phases
  const key = docKey(pdfBase64) + (codeText ? `+${docKey(codeText)}` : "");

  for (const phase of PHASES) {
    // NOTE: the method phase always runs. For papers whose method isn't
    // honestly simulatable it produces `explorables` (the paper's own
    // equations on sliders + its reported data as interactive charts)
    // instead of a simulation pipeline — every paper stays hands-on.
    const cacheId = `${key}:${phase.id}`;
    let result = phaseCache.get(cacheId);

    if (result) {
      // Already produced in a previous (failed or retried) run — free.
      report(phase.to, `${phase.title} — already done, reusing it (no charge)`);
    } else {
      const contextSpec =
        phase.id === "results"
          ? { protocol: spec.protocol, blocks: spec.blocks, archetype: spec.archetype, field: spec.meta?.field }
          : phase.id === "method" || phase.id === "foundations" || phase.id === "model"
            ? { archetype: spec.archetype }
            : null;
      // A timed-out stage retries down the tier ladder, so one slow stage
      // never wastes the whole (paid) run.
      const attempt = await runPhaseWithFallback(
        paper, tier, hints, phase, contextSpec, token, report, codeText,
      );
      result = attempt.result;
      const ranOn = attempt.tier;

      // Quality gate: test-run the generated code. If it produces flat lines,
      // dead sliders, or broken panels, regenerate this phase ONCE with the
      // exact problems fed back to the analyzer.
      const validator = validators?.[phase.id];
      if (validator) {
        const candidate = mergePhase({ ...spec }, phase, result.spec);
        let problems = null;
        try { problems = validator(candidate); } catch { /* audit crash ≠ analysis failure */ }
        if (problems) {
          report(phase.from, `${phase.title} — failed the quality check, regenerating…`);
          try {
            // `ranOn`, not `tier`: if this phase already had to drop to a
            // faster level to finish, the regeneration must not climb back to
            // one that just timed out on this paper.
            const retry = await runPhase(paper, ranOn, hints, phase, contextSpec, token, report, problems, codeText);
            const candidate2 = mergePhase({ ...spec }, phase, retry.spec);
            let problems2 = null;
            try { problems2 = validator(candidate2); } catch { /* keep retry */ }
            // Prefer the retry unless it is measurably worse than the original.
            const count = (s) => (s ? s.split("\n").length : 0);
            if (count(problems2) <= count(problems)) {
              retry.cost = (retry.cost || 0) + (result.cost || 0);
              result = retry;
            }
          } catch { /* retry failed — keep the original attempt */ }
        }
      }

      phaseCache.set(cacheId, result);
    }

    // Copy only this phase's expected fields — without strict structured
    // outputs the model occasionally emits stray extra keys.
    mergePhase(spec, phase, result.spec);
    totalCost += result.cost || 0;
    if (typeof result.remainingBalance === "number") remainingBalance = result.remainingBalance;
  }

  return { spec, cost: totalCost, remainingBalance };
}
