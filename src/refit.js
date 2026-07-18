/**
 * Reverse-engineering engine: fit the paper's reduced live model back onto the
 * curves digitized off the paper's own figures.
 *
 * A "fit target" is any result-figure panel that carries BOTH
 *   - digitized: series traced point-for-point off the real figure (ground truth)
 *   - computeJs: a live model kernel that plots in the same axes
 * The optimizer tunes the pipeline's slider parameters until the model lands on
 * the digitized data — recovering the parameter values the authors used, from
 * the published curve alone. Everything runs in the browser: the model is the
 * same reduced pipeline the Method Lab plays with.
 */

import {
  runSpec, compileResultFigures, makeFigureHelpers, runResultPanel,
} from "./engine.js";

/** Panels usable as fit targets. The FIRST digitized series is the truth curve
 *  the model's FIRST series chases (matching the overlay convention used by
 *  the Results Lab). */
export function extractFitTargets(spec) {
  const targets = [];
  (spec.resultFigures || []).forEach((fig, fi) => {
    (fig.panels || []).forEach((panel, pi) => {
      if (!panel.computeJs) return;
      const s = panel.digitized?.series?.[0];
      const points = (s?.points || []).filter(
        (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
      );
      if (points.length < 3) return;
      let lo = Infinity, hi = -Infinity;
      for (const [, y] of points) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      targets.push({
        id: `${fi}:${pi}`, figIndex: fi, panelIndex: pi,
        figureLabel: fig.figureLabel, figureTitle: fig.title,
        subplotLabel: panel.subplotLabel, xLabel: panel.xLabel, yLabel: panel.yLabel,
        panel, truthLabel: s.label, points, ySpan: Math.max(hi - lo, 1e-9),
      });
    });
  });
  return targets;
}

/** All slider definitions of the pipeline, flattened. */
export function fitParamDefs(spec) {
  return (spec.blocks || []).flatMap((b) => b.params || []);
}

function interp(xs, ys, x) {
  if (!xs || xs.length !== ys.length || xs.length < 2) return null;
  if (x < Math.min(xs[0], xs[xs.length - 1]) || x > Math.max(xs[0], xs[xs.length - 1])) return null;
  // xs from runResultPanel is monotone increasing in every panel we build
  let j = 0;
  while (j < xs.length - 2 && xs[j + 1] < x) j++;
  const x0 = xs[j], x1 = xs[j + 1];
  if (!(Number.isFinite(x0) && Number.isFinite(x1)) || x1 === x0) return ys[j];
  const t = (x - x0) / (x1 - x0);
  return ys[j] + t * (ys[j + 1] - ys[j]);
}

/**
 * Build the loss evaluator. Returns evalLoss(params) →
 *   { loss, per: {targetId: nrmsePct} }
 * where nrmsePct is the model↔truth RMS error as % of the truth curve's span
 * (0 = perfect overlay). `loss` is the mean across targets.
 */
export function makeLossFn(spec, pipelineCompiled, helpers, targets) {
  const figCompiled = compileResultFigures(spec);
  return (params) => {
    const run = runSpec(spec, pipelineCompiled, params, helpers);
    const per = {};
    if (run.error) {
      for (const t of targets) per[t.id] = 999;
      return { loss: 999, per };
    }
    const fh = makeFigureHelpers(spec, pipelineCompiled, helpers, params);
    let total = 0;
    for (const t of targets) {
      const fn = figCompiled.fns[t.id];
      const r = fn ? runResultPanel(fn, run.outputs, params, fh) : { error: "no kernel" };
      let nrmse = 999;
      if (!r.error && r.x && r.series?.[0]?.data) {
        let se = 0, n = 0;
        // Robust residual: cap each point's error at 1.5× the truth curve's
        // span. Log-scale models that dive off a cliff one grid step early
        // (e.g. a collapse voltage landing between samples) would otherwise
        // contribute a many-decade false residual that swamps the whole fit.
        const cap = 1.5 * t.ySpan;
        for (const [x, y] of t.points) {
          const m = interp(r.x, r.series[0].data, x);
          if (m != null && Number.isFinite(m)) {
            const e = Math.min(Math.abs(m - y), cap);
            se += e * e; n++;
          }
        }
        if (n >= 3) nrmse = (Math.sqrt(se / n) / t.ySpan) * 100;
      }
      per[t.id] = nrmse;
      total += nrmse;
    }
    return { loss: total / Math.max(1, targets.length), per };
  };
}

/** 0–100 “match” reading from an nrmse-% — what the scoreboard shows. */
export const matchPct = (nrmse) =>
  !Number.isFinite(nrmse) ? 0 : Math.max(0, Math.min(100, 100 - nrmse));

/** Snap a param set onto each slider's min/step lattice. */
export function snapToSteps(paramDefs, params) {
  const out = { ...params };
  for (const d of paramDefs) {
    const v = params[d.key];
    if (!Number.isFinite(v)) continue;
    const snapped = d.min + Math.round((v - d.min) / d.step) * d.step;
    out[d.key] = +Math.max(d.min, Math.min(d.max, snapped)).toFixed(6);
  }
  return out;
}

/** A visibly-wrong random start for the “scramble → recover” challenge:
 *  every param lands at least 20% of its range away from `avoid`. */
export function scrambleParams(paramDefs, avoid) {
  const out = {};
  for (const d of paramDefs) {
    const range = d.max - d.min || 1;
    let v = d.min + range * (0.08 + 0.84 * Math.random());
    if (avoid && Math.abs(v - avoid[d.key]) < 0.2 * range) {
      v = avoid[d.key] + (v >= avoid[d.key] ? 1 : -1) * 0.25 * range;
      v = Math.max(d.min, Math.min(d.max, v));
    }
    out[d.key] = +v.toFixed(6);
  }
  return snapToSteps(paramDefs, out);
}

/**
 * Bounded compass/pattern search in normalized [0,1] coordinates, written as a
 * generator so the UI can animate every improvement (sliders visibly walking
 * onto the paper's values). Deterministic given the start point; the model is
 * a handful of small array evaluations so hundreds of probes cost nothing.
 */
export function* patternSearchFit(paramDefs, startParams, evalLoss, opts = {}) {
  const { maxIters = 90, shrink = 0.55, initStep = 0.22, minStep = 0.001 } = opts;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const toParams = (v) => Object.fromEntries(
    paramDefs.map((d, i) => [d.key, +(d.min + v[i] * (d.max - d.min || 1)).toFixed(6)])
  );
  let v = paramDefs.map((d) =>
    clamp01(((startParams[d.key] ?? d.def) - d.min) / (d.max - d.min || 1))
  );
  let best = evalLoss(toParams(v));
  let step = initStep;
  for (let iter = 1; iter <= maxIters && step > minStep; iter++) {
    let improved = false;
    for (let i = 0; i < v.length; i++) {
      for (const dir of [1, -1]) {
        const w = v.slice();
        w[i] = clamp01(w[i] + dir * step);
        if (w[i] === v[i]) continue;
        const r = evalLoss(toParams(w));
        if (r.loss < best.loss - 1e-9) { v = w; best = r; improved = true; }
      }
    }
    if (!improved) step *= shrink;
    yield { params: toParams(v), loss: best.loss, per: best.per, step, iter, done: false };
  }
  // final polish: try snapping onto the sliders' own step lattice — the paper's
  // true values usually sit exactly on it, and a snapped recovery reads cleaner
  const raw = toParams(v);
  const snapped = snapToSteps(paramDefs, raw);
  const rs = evalLoss(snapped);
  if (rs.loss <= best.loss * 1.03 + 1e-9) {
    yield { params: snapped, loss: rs.loss, per: rs.per, step, iter: maxIters, done: true };
  } else {
    yield { params: raw, loss: best.loss, per: best.per, step, iter: maxIters, done: true };
  }
}
