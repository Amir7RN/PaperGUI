/**
 * DigitizerEditor — trace a paper's REAL result figure into accurate data.
 *
 * Multi-subplot aware: a figure like "Joint L1–L6, R1–R6" (12 panels) is traced
 * one subplot at a time. For each subplot you draw a box around its plot area,
 * calibrate its own axes (drag two ticks per axis + type their values), and add
 * one curve per plotted line (eyedrop + auto-trace, or click points). Auto-trace
 * is constrained to the active subplot's box, so neighbouring subplots don't
 * bleed in. Saving turns each subplot into its own interactive panel whose
 * locked real curve renders with the live model overlaid (see PanelChart).
 *
 * Positions live in the image's FRACTION space (0..1), so calibration set on the
 * on-screen preview stays valid for the natural-resolution pixel read.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Crosshair, Pipette, MousePointerClick, Wand2, Trash2, Plus, Save, Copy, Check, SquareDashedMousePointer,
} from "lucide-react";
import {
  makeCalibration, autoTraceColor, sampleColor, hexToRgb, rgbToHex,
  fracPointsToData, bboxFracToCropFrac, buildColorLUT, readHeatmapGrid,
} from "./digitizer.js";

const CURVE_HUES = ["#2a78d6", "#1baf7a", "#eda100", "#e34948", "#4a3aa7", "#e87ba4"];
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
let SUB_ID = 0;

/** Default calibration marks placed inside a region (or the whole image). */
function defaultCal(region) {
  const r = region || { fx0: 0.1, fy0: 0.1, fx1: 0.9, fy1: 0.9 };
  const w = r.fx1 - r.fx0, h = r.fy1 - r.fy0;
  return {
    xA: { f: r.fx0 + 0.06 * w, val: 0 }, xB: { f: r.fx1 - 0.02 * w, val: 1 },
    yA: { f: r.fy1 - 0.04 * h, val: 0 }, yB: { f: r.fy0 + 0.04 * h, val: 1 },
  };
}

function newSubplot(label, region) {
  return {
    id: ++SUB_ID, label: label || `subplot ${SUB_ID}`, xLabel: "x", yLabel: "y",
    region: region || null, xLog: false, yLog: false,
    cal: defaultCal(region), curves: [{ label: "curve 1", colorHex: CURVE_HUES[0], tol: 0.12, points: [] }],
    activeCurve: 0, kind: "line", radar: null, box: null, heatmap: null, violin: null,
  };
}

/** Lazily-initialised radar extraction state for a subplot. */
function ensureRadar(s) {
  return s.radar || {
    center: null, ref: { fx: null, fy: null, val: 1 },
    axes: [{ name: "axis 1" }, { name: "axis 2" }, { name: "axis 3" }],
    series: [{ label: "series 1", vertices: [null, null, null] }],
    activeSeries: 0,
  };
}
/** Lazily-initialised box-plot extraction state (Y-calibration is shared via
 *  sub.cal.yA/yB; each category carries five clicked levels). */
function ensureBox(s) {
  return s.box || {
    categories: [{ name: "cat 1", levels: { min: null, q1: null, med: null, q3: null, max: null } }],
    activeCat: 0,
  };
}
const BOX_LEVELS = ["max", "q3", "med", "q1", "min"];
/** Lazily-initialised heat-map extraction state. */
function ensureHeatmap(s) {
  return s.heatmap || {
    barLow: null, barHigh: null, lowVal: 0, highVal: 1,
    gridRegion: null, nRows: 3, nCols: 3, grid: null,
    rowLabels: "", colLabels: "",
  };
}
/** Lazily-initialised violin extraction state (Y calibration shared via cal). */
function ensureViolin(s) {
  return s.violin || {
    categories: [{ name: "cat 1", centreFx: null, points: [] }],
    activeCat: 0,
  };
}
const CHART_KINDS = [
  { k: "line", label: "line / scatter" },
  { k: "radar", label: "radar / spider" },
  { k: "box", label: "box plot" },
  { k: "heatmap", label: "heat map" },
  { k: "violin", label: "violin plot" },
];

/** Linear (or log) map of a y fraction → data value using two Y reference marks. */
function yValueOf(cal, fy, yLog) {
  const v0 = parseFloat(cal.yA.val), v1 = parseFloat(cal.yB.val);
  const f0 = cal.yA.f, f1 = cal.yB.f;
  if (f0 === f1 || !Number.isFinite(v0) || !Number.isFinite(v1)) return NaN;
  const t = (fy - f0) / (f1 - f0);
  if (yLog) {
    if (v0 <= 0 || v1 <= 0) return NaN;
    return Math.pow(10, Math.log10(v0) + t * (Math.log10(v1) - Math.log10(v0)));
  }
  return v0 + t * (v1 - v0);
}

/** Seed subplots when re-opening a figure already traced, or from the vision
 *  model's per-figure digitizeHint, or a single blank subplot. */
function seedSubplots(fig) {
  const traced = (fig?.panels || []).filter((p) => p.digitized);
  if (traced.length) {
    return traced.map((p, i) => ({
      id: ++SUB_ID, label: p.subplotLabel || `subplot ${i + 1}`,
      xLabel: p.xLabel || "x", yLabel: p.yLabel || "y",
      region: p.digitized.region || null,
      xLog: !!p.digitized.xLog, yLog: !!p.digitized.yLog,
      cal: p.digitized.cal || defaultCal(p.digitized.region),
      curves: (p.digitized.series || []).map((s, k) => ({
        label: s.label, colorHex: CURVE_HUES[k % CURVE_HUES.length], tol: 0.12, points: [],
      })) || [{ label: "curve 1", colorHex: CURVE_HUES[0], tol: 0.12, points: [] }],
      activeCurve: 0,
    }));
  }
  const h = fig?.digitizeHint;
  if (h?.xTicks?.length >= 2 && h?.yTicks?.length >= 2) {
    const bw = fig?.bbox?.w, bh = fig?.bbox?.h;
    const cx = (f) => (Number.isFinite(bw) ? bboxFracToCropFrac(f, bw) : f);
    const cy = (f) => (Number.isFinite(bh) ? bboxFracToCropFrac(f, bh) : f);
    const s = newSubplot(h.xLabel ? `${h.xLabel} vs ${h.yLabel}` : "subplot 1", null);
    s.xLabel = h.xLabel || "x"; s.yLabel = h.yLabel || "y";
    s.xLog = !!h.xLog; s.yLog = !!h.yLog;
    s.cal = {
      xA: { f: cx(h.xTicks[0].atFrac), val: h.xTicks[0].value },
      xB: { f: cx(h.xTicks[h.xTicks.length - 1].atFrac), val: h.xTicks[h.xTicks.length - 1].value },
      yA: { f: cy(h.yTicks[0].atFrac), val: h.yTicks[0].value },
      yB: { f: cy(h.yTicks[h.yTicks.length - 1].atFrac), val: h.yTicks[h.yTicks.length - 1].value },
    };
    if (h.curves?.length) s.curves = h.curves.map((c, i) => ({
      label: c.label || `curve ${i + 1}`, colorHex: c.colorHex || CURVE_HUES[i % CURVE_HUES.length], tol: 0.12, points: [],
    }));
    return [s];
  }
  return [newSubplot("subplot 1", null)];
}

/** Radar extraction: click the centre, click a ring point of known value (sets
 *  the radial scale), name the axes, then click each series' vertex per axis. */
function RadarControls({ sub, mode, setMode, patchSub }) {
  const r = ensureRadar(sub);
  const si = r.activeSeries || 0;
  const setR = (patch) => patchSub((s) => ({ ...s, radar: { ...ensureRadar(s), ...(typeof patch === "function" ? patch(ensureRadar(s)) : patch) } }));
  const addAxis = () => setR((rd) => ({ axes: [...rd.axes, { name: `axis ${rd.axes.length + 1}` }], series: rd.series.map((se) => ({ ...se, vertices: [...se.vertices, null] })) }));
  const rmAxis = (ai) => setR((rd) => ({ axes: rd.axes.filter((_, k) => k !== ai), series: rd.series.map((se) => ({ ...se, vertices: se.vertices.filter((_, k) => k !== ai) })) }));
  const addSeries = () => setR((rd) => ({ series: [...rd.series, { label: `series ${rd.series.length + 1}`, vertices: rd.axes.map(() => null) }], activeSeries: rd.series.length }));

  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-300">Radar calibration</div>
      <div className="mb-2 flex gap-1.5">
        <button onClick={() => setMode("rcenter")} className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] ${mode === "rcenter" ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
          <Crosshair size={11} /> {r.center ? "Re-set" : "Set"} centre
        </button>
        <button onClick={() => setMode("rref")} className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] ${mode === "rref" ? "bg-amber-500 text-slate-900" : "bg-slate-700 hover:bg-slate-600"}`}>
          <Crosshair size={11} /> {Number.isFinite(r.ref?.fx) ? "Re-set" : "Set"} ring
        </button>
        <input type="number" value={r.ref?.val ?? 1} title="value at the ring you clicked"
          onChange={(e) => setR((rd) => ({ ref: { ...rd.ref, val: e.target.value } }))}
          className="w-16 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-300">Axes</span>
        <button onClick={addAxis} className="flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-[11px] hover:bg-slate-600"><Plus size={10} /> Add</button>
      </div>
      {r.axes.map((a, ai) => (
        <div key={ai} className="mb-1 flex items-center gap-1.5">
          <input value={a.name} onChange={(e) => setR((rd) => ({ axes: rd.axes.map((x, k) => k === ai ? { name: e.target.value } : x) }))}
            className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
          <button onClick={() => setMode(`rv:${si}:${ai}`)}
            className={`shrink-0 rounded px-2 py-0.5 text-[10px] ${mode === `rv:${si}:${ai}` ? "bg-emerald-500 text-slate-900" : r.series[si]?.vertices[ai] ? "bg-emerald-700 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
            {r.series[si]?.vertices[ai] ? "✓ vertex" : "click"}
          </button>
          {r.axes.length > 3 && <button onClick={() => rmAxis(ai)} className="shrink-0 rounded p-1 text-slate-400 hover:text-red-400"><Trash2 size={11} /></button>}
        </div>
      ))}

      <div className="mb-2 mt-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-300">Series (click a tab, then set its vertices above)</span>
        <button onClick={addSeries} className="flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-[11px] hover:bg-slate-600"><Plus size={10} /> Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {r.series.map((se, k) => (
          <span key={k} onClick={() => setR({ activeSeries: k })}
            className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] ${k === si ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
            <input value={se.label} onClick={(e) => e.stopPropagation()} onChange={(e) => setR((rd) => ({ series: rd.series.map((x, j) => j === k ? { ...x, label: e.target.value } : x) }))}
              className="w-20 bg-transparent focus:outline-none" />
            {r.series.length > 1 && <button onClick={(e) => { e.stopPropagation(); setR((rd) => ({ series: rd.series.filter((_, j) => j !== k), activeSeries: 0 })); }}><X size={9} /></button>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Box-plot extraction: calibrate the Y axis once, then per category click the
 *  five levels (max / Q3 / median / Q1 / min) off the figure. */
function BoxControls({ sub, mode, setMode, patchSub }) {
  const b = ensureBox(sub);
  const ci = b.activeCat || 0;
  const cat = b.categories[ci];
  const setBox = (patch) => patchSub((s) => ({ ...s, box: { ...ensureBox(s), ...(typeof patch === "function" ? patch(ensureBox(s)) : patch) } }));
  const yv = (lvl) => (cat?.levels[lvl] ? yValueOf(sub.cal, cat.levels[lvl].fy, sub.yLog) : null);

  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-300">Calibrate Y axis</div>
      {[["yA", "Y ref A", sub.cal.yA], ["yB", "Y ref B", sub.cal.yB]].map(([k, label, ref]) => (
        <div key={k} className="mb-1.5 flex items-center gap-2">
          <button onClick={() => setMode(k)} className={`flex w-20 shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${mode === k ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
            <Crosshair size={11} /> {label}
          </button>
          <input type="number" value={ref.val}
            onChange={(e) => patchSub((s) => ({ ...s, cal: { ...s.cal, [k]: { ...s.cal[k], val: e.target.value } } }))}
            placeholder="value at tick"
            className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
        </div>
      ))}
      <label className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={sub.yLog} onChange={(e) => patchSub({ yLog: e.target.checked })} /> Y log</label>

      <div className="mb-2 mt-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-300">Categories</span>
        <button onClick={() => setBox((bx) => ({ categories: [...bx.categories, { name: `cat ${bx.categories.length + 1}`, levels: { min: null, q1: null, med: null, q3: null, max: null } }], activeCat: bx.categories.length }))}
          className="flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-[11px] hover:bg-slate-600"><Plus size={10} /> Add</button>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {b.categories.map((c, k) => (
          <span key={k} onClick={() => setBox({ activeCat: k })}
            className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] ${k === ci ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
            <input value={c.name} onClick={(e) => e.stopPropagation()} onChange={(e) => setBox((bx) => ({ categories: bx.categories.map((x, j) => j === k ? { ...x, name: e.target.value } : x) }))}
              className="w-16 bg-transparent focus:outline-none" />
            {b.categories.length > 1 && <button onClick={(e) => { e.stopPropagation(); setBox((bx) => ({ categories: bx.categories.filter((_, j) => j !== k), activeCat: 0 })); }}><X size={9} /></button>}
          </span>
        ))}
      </div>
      <div className="text-[11px] text-slate-400">Click a level, then click the figure at that height ({cat?.name}):</div>
      {BOX_LEVELS.map((lvl) => (
        <div key={lvl} className="mt-1 flex items-center gap-2">
          <button onClick={() => setMode(`bx:${ci}:${lvl}`)}
            className={`w-16 shrink-0 rounded px-2 py-1 text-[11px] font-medium ${mode === `bx:${ci}:${lvl}` ? "bg-emerald-500 text-slate-900" : cat?.levels[lvl] ? "bg-emerald-700 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
            {lvl}
          </button>
          <span className="text-[11px] tabular-nums text-slate-400">{Number.isFinite(yv(lvl)) ? yv(lvl).toPrecision(3) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

/** Heat-map extraction: calibrate the colour bar (low+high ends with values),
 *  draw a box around the grid, set its rows×cols, then read every cell colour. */
function HeatmapControls({ sub, mode, setMode, patchSub, readHeatmap, imageData }) {
  const h = ensureHeatmap(sub);
  const setH = (patch) => patchSub((s) => ({ ...s, heatmap: { ...ensureHeatmap(s), ...(typeof patch === "function" ? patch(ensureHeatmap(s)) : patch) } }));
  const ready = h.barLow && h.barHigh && h.gridRegion && imageData;
  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-300">Colour-bar calibration</div>
      <div className="mb-1.5 flex items-center gap-2">
        <button onClick={() => setMode("hlow")} className={`w-24 shrink-0 rounded px-2 py-1 text-[11px] ${mode === "hlow" ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>{h.barLow ? "✓ " : ""}bar low</button>
        <input type="number" value={h.lowVal} onChange={(e) => setH({ lowVal: e.target.value })} placeholder="low value"
          className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
      </div>
      <div className="mb-2 flex items-center gap-2">
        <button onClick={() => setMode("hhigh")} className={`w-24 shrink-0 rounded px-2 py-1 text-[11px] ${mode === "hhigh" ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>{h.barHigh ? "✓ " : ""}bar high</button>
        <input type="number" value={h.highVal} onChange={(e) => setH({ highVal: e.target.value })} placeholder="high value"
          className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
      </div>

      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-300">Grid</div>
      <button onClick={() => setMode(mode === "hregion" ? "idle" : "hregion")}
        className={`mb-2 flex w-full items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium ${mode === "hregion" ? "bg-amber-500 text-slate-900" : "bg-slate-700 hover:bg-slate-600"}`}>
        <SquareDashedMousePointer size={12} /> {h.gridRegion ? "Redraw" : "Draw"} box around the grid cells
      </button>
      <div className="mb-2 flex gap-2">
        <label className="flex flex-1 items-center gap-1 text-[11px] text-slate-400">rows
          <input type="number" min="1" max="40" value={h.nRows} onChange={(e) => setH({ nRows: Math.max(1, Math.min(40, +e.target.value || 1)) })}
            className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white focus:border-blue-400 focus:outline-none" /></label>
        <label className="flex flex-1 items-center gap-1 text-[11px] text-slate-400">cols
          <input type="number" min="1" max="40" value={h.nCols} onChange={(e) => setH({ nCols: Math.max(1, Math.min(40, +e.target.value || 1)) })}
            className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white focus:border-blue-400 focus:outline-none" /></label>
      </div>
      <input value={h.rowLabels} onChange={(e) => setH({ rowLabels: e.target.value })} placeholder="row labels (comma-separated, optional)"
        className="mb-1.5 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
      <input value={h.colLabels} onChange={(e) => setH({ colLabels: e.target.value })} placeholder="column labels (comma-separated, optional)"
        className="mb-2 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
      <button onClick={readHeatmap} disabled={!ready}
        className="flex w-full items-center justify-center gap-1.5 rounded bg-emerald-700 px-2 py-1.5 text-[11px] font-medium hover:bg-emerald-600 disabled:opacity-40">
        <Wand2 size={12} /> Read cell colours → values
      </button>
      {h.grid && <p className="mt-1 text-[11px] text-emerald-400">Read {h.grid.length}×{h.grid[0]?.length} cells.</p>}
    </div>
  );
}

/** Violin extraction: calibrate Y, then per category click the centre line and
 *  click points down the RIGHT outline (density width). It's mirrored on render. */
function ViolinControls({ sub, mode, setMode, patchSub }) {
  const vi = ensureViolin(sub);
  const ci = vi.activeCat || 0;
  const cat = vi.categories[ci];
  const setV = (patch) => patchSub((s) => ({ ...s, violin: { ...ensureViolin(s), ...(typeof patch === "function" ? patch(ensureViolin(s)) : patch) } }));
  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-300">Calibrate Y axis</div>
      {[["yA", "Y ref A", sub.cal.yA], ["yB", "Y ref B", sub.cal.yB]].map(([k, label, ref]) => (
        <div key={k} className="mb-1.5 flex items-center gap-2">
          <button onClick={() => setMode(k)} className={`flex w-20 shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${mode === k ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
            <Crosshair size={11} /> {label}
          </button>
          <input type="number" value={ref.val} onChange={(e) => patchSub((s) => ({ ...s, cal: { ...s.cal, [k]: { ...s.cal[k], val: e.target.value } } }))}
            placeholder="value at tick" className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
        </div>
      ))}

      <div className="mb-2 mt-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-300">Categories</span>
        <button onClick={() => setV((v) => ({ categories: [...v.categories, { name: `cat ${v.categories.length + 1}`, centreFx: null, points: [] }], activeCat: v.categories.length }))}
          className="flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-[11px] hover:bg-slate-600"><Plus size={10} /> Add</button>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {vi.categories.map((c, k) => (
          <span key={k} onClick={() => setV({ activeCat: k })}
            className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] ${k === ci ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
            <input value={c.name} onClick={(e) => e.stopPropagation()} onChange={(e) => setV((v) => ({ categories: v.categories.map((x, j) => j === k ? { ...x, name: e.target.value } : x) }))}
              className="w-16 bg-transparent focus:outline-none" />
            {vi.categories.length > 1 && <button onClick={(e) => { e.stopPropagation(); setV((v) => ({ categories: v.categories.filter((_, j) => j !== k), activeCat: 0 })); }}><X size={9} /></button>}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setMode(`vc:${ci}`)} className={`rounded px-2 py-1 text-[11px] ${mode === `vc:${ci}` ? "bg-blue-600 text-white" : cat?.centreFx != null ? "bg-emerald-700 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
          {cat?.centreFx != null ? "✓ centre" : "Set centre line"}
        </button>
        <button onClick={() => setMode(mode === `vp:${ci}` ? "idle" : `vp:${ci}`)} className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${mode === `vp:${ci}` ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
          <MousePointerClick size={11} /> Click right outline ({cat?.points.length || 0})
        </button>
        <button onClick={() => setV((v) => ({ categories: v.categories.map((x, j) => j === ci ? { ...x, points: [] } : x) }))} className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-[11px] hover:bg-slate-600"><Trash2 size={11} /> Clear</button>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Click the centre, then click points down the right edge of the shape — it's mirrored to the left automatically.</p>
    </div>
  );
}

export default function DigitizerEditor({ fig, onSave, onClose }) {
  const imgRef = useRef(null);
  const [imgNat, setImgNat] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [subs, setSubs] = useState(() => seedSubplots(fig));
  const [activeSub, setActiveSub] = useState(0);
  const [mode, setMode] = useState("idle"); // idle | region | xA|xB|yA|yB | eyedrop | points
  const [dragRect, setDragRect] = useState(null); // live region preview
  const [copied, setCopied] = useState(false);

  const sub = subs[Math.min(activeSub, subs.length - 1)];

  useEffect(() => {
    if (!fig?.image) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      setImgNat({ w: img.naturalWidth, h: img.naturalHeight });
      try { setImageData(ctx.getImageData(0, 0, c.width, c.height)); } catch { setImageData(null); }
    };
    img.src = fig.image;
  }, [fig]);

  const fracFromEvent = (e) => {
    const r = imgRef.current.getBoundingClientRect();
    return {
      fx: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      fy: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };

  const patchSub = (patch) => setSubs((ss) => ss.map((s, i) =>
    i !== activeSub ? s : { ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
  const patchCurve = (ci, patch) => patchSub((s) => ({
    ...s, curves: s.curves.map((cv, k) => (k !== ci ? cv : { ...cv, ...(typeof patch === "function" ? patch(cv) : patch) })),
  }));

  // ---- pointer handling: region drag vs. click actions ----
  const isRegionMode = (m) => m === "region" || m === "hregion";
  const onDown = (e) => {
    if (!isRegionMode(mode)) return;
    e.preventDefault();
    const p = fracFromEvent(e);
    setDragRect({ fx0: p.fx, fy0: p.fy, fx1: p.fx, fy1: p.fy });
  };
  const onMove = (e) => {
    if (!isRegionMode(mode) || !dragRect) return;
    const p = fracFromEvent(e);
    setDragRect((d) => ({ ...d, fx1: p.fx, fy1: p.fy }));
  };
  const onUp = () => {
    if (!isRegionMode(mode) || !dragRect) return;
    const region = {
      fx0: Math.min(dragRect.fx0, dragRect.fx1), fy0: Math.min(dragRect.fy0, dragRect.fy1),
      fx1: Math.max(dragRect.fx0, dragRect.fx1), fy1: Math.max(dragRect.fy0, dragRect.fy1),
    };
    if (region.fx1 - region.fx0 > 0.02 && region.fy1 - region.fy0 > 0.02) {
      if (mode === "hregion") patchSub((s) => ({ ...s, heatmap: { ...ensureHeatmap(s), gridRegion: region } }));
      else patchSub((s) => ({ ...s, region, cal: defaultCal(region) }));
    }
    setDragRect(null); setMode("idle");
  };

  const onClick = (e) => {
    if (mode === "region") return; // handled by drag
    const { fx, fy } = fracFromEvent(e);
    if (mode === "xA" || mode === "xB") { patchSub((s) => ({ ...s, cal: { ...s.cal, [mode]: { ...s.cal[mode], f: fx } } })); setMode("idle"); }
    else if (mode === "yA" || mode === "yB") { patchSub((s) => ({ ...s, cal: { ...s.cal, [mode]: { ...s.cal[mode], f: fy } } })); setMode("idle"); }
    else if (mode === "eyedrop") {
      if (imageData) patchCurve(sub.activeCurve, { colorHex: rgbToHex(sampleColor(imageData, fx, fy)) });
      setMode("idle");
    } else if (mode === "points") {
      patchCurve(sub.activeCurve, (cv) => ({ points: [...cv.points, { fx, fy }].sort((a, b) => a.fx - b.fx) }));
    }
    // ---- radar ----
    else if (mode === "rcenter") { patchSub((s) => ({ ...s, radar: { ...ensureRadar(s), center: { fx, fy } } })); setMode("idle"); }
    else if (mode === "rref") { patchSub((s) => { const r = ensureRadar(s); return { ...s, radar: { ...r, ref: { ...r.ref, fx, fy } } }; }); setMode("idle"); }
    else if (mode.startsWith("rv:")) {
      const [, si, ai] = mode.split(":").map(Number);
      patchSub((s) => {
        const r = ensureRadar(s);
        const series = r.series.map((se, k) => k !== si ? se : { ...se, vertices: se.vertices.map((v, j) => j !== ai ? v : { fx, fy }) });
        return { ...s, radar: { ...r, series } };
      });
      setMode("idle");
    }
    // ---- box: bx:<catIndex>:<level> ----
    else if (mode.startsWith("bx:")) {
      const [, ci, lvl] = mode.split(":");
      patchSub((s) => {
        const b = ensureBox(s);
        const categories = b.categories.map((c, k) => k !== +ci ? c : { ...c, levels: { ...c.levels, [lvl]: { fy } } });
        return { ...s, box: { ...b, categories } };
      });
      setMode("idle");
    }
    // ---- heatmap colour-bar endpoints ----
    else if (mode === "hlow") { patchSub((s) => ({ ...s, heatmap: { ...ensureHeatmap(s), barLow: { fx, fy } } })); setMode("idle"); }
    else if (mode === "hhigh") { patchSub((s) => ({ ...s, heatmap: { ...ensureHeatmap(s), barHigh: { fx, fy } } })); setMode("idle"); }
    // ---- violin: vc:<catIndex> (centre) · vp:<catIndex> (outline point) ----
    else if (mode.startsWith("vc:")) {
      const ci = +mode.split(":")[1];
      patchSub((s) => { const vi = ensureViolin(s); return { ...s, violin: { ...vi, categories: vi.categories.map((c, k) => k !== ci ? c : { ...c, centreFx: fx }) } }; });
      setMode("idle");
    } else if (mode.startsWith("vp:")) {
      const ci = +mode.split(":")[1];
      patchSub((s) => { const vi = ensureViolin(s); return { ...s, violin: { ...vi, categories: vi.categories.map((c, k) => k !== ci ? c : { ...c, points: [...c.points, { fx, fy }] }) } }; });
    }
  };

  /** Sample the colour bar + grid to fill the heat-map values. */
  const readHeatmap = () => {
    const h = sub.heatmap;
    if (!imageData || !h?.barLow || !h?.barHigh || !h?.gridRegion) return;
    const lut = buildColorLUT(imageData, h.barLow, h.barHigh, num(h.lowVal, 0), num(h.highVal, 1));
    const grid = readHeatmapGrid(imageData, h.gridRegion, h.nRows, h.nCols, lut);
    patchSub((s) => ({ ...s, heatmap: { ...ensureHeatmap(s), grid } }));
  };

  const autoTrace = (ci) => {
    if (!imageData) return;
    const cv = sub.curves[ci];
    const rgb = hexToRgb(cv.colorHex);
    if (!rgb) return;
    const pts = autoTraceColor(imageData, rgb, { tol: cv.tol, region: sub.region, xStep: 2 });
    patchCurve(ci, { points: pts });
  };

  // ---- per-subplot calibration + built data ----
  const calOf = (s) => makeCalibration({
    xRef: [{ f: s.cal.xA.f, val: num(s.cal.xA.val) }, { f: s.cal.xB.f, val: num(s.cal.xB.val) }],
    yRef: [{ f: s.cal.yA.f, val: num(s.cal.yA.val) }, { f: s.cal.yB.f, val: num(s.cal.yB.val) }],
    xLog: s.xLog, yLog: s.yLog,
  });
  const calibration = useMemo(() => calOf(sub), [sub]);
  const dataSeries = useMemo(() => sub.curves.map((cv) => ({
    label: cv.label, colorHex: cv.colorHex, data: calibration ? fracPointsToData(cv.points, calibration) : [],
  })), [sub, calibration]);

  /** One built panel per subplot with valid extracted data (kind-specific). */
  const builtPanels = useMemo(() => subs.map((s) => {
    const src = `Traced from ${fig?.figureLabel || "the figure"} — ${s.label}`;
    if (s.kind === "radar") {
      const r = s.radar;
      if (!r?.center || !Number.isFinite(r.ref?.fx)) return null;
      const refR = Math.hypot(r.ref.fx - r.center.fx, r.ref.fy - r.center.fy);
      const refVal = num(r.ref.val, 1);
      if (!(refR > 0)) return null;
      const toVal = (v) => (v ? (Math.hypot(v.fx - r.center.fx, v.fy - r.center.fy) / refR) * refVal : 0);
      const series = r.series
        .map((se) => ({ label: se.label, values: se.vertices.map(toVal) }))
        .filter((se) => se.values.some((x) => Math.abs(x) > 1e-9));
      if (!series.length || r.axes.length < 3) return null;
      return {
        subplotLabel: s.label, xLabel: s.xLabel, yLabel: s.yLabel, chartKind: "radar", dataSource: "digitized",
        digitized: { kind: "radar", source: src, axes: r.axes.map((a) => ({ name: a.name })), series },
      };
    }
    if (s.kind === "box") {
      const yv = (lvl) => (lvl ? yValueOf(s.cal, lvl.fy, s.yLog) : null);
      const cats = (s.box?.categories || []).map((cat) => ({
        name: cat.name,
        box: { min: yv(cat.levels.min), q1: yv(cat.levels.q1), med: yv(cat.levels.med), q3: yv(cat.levels.q3), max: yv(cat.levels.max) },
      })).filter((c) => [c.box.q1, c.box.med, c.box.q3].every(Number.isFinite));
      if (!cats.length) return null;
      cats.forEach((c) => {
        if (!Number.isFinite(c.box.min)) c.box.min = c.box.q1;
        if (!Number.isFinite(c.box.max)) c.box.max = c.box.q3;
      });
      return {
        subplotLabel: s.label, xLabel: s.xLabel, yLabel: s.yLabel, chartKind: "box", dataSource: "digitized",
        digitized: { kind: "box", source: src, yLog: s.yLog, categories: cats },
      };
    }
    if (s.kind === "violin") {
      const vi = s.violin;
      const cats = (vi?.categories || []).map((c) => {
        if (!Number.isFinite(c.centreFx) || c.points.length < 2) return null;
        const dist = c.points
          .map((p) => ({ y: yValueOf(s.cal, p.fy, s.yLog), w: Math.abs(p.fx - c.centreFx) }))
          .filter((d) => Number.isFinite(d.y))
          .sort((a, b) => a.y - b.y);
        return dist.length >= 2 ? { name: c.name, dist } : null;
      }).filter(Boolean);
      if (!cats.length) return null;
      // normalise half-widths so the widest point across all violins = 1
      let wmax = 0;
      for (const c of cats) for (const d of c.dist) wmax = Math.max(wmax, d.w);
      if (wmax > 0) for (const c of cats) for (const d of c.dist) d.w /= wmax;
      return {
        subplotLabel: s.label, xLabel: s.xLabel, yLabel: s.yLabel, chartKind: "violin", dataSource: "digitized",
        digitized: { kind: "violin", source: src, yLog: s.yLog, categories: cats },
      };
    }
    if (s.kind === "heatmap") {
      const h = s.heatmap;
      if (!h?.grid?.length) return null;
      let lo = Infinity, hi = -Infinity;
      for (const row of h.grid) for (const v of row) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (!Number.isFinite(lo)) return null;
      const labs = (str, n) => { const a = String(str || "").split(",").map((x) => x.trim()).filter(Boolean); return Array.from({ length: n }, (_, i) => a[i] || `${i + 1}`); };
      return {
        subplotLabel: s.label, xLabel: s.xLabel, yLabel: s.yLabel, chartKind: "heatmap", dataSource: "digitized",
        digitized: { kind: "heatmap", source: src, grid: h.grid, min: lo, max: hi,
          rows: labs(h.rowLabels, h.grid.length), cols: labs(h.colLabels, h.grid[0].length) },
      };
    }
    // default: line / scatter
    const cal = calOf(s);
    if (!cal) return null;
    const series = s.curves
      .map((cv) => ({ label: cv.label, points: fracPointsToData(cv.points, cal) }))
      .filter((x) => x.points.length > 1);
    if (!series.length) return null;
    return {
      subplotLabel: s.label, xLabel: s.xLabel, yLabel: s.yLabel, chartKind: "line", dataSource: "digitized",
      digitized: {
        kind: "line", source: src,
        xLog: s.xLog, yLog: s.yLog, region: s.region, cal: s.cal, series,
      },
    };
  }).filter(Boolean), [subs, fig]);

  const canSave = builtPanels.length > 0;
  const doSave = () => { if (canSave) onSave(builtPanels); };
  const doCopy = () => navigator.clipboard?.writeText(JSON.stringify(builtPanels, null, 2))
    .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });

  const pct = (f) => `${(f * 100).toFixed(2)}%`;
  const regionBox = (r, active) => r && (
    <div className={`pointer-events-none absolute border-2 ${active ? "border-amber-400" : "border-white/40"}`}
      style={{ left: pct(r.fx0), top: pct(r.fy0), width: pct(r.fx1 - r.fx0), height: pct(r.fy1 - r.fy0) }} />
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2.5 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Crosshair size={16} className="text-blue-400" />
          Trace the real figure — {fig?.figureLabel} · {subs.length} subplot{subs.length === 1 ? "" : "s"}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10"><X size={18} /></button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* image + overlay */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[repeating-conic-gradient(#0f172a_0%_25%,#1e293b_0%_50%)] bg-[length:24px_24px] p-4">
          <div className="relative inline-block" style={{ maxWidth: "100%" }}>
            {fig?.image ? (
              <img
                ref={imgRef} src={fig.image} alt="figure to trace"
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onClick={onClick}
                className={`block max-h-[74vh] w-auto max-w-full select-none ${mode !== "idle" ? "cursor-crosshair" : ""}`}
                draggable={false}
              />
            ) : <div className="p-10 text-slate-400">No figure image to trace.</div>}

            {imgRef.current && (
              <>
                {/* all subplot regions; active highlighted */}
                {subs.map((s, i) => <React.Fragment key={s.id}>{regionBox(s.region, i === activeSub)}</React.Fragment>)}
                {dragRect && regionBox(dragRect, true)}

                {sub.kind === "radar" ? (() => {
                  const r = sub.radar || {};
                  const dot = (p, cls, key) => p && Number.isFinite(p.fx) && (
                    <span key={key} className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${cls}`}
                      style={{ left: pct(p.fx), top: pct(p.fy) }} />
                  );
                  const active = r.series?.[r.activeSeries];
                  return (
                    <>
                      {dot(r.center, "bg-blue-500", "c")}
                      {dot(r.ref, "bg-amber-400", "r")}
                      {active?.vertices?.map((v, i) => dot(v, "bg-emerald-500", `v${i}`))}
                    </>
                  );
                })() : sub.kind === "box" ? (() => {
                  const b = sub.box || {};
                  const cat = b.categories?.[b.activeCat];
                  return (
                    <>
                      <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-emerald-400/80" style={{ top: pct(sub.cal.yA.f) }} />
                      <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-emerald-400/80" style={{ top: pct(sub.cal.yB.f) }} />
                      {cat && BOX_LEVELS.map((lvl) => cat.levels[lvl] && (
                        <div key={lvl} className="pointer-events-none absolute inset-x-0 flex items-center" style={{ top: pct(cat.levels[lvl].fy) }}>
                          <span className="h-0.5 w-full bg-blue-500/70" />
                          <span className="absolute left-1 rounded bg-blue-600 px-1 text-[8px] font-bold text-white">{lvl}</span>
                        </div>
                      ))}
                    </>
                  );
                })() : sub.kind === "heatmap" ? (() => {
                  const h = sub.heatmap || {};
                  const dot = (p, cls, key) => p && Number.isFinite(p.fx) && (
                    <span key={key} className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${cls}`}
                      style={{ left: pct(p.fx), top: pct(p.fy) }} />
                  );
                  return (
                    <>
                      {regionBox(h.gridRegion, true)}
                      {dot(h.barLow, "bg-slate-300", "lo")}
                      {dot(h.barHigh, "bg-slate-900", "hi")}
                    </>
                  );
                })() : sub.kind === "violin" ? (() => {
                  const vi = sub.violin || {};
                  const cat = vi.categories?.[vi.activeCat];
                  return (
                    <>
                      <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-emerald-400/80" style={{ top: pct(sub.cal.yA.f) }} />
                      <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-emerald-400/80" style={{ top: pct(sub.cal.yB.f) }} />
                      {cat && Number.isFinite(cat.centreFx) && <div className="pointer-events-none absolute inset-y-0 border-l-2 border-blue-400/80" style={{ left: pct(cat.centreFx) }} />}
                      {cat?.points.map((p, i) => (
                        <span key={i} className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500 ring-1 ring-white"
                          style={{ left: pct(p.fx), top: pct(p.fy) }} />
                      ))}
                    </>
                  );
                })() : (
                  <>
                    {/* line calibration marks + traced points */}
                    <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-blue-400/80" style={{ left: pct(sub.cal.xA.f) }} />
                    <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-blue-400/80" style={{ left: pct(sub.cal.xB.f) }} />
                    <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-emerald-400/80" style={{ top: pct(sub.cal.yA.f) }} />
                    <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-emerald-400/80" style={{ top: pct(sub.cal.yB.f) }} />
                    {sub.curves[sub.activeCurve]?.points.map((p, i) => (
                      <span key={i} className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-white"
                        style={{ left: pct(p.fx), top: pct(p.fy), background: sub.curves[sub.activeCurve].colorHex }} />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* controls */}
        <div className="w-full shrink-0 overflow-y-auto border-t border-slate-700 bg-slate-800 p-4 text-slate-200 lg:w-[380px] lg:border-l lg:border-t-0">
          {/* subplot tabs */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Subplots</span>
              <button onClick={() => { setSubs((ss) => [...ss, newSubplot(`subplot ${ss.length + 1}`, null)]); setActiveSub(subs.length); setMode("region"); }}
                className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-[11px] hover:bg-slate-600"><Plus size={11} /> Add subplot</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {subs.map((s, i) => (
                <button key={s.id} onClick={() => setActiveSub(i)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${i === activeSub ? "bg-amber-500 font-semibold text-slate-900" : "bg-slate-700 hover:bg-slate-600"}`}>
                  {s.label}
                  {subs.length > 1 && (
                    <span onClick={(e) => { e.stopPropagation(); setSubs((ss) => ss.filter((_, k) => k !== i)); setActiveSub(0); }}
                      className="rounded-full px-1 hover:bg-black/20"><X size={9} /></span>
                  )}
                </button>
              ))}
            </div>
            {/* chart type */}
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <span className="text-slate-400">Chart type</span>
              <select value={sub.kind}
                onChange={(e) => { const k = e.target.value; patchSub((s) => ({ ...s, kind: k, radar: k === "radar" ? ensureRadar(s) : s.radar, box: k === "box" ? ensureBox(s) : s.box, heatmap: k === "heatmap" ? ensureHeatmap(s) : s.heatmap, violin: k === "violin" ? ensureViolin(s) : s.violin })); setMode("idle"); }}
                className="flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white focus:border-blue-400 focus:outline-none">
                {CHART_KINDS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
              </select>
            </div>
            {sub.kind === "line" && (
              <button onClick={() => setMode(mode === "region" ? "idle" : "region")}
                className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium ${mode === "region" ? "bg-amber-500 text-slate-900" : "bg-slate-700 hover:bg-slate-600"}`}>
                <SquareDashedMousePointer size={12} /> {sub.region ? "Redraw" : "Draw"} box around this subplot's plot area
              </button>
            )}
          </div>

          {sub.kind === "radar" && <RadarControls sub={sub} mode={mode} setMode={setMode} patchSub={patchSub} />}
          {sub.kind === "box" && <BoxControls sub={sub} mode={mode} setMode={setMode} patchSub={patchSub} />}
          {sub.kind === "heatmap" && <HeatmapControls sub={sub} mode={mode} setMode={setMode} patchSub={patchSub} readHeatmap={readHeatmap} imageData={imageData} />}
          {sub.kind === "violin" && <ViolinControls sub={sub} mode={mode} setMode={setMode} patchSub={patchSub} />}

          {sub.kind === "line" && <>
          {/* calibrate */}
          <div className="mb-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-300">Calibrate axes</div>
            {[["xA", "X ref A", sub.cal.xA], ["xB", "X ref B", sub.cal.xB], ["yA", "Y ref A", sub.cal.yA], ["yB", "Y ref B", sub.cal.yB]].map(([k, label, ref]) => (
              <div key={k} className="mb-1.5 flex items-center gap-2">
                <button onClick={() => setMode(k)}
                  className={`flex w-20 shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${mode === k ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
                  <Crosshair size={11} /> {label}
                </button>
                <input type="number" value={ref.val}
                  onChange={(e) => patchSub((s) => ({ ...s, cal: { ...s.cal, [k]: { ...s.cal[k], val: e.target.value } } }))}
                  placeholder="value at tick"
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
              </div>
            ))}
            <div className="mt-1 flex gap-4 text-[11px]">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={sub.xLog} onChange={(e) => patchSub({ xLog: e.target.checked })} /> X log</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={sub.yLog} onChange={(e) => patchSub({ yLog: e.target.checked })} /> Y log</label>
            </div>
            {!calibration && <p className="mt-1 text-[11px] text-amber-400">Two distinct marks + values per axis needed (log axes need positive values).</p>}
          </div>

          {/* curves */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">Curves</span>
              <button onClick={() => patchSub((s) => ({ ...s, curves: [...s.curves, { label: `curve ${s.curves.length + 1}`, colorHex: CURVE_HUES[s.curves.length % CURVE_HUES.length], tol: 0.12, points: [] }], activeCurve: s.curves.length }))}
                className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-[11px] hover:bg-slate-600"><Plus size={11} /> Add</button>
            </div>
            {sub.curves.map((cv, i) => (
              <div key={i} className={`mb-2 rounded-lg border p-2 ${i === sub.activeCurve ? "border-blue-500 bg-slate-900/60" : "border-slate-700"}`}
                onClick={() => patchSub({ activeCurve: i })}>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={cv.colorHex} onChange={(e) => patchCurve(i, { colorHex: e.target.value })}
                    className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
                  <input value={cv.label} onChange={(e) => patchCurve(i, { label: e.target.value })}
                    className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
                  <span className="shrink-0 text-[10px] text-slate-400">{cv.points.length} pts</span>
                  {sub.curves.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); patchSub((s) => ({ ...s, curves: s.curves.filter((_, k) => k !== i), activeCurve: 0 })); }}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-red-400"><Trash2 size={12} /></button>
                  )}
                </div>
                {i === sub.activeCurve && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setMode("eyedrop")} className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${mode === "eyedrop" ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}><Pipette size={11} /> Eyedrop</button>
                      <button onClick={() => autoTrace(i)} disabled={!imageData} className="flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-[11px] hover:bg-emerald-600 disabled:opacity-40"><Wand2 size={11} /> Auto-trace</button>
                      <button onClick={() => setMode(mode === "points" ? "idle" : "points")} className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${mode === "points" ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}><MousePointerClick size={11} /> Click pts</button>
                      <button onClick={() => patchCurve(i, { points: [] })} className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-[11px] hover:bg-slate-600"><Trash2 size={11} /> Clear</button>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-slate-400">
                      tolerance
                      <input type="range" min="0.02" max="0.4" step="0.01" value={cv.tol} onChange={(e) => patchCurve(i, { tol: parseFloat(e.target.value) })} className="flex-1" />
                      <span className="w-8 tabular-nums">{cv.tol.toFixed(2)}</span>
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
          </>}

          {/* labels */}
          <div className="mb-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-300">Labels (this subplot)</div>
            <input value={sub.label} onChange={(e) => patchSub({ label: e.target.value })} placeholder="subplot title"
              className="mb-1.5 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
            <div className="flex gap-1.5">
              <input value={sub.xLabel} onChange={(e) => patchSub({ xLabel: e.target.value })} placeholder="x label"
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
              <input value={sub.yLabel} onChange={(e) => patchSub({ yLabel: e.target.value })} placeholder="y label"
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
            </div>
          </div>

          {/* preview + save */}
          <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-[11px]">
            <div className="mb-1 font-semibold text-slate-300">This subplot's data</div>
            {sub.kind === "line" ? dataSeries.map((s, i) => (
              <div key={i} className="flex items-center justify-between tabular-nums text-slate-400">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.colorHex }} />{s.label}</span>
                <span>{s.data.length ? `${s.data.length} pts · x[${s.data[0][0].toPrecision(3)}…${s.data[s.data.length - 1][0].toPrecision(3)}]` : "no data"}</span>
              </div>
            )) : sub.kind === "radar" ? (
              <div className="text-slate-400">radar · {(sub.radar?.series || []).length} series · {(sub.radar?.axes || []).length} axes</div>
            ) : sub.kind === "box" ? (
              <div className="text-slate-400">box · {(sub.box?.categories || []).length} categories</div>
            ) : sub.kind === "heatmap" ? (
              <div className="text-slate-400">heatmap · {sub.heatmap?.grid ? `${sub.heatmap.grid.length}×${sub.heatmap.grid[0]?.length} cells read` : "cells not read yet"}</div>
            ) : sub.kind === "violin" ? (
              <div className="text-slate-400">violin · {(sub.violin?.categories || []).length} categories</div>
            ) : (
              <div className="text-slate-400">{sub.kind}</div>
            )}
            <div className="mt-1 border-t border-slate-700 pt-1 text-slate-500">{builtPanels.length} of {subs.length} subplot(s) ready to save</div>
          </div>

          <div className="flex gap-2">
            <button onClick={doSave} disabled={!canSave}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
              <Save size={14} /> Use traced data ({builtPanels.length} panel{builtPanels.length === 1 ? "" : "s"})
            </button>
            <button onClick={doCopy} disabled={!canSave} title="Copy the digitized panels JSON"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-[12px] hover:bg-slate-700 disabled:opacity-40">
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
