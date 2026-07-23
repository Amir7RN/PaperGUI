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

import { MODEL_TIERS } from "../supabase/functions/_shared/paperSpec.js";
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
 * The analysis runs as THREE sequential edge-function calls — the hosting
 * platform kills any single function at 150s of wall clock, which a full
 * one-shot analysis always exceeds on real papers. Each phase returns a
 * slice of the PaperSpec; the PDF is prompt-cached server-side so phases
 * 2 and 3 re-read it at ~10% of the input price.
 */
const PHASES = [
  { id: "overview", title: "Story & foundations", from: 3,  to: 34,
    keys: ["meta", "archetype", "story", "mindmap", "conclusion", "references", "conceptFigures", "foundations", "model"] },
  { id: "method",   title: "Interactive method layer", from: 34, to: 67,
    keys: ["protocol", "blocks", "explorables"] },
  { id: "results",  title: "Result figures",      from: 67, to: 99,
    keys: ["resultFigures", "checkpoints", "claims", "flashcards"] },
];

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

/** Next-faster tier to fall back to when a phase times out. */
const FALLBACK_ORDER = ["advanced", "standard", "basic", "fast"];
function fallbackTier(tier) {
  const i = FALLBACK_ORDER.indexOf(tier.id);
  if (i === -1 || i === FALLBACK_ORDER.length - 1) return null;
  return MODEL_TIERS.find((t) => t.id === FALLBACK_ORDER[i + 1]) || null;
}

/** One phase call: streams NDJSON progress, returns {spec, cost, remainingBalance}.
 *  `repair` is an optional list of validation problems from a previous
 *  attempt, fed back to the analyzer so it regenerates correctly. */
async function runPhase(pdfBase64, tier, hints, phase, contextSpec, token, report, repair = null, codeText = null) {
  const res = await fetch(`${functionsUrl}/analyze-paper`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ pdfBase64, tierId: tier.id, hints, phase: phase.id, contextSpec, repair, codeText }),
  });

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
    const { done, value } = await reader.read();
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
    // A silent disconnect is almost always the platform's 150s kill —
    // treat it like a timeout so the caller's fallback retry kicks in.
    const e = new Error(
      `The connection dropped during the "${phase.title}" stage — the server hit its time limit.`
    );
    e.code = "timeout";
    throw e;
  }
  return result;
}

/**
 * Analyze a paper PDF (base64 string, no newlines) with the given model tier
 * (defaults to the stored/most-capable tier). `hints` is optional reader
 * guidance {domain, focus, signal, notes} appended to the prompt.
 * onProgress({pct,label}) is called as the request advances.
 * Returns { spec, cost, remainingBalance }.
 */
export async function analyzePaper(pdfBase64, onProgress, tier = getModelTier(), hints = null, validators = null, codeText = null) {
  const report = (pct, label) => onProgress?.({ pct, label });

  if (!functionsUrl) {
    throw new Error("Sign-in is not configured for this deployment — analysis is unavailable.");
  }

  const token = await getAccessToken();
  if (!token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  report(2, "Uploading the paper…");

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
          : phase.id === "method"
            ? { archetype: spec.archetype }
            : null;
      try {
        result = await runPhase(pdfBase64, tier, hints, phase, contextSpec, token, report, null, codeText);
      } catch (err) {
        // A timed-out stage automatically retries once on the next-faster
        // level, so one slow stage doesn't waste the whole (paid) run.
        const fb = err?.code === "timeout" ? fallbackTier(tier) : null;
        if (!fb) throw err;
        report(phase.from, `${phase.title} — took too long, retrying on the ${fb.label} level…`);
        result = await runPhase(pdfBase64, fb, hints, phase, contextSpec, token, report, null, codeText);
      }

      // Quality gate: test-run the generated code. If it produces flat lines,
      // dead sliders, or broken panels, regenerate this phase ONCE with the
      // exact problems fed back to the analyzer.
      const validator = validators?.[phase.id];
      if (validator) {
        const candidate = { ...spec };
        for (const k of phase.keys) {
          if (result.spec?.[k] !== undefined) candidate[k] = result.spec[k];
        }
        let problems = null;
        try { problems = validator(candidate); } catch { /* audit crash ≠ analysis failure */ }
        if (problems) {
          report(phase.from, `${phase.title} — failed the quality check, regenerating…`);
          try {
            const retry = await runPhase(pdfBase64, tier, hints, phase, contextSpec, token, report, problems, codeText);
            const candidate2 = { ...spec };
            for (const k of phase.keys) {
              if (retry.spec?.[k] !== undefined) candidate2[k] = retry.spec[k];
            }
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
    for (const k of phase.keys) {
      if (result.spec?.[k] !== undefined) spec[k] = result.spec[k];
    }
    totalCost += result.cost || 0;
    if (typeof result.remainingBalance === "number") remainingBalance = result.remainingBalance;
  }

  return { spec, cost: totalCost, remainingBalance };
}
