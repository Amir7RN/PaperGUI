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

import { MODEL_TIERS, modelForPhase } from "../supabase/functions/_shared/paperSpec.js";
import { PHASES, mergePhase, contextSpecFor } from "./phases.js";
import { docKey, fixtureKey } from "./fixtureKey.js";
import { getAccessToken, refreshAccessToken, functionsUrl, supabaseAnonKey } from "./supabase.js";

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
 *
 * PHASES, mergePhase and contextSpecFor now live in ./phases.js so the offline
 * fixture harness can build byte-identical prompts from the same definitions.
 */

/* Completed phases are cached (keyed by document), so a failed or retried
 * analysis NEVER re-pays for stages that already succeeded — retrying resumes
 * where it left off.
 *
 * This used to be an in-memory Map, which meant it only survived a retry in
 * the same tab, on the same page load. Every real failure mode breaks that: a
 * reader whose run dies on the last phase closes the error, reloads, presses
 * go again — and buys all four finished phases a second time. That is money
 * out of their balance for work already done, and it is the single most
 * expensive bug this file can have. So it is written to localStorage as each
 * phase lands.
 *
 * Everything here is best-effort: a full quota or a private-mode browser must
 * degrade to the old in-memory behaviour, never fail an analysis.
 */
const phaseCache = new Map();

const PHASE_STORE = "paper-playground-phases-v1";
/* Long enough that "I'll finish it tomorrow" works; short enough that a
 * changed analyzer doesn't serve stale phases forever. */
const PHASE_TTL_MS = 24 * 60 * 60 * 1000;
/* localStorage is typically 5 MB per origin and is shared with the layout,
 * notebook and highlights. Phase slices are JSON text (no images yet at this
 * point), so this ceiling holds several papers without crowding them out. */
const PHASE_STORE_MAX_CHARS = 3_000_000;

function loadPhaseStore() {
  try {
    const raw = localStorage.getItem(PHASE_STORE);
    if (!raw) return {};
    const all = JSON.parse(raw);
    const now = Date.now();
    let changed = false;
    for (const [k, v] of Object.entries(all)) {
      if (!v?.at || now - v.at > PHASE_TTL_MS) { delete all[k]; changed = true; }
    }
    if (changed) localStorage.setItem(PHASE_STORE, JSON.stringify(all));
    return all;
  } catch { return {}; }
}

/** Every phase this document has already paid for, newest wins. */
function restorePhases(key) {
  const all = loadPhaseStore();
  for (const [id, entry] of Object.entries(all)) {
    if (id.startsWith(`${key}:`) && entry?.result && !phaseCache.has(id)) {
      phaseCache.set(id, entry.result);
    }
  }
}

function rememberPhase(cacheId, result) {
  phaseCache.set(cacheId, result);
  try {
    const all = loadPhaseStore();
    all[cacheId] = { at: Date.now(), result };
    let text = JSON.stringify(all);
    // Over budget: drop whole documents oldest-first until it fits. Dropping a
    // document rather than a phase keeps every survivor a usable resume point.
    while (text.length > PHASE_STORE_MAX_CHARS) {
      const oldest = Object.entries(all).sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0))[0];
      if (!oldest || oldest[0] === cacheId) break;
      const doc = oldest[0].split(":").slice(0, -1).join(":");
      for (const id of Object.keys(all)) if (id.startsWith(`${doc}:`)) delete all[id];
      text = JSON.stringify(all);
    }
    localStorage.setItem(PHASE_STORE, text);
  } catch { /* quota or private mode — the in-memory cache still works */ }
}

/* ------------------------------------------------------------------ *
 * Fixtures — recorded analyses replayed from disk, for development.
 *
 * A fixture is what the analyzer produced for one paper, one JSON file per
 * phase, written by scripts/fixture-write.mjs into public/fixtures/<key>/.
 * When replay is on, those files prime the phase cache exactly as a resumed
 * run would, so the app takes the SAME code path with no API call and no
 * charge — the point being to stop re-buying the same three sample papers
 * while iterating on the frontend.
 *
 * Off unless asked for: VITE_FIXTURES=1, or ?fixtures=1 on a dev server. It
 * must never engage in production, where a stale recording served as a real
 * analysis would be indistinguishable from a bug.
 * ------------------------------------------------------------------ */

function fixturesEnabled() {
  try {
    if (import.meta.env.VITE_FIXTURES === "1") return true;
    return (
      import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get("fixtures") === "1"
    );
  } catch { return false; }
}

/** Fetch every recorded phase for this document. Missing files are normal —
 *  a half-recorded paper replays what exists and pays for the rest. */
async function loadFixtures(pdfBase64, codeText) {
  if (!fixturesEnabled()) return new Map();
  const dir = `${import.meta.env.BASE_URL}fixtures/${fixtureKey(pdfBase64, codeText)}`;
  const found = new Map();
  await Promise.all(
    PHASES.map(async (phase) => {
      try {
        const res = await fetch(`${dir}/${phase.id}.json`, { cache: "no-store" });
        if (!res.ok) return;
        /* A dev server answers a missing path with index.html rather than a
         * 404, so res.ok alone would hand JSON.parse a page of markup. */
        const text = await res.text();
        if (!text.trimStart().startsWith("{")) return;
        found.set(phase.id, JSON.parse(text));
      } catch { /* absent or malformed — just pay for this phase */ }
    }),
  );
  /* Loud on purpose: the failure mode of a content-addressed cache is silence.
   * A key that doesn't match what the harness wrote looks exactly like replay
   * being off, and you'd only notice from the bill. */
  console.info(`[fixtures] ${found.size}/${PHASES.length} phases from ${dir}`);
  return found;
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
async function runPhase(paper, tier, hints, phase, contextSpec, report, repair = null, codeText = null) {
  /* A FRESH token per call, never the one the run started with.
   *
   * An analysis is five sequential calls plus retries and can run for tens of
   * minutes; a Supabase access token expires (an hour by default, and it may
   * already be most of an hour old when the reader presses go). The run used
   * to capture one token up front and reuse it, so a long analysis died at the
   * gateway with 401 — after the earlier phases had been billed. getSession()
   * hands back a refreshed token when the old one is close to expiry, so
   * asking again per phase is the whole fix, and it costs nothing. */
  const token = await getAccessToken();
  if (!token) {
    const e = new Error("Your session expired during the analysis — sign in again and retry; the stages already finished are kept and won't be charged twice.");
    e.code = "auth";
    throw e;
  }

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
    /* Two different things answer this endpoint with an error, and they do not
     * agree on where the text goes. Our own function returns {error}; the
     * platform's gateway — which rejects a bad or EXPIRED JWT before our code
     * ever runs — returns {message} (sometimes {msg}). Reading only `error`
     * turned every gateway rejection into a bare "Analysis request failed
     * (401)", which told the reader nothing and hid the fact that all they
     * needed was a fresh session. */
    let message = `Analysis request failed (${res.status}).`;
    try {
      const body = await res.json();
      message = body?.error || body?.message || body?.msg || message;
    } catch { /* non-JSON error body */ }
    const e = new Error(message);
    if (res.status === 401) e.code = "auth";
    throw e;
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
async function runPhaseWithFallback(paper, tier, hints, phase, contextSpec, report, codeText) {
  let attempt = tier;
  let retriedThisTier = false;
  let netRetries = 0;
  let refreshedAuth = false;
  for (let calls = 1; ; calls++) {
    try {
      const result = await runPhase(paper, attempt, hints, phase, contextSpec, report, null, codeText);
      return { result, tier: attempt };
    } catch (err) {
      const code = err?.code;

      /* A rejected token is not a rejected paper. The gateway refuses the
       * request before the model is ever called, so nothing was billed — and
       * the fix is one refresh, not a cheaper tier and not an abandoned run.
       * Once only: if a fresh token is refused too, the session is genuinely
       * gone and the reader has to sign in. */
      if (code === "auth" && !refreshedAuth) {
        refreshedAuth = true;
        report(phase.from, `${phase.title} — renewing your session…`);
        const fresh = await refreshAccessToken();
        if (fresh) { calls--; continue; }   // free: nothing was charged
        throw err;
      }

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

  /* Recorded phases are read BEFORE the sign-in checks: a fully recorded paper
   * replays with no network at all, which is what makes it usable against a
   * dev build with no Supabase session. A partial recording still needs an
   * account for the phases it is missing, so it falls through. */
  const fixtures = await loadFixtures(pdfBase64, codeText);
  if (fixtures.size === PHASES.length) {
    const replayed = {};
    for (const phase of PHASES) mergePhase(replayed, phase, fixtures.get(phase.id));
    report(100, "Replayed from a recorded analysis (no charge)");
    return { spec: replayed, cost: 0, remainingBalance: null };
  }

  if (!functionsUrl) {
    throw new Error("Sign-in is not configured for this deployment — analysis is unavailable.");
  }

  if (!(await getAccessToken())) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  report(2, "Uploading the paper…");

  const paper = pdfPath ? { pdfPath } : { pdfBase64 };

  const spec = {};
  let totalCost = 0;
  let remainingBalance = null;
  // cache key covers the code too — analyzing the same PDF with vs without
  // uploaded code must never reuse the other run's phases
  /* The tier is part of the key now that this cache outlives the page.
   * Resuming a failed Advanced run must reuse its Advanced phases — but a
   * reader who was unhappy with a Fast pass and re-runs at Advanced is asking
   * for a better analysis, and silently handing back yesterday's Fast phases
   * would be the wrong kind of free. */
  const key = `${tier.id}|` + docKey(pdfBase64) + (codeText ? `+${docKey(codeText)}` : "");
  // Anything this document already paid for in an earlier, failed run — the
  // whole point being that a retry resumes instead of re-buying.
  restorePhases(key);
  /* A partial recording joins the same cache the resume path uses, so the loop
   * below treats a replayed phase and a resumed one identically. Recordings are
   * tier-independent by design (see fixtureKey), hence priming under whatever
   * tier this run asked for. */
  for (const [phaseId, phaseSpec] of fixtures) {
    const id = `${key}:${phaseId}`;
    if (!phaseCache.has(id)) phaseCache.set(id, { spec: phaseSpec, cost: 0 });
  }

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
      const contextSpec = contextSpecFor(phase.id, spec);
      // A timed-out stage retries down the tier ladder, so one slow stage
      // never wastes the whole (paid) run.
      const attempt = await runPhaseWithFallback(
        paper, tier, hints, phase, contextSpec, report, codeText,
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
            const retry = await runPhase(paper, ranOn, hints, phase, contextSpec, report, problems, codeText);
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

      // Written to disk the moment it lands, not at the end of the run: the
      // failures that cost money are the ones that happen AFTER this.
      rememberPhase(cacheId, result);
    }

    // Copy only this phase's expected fields — without strict structured
    // outputs the model occasionally emits stray extra keys.
    mergePhase(spec, phase, result.spec);
    totalCost += result.cost || 0;
    if (typeof result.remainingBalance === "number") remainingBalance = result.remainingBalance;
  }

  return { spec, cost: totalCost, remainingBalance };
}
