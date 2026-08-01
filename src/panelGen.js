/**
 * On-demand interactive panels.
 *
 * The reader highlights a passage they don't follow and gets an explorable
 * built for exactly that — the inversion of a dashboard that decides up front
 * which concepts everyone must be walked through.
 *
 * Two things are enforced here rather than server-side, because both are about
 * protecting the reader rather than the service:
 *
 *  1. A SPEND CAP per paper. This is metered against the account balance, and
 *     a curious reader clicking through a long paper could otherwise spend
 *     real money without ever seeing a price. Past the cap the caller must
 *     confirm explicitly.
 *  2. A QUALITY GATE. Generated code is executed in the browser, so it is
 *     test-run BEFORE it is shown. A panel that fails to compile, throws, or
 *     draws a flat line is rejected rather than displayed — the same standard
 *     the analysis pipeline's validators apply.
 */

import { getAccessToken, functionsUrl, supabaseAnonKey } from "./supabase.js";
import { buildHelpers } from "./engine.js";

/** Panels one paper may generate before the reader has to confirm each extra
 *  one. Chosen so a normal read-through never hits it and a runaway does. */
export const PANEL_SOFT_CAP = 8;

/**
 * Test-run a generated demo the way the reader's browser will.
 * Returns null when it's good, or a human-readable reason to reject it.
 */
export function auditPanel(panel) {
  const demo = panel?.demo;
  if (!demo?.computeJs) return "the panel came back without any code";

  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function("params", "helpers", demo.computeJs);
  } catch (e) {
    return `the panel's code doesn't compile (${e.message})`;
  }

  const helpers = buildHelpers({ T: demo.T || 10, dt: demo.dt || 0.05 });
  const params = Object.fromEntries((demo.params || []).map((p) => [p.key, p.def]));

  let out;
  try {
    out = fn(params, helpers);
  } catch (e) {
    return `the panel's code crashed when run (${e.message})`;
  }

  if (demo.kind === "frames") {
    if (!Array.isArray(out?.frames) || out.frames.length < 2) {
      return "the panel produced no animation frames";
    }
    return null;
  }

  const series = out?.series;
  if (!Array.isArray(series) || !series.length) return "the panel produced no data to plot";

  // Flat output is the failure mode that makes a generated panel worthless:
  // it renders, it looks like a chart, and it teaches nothing.
  const varies = series.some((s) => {
    const d = (s?.data || []).filter(Number.isFinite);
    if (d.length < 4) return false;
    return Math.max(...d) - Math.min(...d) > 1e-9;
  });
  if (!varies) return "the panel drew a flat line — nothing to explore";

  return null;
}

/**
 * Ask the server for a panel about `quote`.
 * Returns { panel, cost, remainingBalance }; throws with a readable message.
 */
export async function generatePanel({ paperTitle, sectionLabel, quote, context }) {
  if (!functionsUrl) throw new Error("Panel building isn't configured for this deployment.");

  const token = await getAccessToken();
  if (!token) {
    const e = new Error("Sign in to build a panel for this passage.");
    e.code = "auth";
    throw e;
  }

  const res = await fetch(`${functionsUrl}/generate-panel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ paperTitle, sectionLabel, quote, context }),
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const e = new Error(data?.error || `Panel request failed (${res.status}).`);
    if (res.status === 402) e.code = "credit";
    throw e;
  }
  if (!data?.demo) throw new Error("The panel builder returned nothing — try again.");

  const panel = data.demo;   // { title, story, source, demo }
  const problem = auditPanel(panel);
  if (problem) {
    const e = new Error(`This passage didn't produce a working panel — ${problem}.`);
    e.code = "audit";
    // The cost was still incurred: the caller must report it, not hide it.
    e.cost = data.cost || 0;
    e.remainingBalance = data.remainingBalance;
    throw e;
  }

  return { panel, cost: data.cost || 0, remainingBalance: data.remainingBalance };
}
