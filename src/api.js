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

  report(3, "Uploading the paper…");

  const res = await fetch(`${functionsUrl}/analyze-paper`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ pdfBase64, tierId: tier.id, hints }),
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
        report(event.pct, event.label);
      } else if (event.type === "result") {
        result = event;
      } else if (event.type === "error") {
        errorMessage = event.message;
      }
    }
  }

  if (errorMessage) throw new Error(errorMessage);
  if (!result) throw new Error("The analyzer closed the connection without returning a result.");

  return { spec: result.spec, cost: result.cost, remainingBalance: result.remainingBalance };
}
