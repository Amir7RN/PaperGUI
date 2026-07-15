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
  fracPointsToData, bboxFracToCropFrac,
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
    activeCurve: 0,
  };
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
  const onDown = (e) => {
    if (mode !== "region") return;
    e.preventDefault();
    const p = fracFromEvent(e);
    setDragRect({ fx0: p.fx, fy0: p.fy, fx1: p.fx, fy1: p.fy });
  };
  const onMove = (e) => {
    if (mode !== "region" || !dragRect) return;
    const p = fracFromEvent(e);
    setDragRect((d) => ({ ...d, fx1: p.fx, fy1: p.fy }));
  };
  const onUp = () => {
    if (mode !== "region" || !dragRect) return;
    const region = {
      fx0: Math.min(dragRect.fx0, dragRect.fx1), fy0: Math.min(dragRect.fy0, dragRect.fy1),
      fx1: Math.max(dragRect.fx0, dragRect.fx1), fy1: Math.max(dragRect.fy0, dragRect.fy1),
    };
    if (region.fx1 - region.fx0 > 0.02 && region.fy1 - region.fy0 > 0.02) {
      patchSub((s) => ({ ...s, region, cal: defaultCal(region) }));
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

  /** One built panel per subplot that has a valid calibration + real curve. */
  const builtPanels = useMemo(() => subs.map((s) => {
    const cal = calOf(s);
    if (!cal) return null;
    const series = s.curves
      .map((cv) => ({ label: cv.label, points: fracPointsToData(cv.points, cal) }))
      .filter((x) => x.points.length > 1);
    if (!series.length) return null;
    return {
      subplotLabel: s.label, xLabel: s.xLabel, yLabel: s.yLabel, chartKind: "line", dataSource: "digitized",
      digitized: {
        source: `Traced from ${fig?.figureLabel || "the figure"} — ${s.label}`,
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

                {/* active subplot calibration + traced points */}
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
            <button onClick={() => setMode(mode === "region" ? "idle" : "region")}
              className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium ${mode === "region" ? "bg-amber-500 text-slate-900" : "bg-slate-700 hover:bg-slate-600"}`}>
              <SquareDashedMousePointer size={12} /> {sub.region ? "Redraw" : "Draw"} box around this subplot's plot area
            </button>
          </div>

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
            {dataSeries.map((s, i) => (
              <div key={i} className="flex items-center justify-between tabular-nums text-slate-400">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.colorHex }} />{s.label}</span>
                <span>{s.data.length ? `${s.data.length} pts · x[${s.data[0][0].toPrecision(3)}…${s.data[s.data.length - 1][0].toPrecision(3)}]` : "no data"}</span>
              </div>
            ))}
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
