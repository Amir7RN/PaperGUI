/**
 * Claude-powered paper analysis.
 *
 * The actual Anthropic API call happens server-side in the `analyze-paper`
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
  { id: "overview", title: "Idea & foundations", from: 3,  to: 34 },
  { id: "method",   title: "Method pipeline",    from: 34, to: 67 },
  { id: "results",  title: "Result figures",     from: 67, to: 99 },
];

/** One phase call: streams NDJSON progress, returns {spec, cost, remainingBalance}. */
async function runPhase(pdfBase64, tier, hints, phase, contextSpec, token, report) {
  const res = await fetch(`${functionsUrl}/analyze-paper`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ pdfBase64, tierId: tier.id, hints, phase: phase.id, contextSpec }),
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
      }
    }
  }

  if (errorMessage) throw new Error(errorMessage);
  if (!result) {
    throw new Error(
      `The connection dropped during the "${phase.title}" stage — the server likely hit its ` +
      "time limit. Try again on a faster level (Basic or Fast), or with a shorter paper."
    );
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
export async function analyzePaper(pdfBase64, onProgress, tier = getModelTier(), hints = null) {
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

  for (const phase of PHASES) {
    const contextSpec =
      phase.id === "results" ? { protocol: spec.protocol, blocks: spec.blocks } : null;
    const result = await runPhase(pdfBase64, tier, hints, phase, contextSpec, token, report);
    Object.assign(spec, result.spec);
    totalCost += result.cost || 0;
    if (typeof result.remainingBalance === "number") remainingBalance = result.remainingBalance;
  }

  return { spec, cost: totalCost, remainingBalance };
}
