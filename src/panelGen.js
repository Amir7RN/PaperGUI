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

/* How much a set of numbers actually spreads, as a fraction of its own size.
 *
 * Relative, not absolute. An absolute threshold answers "is this bigger than
 * 1e-9", which is the wrong question twice over: a strain measured in metres
 * varies by 1e-11 and matters, while a population count varying by 1e-9 is
 * float noise. Dividing by the magnitude asks the question that survives a
 * change of units.
 *
 * Loops rather than Math.min(...d): spreading a long array into a call blows
 * the argument limit, and a generated kernel decides its own length. */
function spread(values) {
  let lo = Infinity, hi = -Infinity, n = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    n++;
  }
  if (n < 2) return 0;
  const scale = Math.max(Math.abs(lo), Math.abs(hi), 1e-300);
  return (hi - lo) / scale;
}

/* One part in a million: far above float noise, far below anything a reader
 * could see as "the same value twice". */
const VARIES = 1e-6;

/**
 * Test-run a generated demo the way the reader's browser will.
 * Returns null when it's good, or a human-readable reason to reject it.
 *
 * The bar this sets is the reader's: will they SEE something, and does moving
 * a dial CHANGE it. Nothing stricter — this audit's own false rejections cost
 * the reader a panel they already paid for, so every rule here has to be one
 * a human would agree with while looking at the chart.
 */
/* The carrier each digitized family MUST have filled, and what "filled" means.
 * A heat map with no grid, a box plot with no boxes and a survival plot with
 * no steps all decode as valid JSON and render as an empty rectangle — the
 * reader paid for that rectangle, so it is rejected here the same way a dead
 * slider is. */
const DIGITIZED_CARRIERS = {
  heatmap: (d) => (d.grid || []).some((r) => (r || []).some(Number.isFinite)) || "no grid values",
  groupedBar: (d) => (d.groups || []).some((g) => (g.bars || []).length) || "no bars",
  radialBar: (d) => ((d.groups || []).some((g) => (g.bars || []).length) || (d.sectors || []).length) || "no bars",
  stackedBar: (d) => (d.subPanels || []).some((p) => (p.groups || []).length) || "no stacked groups",
  stackedBarH: (d) => (d.rows || []).some((r) => (r.segments || []).length) || "no stacked rows",
  box: (d) => (d.categories || []).some((c) => (c.boxes || []).length) || "no boxes",
  violin: (d) => (d.categories || []).some((c) => (c.violins || []).length) || "no violin outlines",
  radar: (d) => ((d.axes || []).length >= 3 && (d.series || []).some((s) => (s.values || []).length)) || "no radar axes or values",
  scatter: (d) => (d.series || []).some((s) => (s.points || []).length) || "no scatter points",
  kaplanMeier: (d) => (d.km?.groups || []).some((g) => (g.steps || []).length >= 2) || "no survival steps",
};

/** A digitized panel carries values, not code — so the audit is about whether
 *  the values are actually there and in the family they claim. */
function auditDigitized(demo) {
  const d = demo?.digitized;
  const kind = d?.kind;
  if (!kind) return "the panel claimed to reproduce a figure but came back with no chart family";
  const check = DIGITIZED_CARRIERS[kind];
  if (!check) return `the panel came back as a “${kind}” chart, which there's no renderer for`;
  const verdict = check(d);
  if (verdict !== true) return `the ${kind} came back with ${verdict}`;
  return null;
}

export function auditPanel(panel) {
  const demo = panel?.demo;
  /* A figure reproduced in its own chart family (heat map, box, violin,
   * stacked, radar, survival…) has no kernel and no dials by design: the
   * paper's values ARE the panel. Running the x-y audit over it would reject
   * every one of them for having no computeJs. */
  if (demo?.kind === "digitized") return auditDigitized(demo);
  if (!demo?.computeJs) return "the panel came back without any code";

  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function("params", "helpers", demo.computeJs);
  } catch (e) {
    return `the panel's code doesn't compile (${e.message})`;
  }

  const helpers = buildHelpers({ T: demo.T || 10, dt: demo.dt || 0.05 });
  const defs = demo.params || [];
  const params = Object.fromEntries(defs.map((p) => [p.key, p.def]));

  const run = (p) => fn({ ...p }, helpers);

  let out;
  try {
    out = run(params);
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

  const datas = series.map((s) => (Array.isArray(s?.data) ? s.data : []));
  const lens = datas.map((d) => d.length);
  if (!lens.some((n) => n > 0)) return "the panel produced no data to plot";

  /* DemoChart lays rows out against series[0]'s length and fills anything
   * missing with 0 — so mismatched series don't fail loudly, they draw a
   * cliff to zero that looks like a finding. */
  if (new Set(lens).size > 1) {
    return `the panel's series are different lengths (${lens.join(", ")}), which would draw as a drop to zero`;
  }

  const n = lens[0];
  if (n < 2 && series.length < 2) {
    return "the panel produced a single value — there's nothing to compare it against";
  }

  /* "Flat" has to mean flat TO THE EYE, which is not the same as "no series
   * varies along x".
   *
   * A bar chart of three categories is three numbers; a baseline-vs-ours
   * comparison is two lines that are each constant but sit far apart. Both
   * are perfectly good panels and the old within-series-only test threw both
   * away — it rejected any bar chart with fewer than four categories, which
   * is most of them. So look for variation in either direction: along a
   * series, or between series at the same x. */
  let varies = datas.some((d) => spread(d) > VARIES);
  if (!varies && series.length > 1) {
    for (let i = 0; i < n; i++) {
      if (spread(datas.map((d) => d[i])) > VARIES) { varies = true; break; }
    }
  }
  if (!varies) return "every value the panel plots is the same — there's nothing to see";

  /* Does anything actually move?
   *
   * This is the check the flat-line test was reaching for and kept missing. A
   * panel whose dials do nothing renders, looks like a chart, and is a
   * photograph — the exact thing the reader did not pay for. Each slider is
   * pushed toward an end of its own range and the output compared.
   *
   * A panel with NO sliders is exempt: the schema allows zero sliders for a
   * chart of the paper's own reported numbers, where there is honestly
   * nothing to vary, and that is a legitimate panel. */
  const live = defs.filter((p) => Number.isFinite(p?.min) && Number.isFinite(p?.max) && p.max > p.min);
  if (live.length) {
    const flat = (o) => (o?.series || []).map((s) => (s?.data || []).join(",")).join("|");
    const base = flat(out);
    let moved = false;

    for (const p of live) {
      const name = p.label || p.key;
      /* BOTH ends, every time — not just the end furthest from the default.
       *
       * The reader is going to drag the slider all the way, and the failure
       * that matters lives at exactly one extreme: the divide-by-zero at
       * min, the overflow at max. Probing only the far end tests the half
       * the panel usually survives. These kernels are a few hundred array
       * ops, so running each one twice more costs nothing. */
      for (const v of [p.min, p.max]) {
        let alt;
        try {
          alt = run({ ...params, [p.key]: v });
        } catch (e) {
          return `the panel crashes when “${name}” is at ${v} (${e.message})`;
        }
        /* Not throwing isn't the same as working: dividing by zero yields
         * Infinity, and DemoChart renders every non-finite value as 0 — a
         * silent collapse to a flat line at the bottom of the axis. */
        const nums = (alt?.series || []).flatMap((s) => s?.data || []);
        if (nums.length && !nums.some(Number.isFinite)) {
          return `the panel produces no valid numbers when “${name}” is at ${v}`;
        }
        if (!moved && flat(alt) !== base) moved = true;
      }
    }

    /* Every dial checked and nothing on the plot ever changed. This is the
     * check the old flat-line test was reaching for: a panel that renders,
     * looks like a chart, and is a photograph. */
    if (!moved) {
      return live.length === 1
        ? `the panel's only dial (“${live[0].label || live[0].key}”) changes nothing`
        : "none of the panel's dials change the plot";
    }
  }

  return null;
}

/** One request to the builder. `retryReason` is the audit's verdict on the
 *  previous attempt, if there was one. */
async function requestPanel({ paperTitle, sectionLabel, quote, context, retryReason }) {
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
    body: JSON.stringify({ paperTitle, sectionLabel, quote, context, retryReason }),
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const e = new Error(data?.error || `Panel request failed (${res.status}).`);
    if (res.status === 402) e.code = "credit";
    throw e;
  }
  if (!data?.demo) throw new Error("The panel builder returned nothing — try again.");
  return data;
}

/**
 * Ask the server for a panel about `quote`.
 * Returns { panel, cost, remainingBalance }; throws with a readable message.
 *
 * The audit runs here, and a failed audit gets ONE retry with the verdict fed
 * back. That matters because the reader has already been charged by the time
 * the audit runs: "you paid and got an error" is the worst outcome this
 * feature can produce, and the failures the audit catches — a dead dial, a
 * divide-by-zero at the end of a slider's range — are exactly the kind a model
 * fixes immediately once it is told which one it made. One retry, not a loop:
 * a second failure means the passage genuinely doesn't support a panel, and
 * spending more of the reader's credit to keep discovering that is not a
 * kindness.
 */
export async function generatePanel({ paperTitle, sectionLabel, quote, context }) {
  if (!functionsUrl) throw new Error("Panel building isn't configured for this deployment.");

  let spent = 0;
  let firstProblem = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await requestPanel({
      paperTitle, sectionLabel, quote, context,
      retryReason: attempt === 0 ? undefined : firstProblem,
    });
    spent += data.cost || 0;

    const panel = data.demo;   // { title, story, source, demo }
    const problem = auditPanel(panel);
    if (!problem) {
      return { panel, cost: spent, remainingBalance: data.remainingBalance };
    }

    if (attempt === 0) {
      console.warn("panel failed audit, retrying with the reason", problem);
      firstProblem = problem;
      continue;
    }

    // Both attempts failed. Report the SECOND verdict — it describes the
    // panel the reader actually didn't get — and the full cost of both.
    const e = new Error(`This passage didn't produce a working panel — ${problem}.`);
    e.code = "audit";
    e.cost = spent;
    e.remainingBalance = data.remainingBalance;
    throw e;
  }
}

