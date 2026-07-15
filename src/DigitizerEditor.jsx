/**
 * DigitizerEditor — trace a paper's REAL result figure into accurate data.
 *
 * Opens over the cropped figure image. The author (1) calibrates the axes by
 * dragging two reference marks onto known ticks per axis and typing their
 * values, then (2) adds one curve per plotted line — eyedrop its colour and
 * auto-trace it, or click points by hand. Saving turns the traced pixels into
 * real DATA points via the calibration, written to the panel as `digitized`.
 * That locked real curve then renders in the Results Lab with the live model
 * overlaid on top (see PanelChart / ResultsLab).
 *
 * All positions are kept in the image's FRACTION space (0..1), so calibration
 * set on the on-screen preview stays valid for the natural-resolution pixel
 * read used by auto-trace.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Crosshair, Pipette, MousePointerClick, Wand2, Trash2, Plus, Save, Copy, Check } from "lucide-react";
import {
  makeCalibration, autoTraceColor, sampleColor, hexToRgb, rgbToHex,
  fracPointsToData, bboxFracToCropFrac,
} from "./digitizer.js";

const CURVE_HUES = ["#2a78d6", "#1baf7a", "#eda100", "#e34948", "#4a3aa7", "#e87ba4"];
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

/** Seed calibration + curves from the vision model's digitizeHint, transforming
 *  its bbox-relative tick fractions into our padded-crop fractions. */
function seedFromHint(hint, bbox) {
  if (!hint) return null;
  const bw = bbox?.w, bh = bbox?.h;
  const cropX = (f) => (Number.isFinite(bw) ? bboxFracToCropFrac(f, bw) : f);
  const cropY = (f) => (Number.isFinite(bh) ? bboxFracToCropFrac(f, bh) : f);
  const xt = hint.xTicks || [], yt = hint.yTicks || [];
  if (xt.length < 2 || yt.length < 2) return null;
  return {
    xLog: !!hint.xLog, yLog: !!hint.yLog,
    xA: { f: cropX(xt[0].atFrac), val: xt[0].value },
    xB: { f: cropX(xt[xt.length - 1].atFrac), val: xt[xt.length - 1].value },
    yA: { f: cropY(yt[0].atFrac), val: yt[0].value },
    yB: { f: cropY(yt[yt.length - 1].atFrac), val: yt[yt.length - 1].value },
    curves: (hint.curves || []).map((c, i) => ({
      label: c.label || `curve ${i + 1}`, colorHex: c.colorHex || CURVE_HUES[i % CURVE_HUES.length],
      tol: 0.12, points: [],
    })),
  };
}

export default function DigitizerEditor({ fig, panel, onSave, onClose }) {
  const imgRef = useRef(null);
  const [imgNat, setImgNat] = useState(null); // {w,h}
  const [imageData, setImageData] = useState(null);

  const seed = useMemo(() => seedFromHint(fig?.digitizeHint, fig?.bbox), [fig]);
  const existing = panel?.digitized;

  const [xLog, setXLog] = useState(existing?.xLog ?? seed?.xLog ?? false);
  const [yLog, setYLog] = useState(existing?.yLog ?? seed?.yLog ?? false);
  // calibration refs — fraction along the image + the data value at that mark
  const [cal, setCal] = useState(() => seed
    ? { xA: seed.xA, xB: seed.xB, yA: seed.yA, yB: seed.yB }
    : { xA: { f: 0.12, val: 0 }, xB: { f: 0.9, val: 1 }, yA: { f: 0.9, val: 0 }, yB: { f: 0.12, val: 1 } });

  const [curves, setCurves] = useState(() => {
    if (existing?.series?.length) {
      // reopen: we don't keep the pixel trace, only its final data — show it as
      // read-only-ish manual points mapped back through a fresh calibration is
      // lossy, so just start each existing series as an empty re-traceable curve.
      return existing.series.map((s, i) => ({ label: s.label, colorHex: CURVE_HUES[i % CURVE_HUES.length], tol: 0.12, points: [] }));
    }
    if (seed?.curves?.length) return seed.curves;
    return [{ label: "curve 1", colorHex: CURVE_HUES[0], tol: 0.12, points: [] }];
  });
  const [activeCurve, setActiveCurve] = useState(0);
  const [mode, setMode] = useState("idle"); // idle | xA | xB | yA | yB | eyedrop | points
  const [copied, setCopied] = useState(false);

  // axis + subplot labels — seeded from the panel, editable so a panel-less
  // "guided tour" figure can be traced into a brand-new interactive plot.
  const [subplotLabel, setSubplotLabel] = useState(panel?.subplotLabel || fig?.figureLabel || "Traced figure");
  const [xLabel, setXLabel] = useState(panel?.xLabel || fig?.digitizeHint?.xLabel || "x");
  const [yLabel, setYLabel] = useState(panel?.yLabel || fig?.digitizeHint?.yLabel || "y");

  // Load the figure into an offscreen canvas so auto-trace can read pixels.
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
    return { fx: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
             fy: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };

  const onImageClick = (e) => {
    const { fx, fy } = fracFromEvent(e);
    if (mode === "xA") { setCal((c) => ({ ...c, xA: { ...c.xA, f: fx } })); setMode("idle"); }
    else if (mode === "xB") { setCal((c) => ({ ...c, xB: { ...c.xB, f: fx } })); setMode("idle"); }
    else if (mode === "yA") { setCal((c) => ({ ...c, yA: { ...c.yA, f: fy } })); setMode("idle"); }
    else if (mode === "yB") { setCal((c) => ({ ...c, yB: { ...c.yB, f: fy } })); setMode("idle"); }
    else if (mode === "eyedrop") {
      if (imageData) { const rgb = sampleColor(imageData, fx, fy); updateCurve(activeCurve, { colorHex: rgbToHex(rgb) }); }
      setMode("idle");
    } else if (mode === "points") {
      updateCurve(activeCurve, (cv) => ({ points: [...cv.points, { fx, fy }].sort((a, b) => a.fx - b.fx) }));
    }
  };

  const updateCurve = (i, patch) => setCurves((cs) => cs.map((cv, k) => {
    if (k !== i) return cv;
    return { ...cv, ...(typeof patch === "function" ? patch(cv) : patch) };
  }));

  const autoTrace = (i) => {
    if (!imageData) return;
    const cv = curves[i];
    const rgb = hexToRgb(cv.colorHex);
    if (!rgb) return;
    const pts = autoTraceColor(imageData, rgb, { tol: cv.tol, xStep: 2 });
    updateCurve(i, { points: pts });
  };

  const calibration = useMemo(() => makeCalibration({
    xRef: [{ f: cal.xA.f, val: num(cal.xA.val) }, { f: cal.xB.f, val: num(cal.xB.val) }],
    yRef: [{ f: cal.yA.f, val: num(cal.yA.val) }, { f: cal.yB.f, val: num(cal.yB.val) }],
    xLog, yLog,
  }), [cal, xLog, yLog]);

  // Live data preview: convert each curve's traced fractions into real points.
  const dataSeries = useMemo(() => curves.map((cv) => ({
    label: cv.label, colorHex: cv.colorHex,
    data: calibration ? fracPointsToData(cv.points, calibration) : [],
  })), [curves, calibration]);

  const built = useMemo(() => ({
    source: `Traced from ${fig?.figureLabel || "the figure"}${panel ? ` — ${panel.subplotLabel || ""}` : ""}`.trim(),
    xLog, yLog,
    series: dataSeries.filter((s) => s.data.length > 1).map((s) => ({ label: s.label, points: s.data })),
  }), [dataSeries, xLog, yLog, fig, panel]);

  const canSave = calibration && built.series.length > 0;

  const doSave = () => { if (canSave) onSave(built, { subplotLabel, xLabel, yLabel }); };
  const doCopy = () => {
    navigator.clipboard?.writeText(JSON.stringify(built, null, 2)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    });
  };

  // overlay marker positions
  const pct = (f) => `${(f * 100).toFixed(2)}%`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2.5 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Crosshair size={16} className="text-blue-400" />
          Trace the real figure — {fig?.figureLabel} {panel?.subplotLabel ? `· ${panel.subplotLabel}` : ""}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10"><X size={18} /></button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ---- image + interaction overlay ---- */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[repeating-conic-gradient(#0f172a_0%_25%,#1e293b_0%_50%)] bg-[length:24px_24px] p-4">
          <div className="relative inline-block" style={{ maxWidth: "100%" }}>
            {fig?.image ? (
              <img
                ref={imgRef} src={fig.image} alt="figure to trace"
                onClick={onImageClick}
                className={`block max-h-[70vh] w-auto max-w-full select-none ${mode !== "idle" ? "cursor-crosshair" : ""}`}
                draggable={false}
              />
            ) : (
              <div className="p-10 text-slate-400">No figure image to trace.</div>
            )}

            {/* calibration guide lines */}
            {imgRef.current && (
              <>
                <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-blue-400/80" style={{ left: pct(cal.xA.f) }} />
                <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-blue-400/80" style={{ left: pct(cal.xB.f) }} />
                <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-emerald-400/80" style={{ top: pct(cal.yA.f) }} />
                <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-emerald-400/80" style={{ top: pct(cal.yB.f) }} />
                {[["xA", cal.xA.f, "50%", "#2a78d6"], ["xB", cal.xB.f, "50%", "#2a78d6"]].map(([k, f]) => (
                  <span key={k} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-blue-600 px-1 text-[9px] font-bold text-white"
                    style={{ left: pct(f), top: "50%" }}>{k}</span>
                ))}
                {[["yA", cal.yA.f, "#1baf7a"], ["yB", cal.yB.f, "#1baf7a"]].map(([k, f]) => (
                  <span key={k} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-emerald-600 px-1 text-[9px] font-bold text-white"
                    style={{ left: "50%", top: pct(f) }}>{k}</span>
                ))}
                {/* traced points of the active curve */}
                {curves[activeCurve]?.points.map((p, i) => (
                  <span key={i} className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-white"
                    style={{ left: pct(p.fx), top: pct(p.fy), background: curves[activeCurve].colorHex }} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* ---- controls ---- */}
        <div className="w-full shrink-0 overflow-y-auto border-t border-slate-700 bg-slate-800 p-4 text-slate-200 lg:w-[360px] lg:border-l lg:border-t-0">
          {/* step 1 — axes */}
          <div className="mb-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-300">1 · Calibrate axes</div>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
              Click a button, then click the matching tick on the figure. Type the value at that tick.
            </p>
            {[
              ["xA", "X ref A", cal.xA, "val"], ["xB", "X ref B", cal.xB],
              ["yA", "Y ref A", cal.yA], ["yB", "Y ref B", cal.yB],
            ].map(([k, label, ref]) => (
              <div key={k} className="mb-1.5 flex items-center gap-2">
                <button onClick={() => setMode(k)}
                  className={`flex w-24 shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${mode === k ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}>
                  <Crosshair size={11} /> {label}
                </button>
                <input type="number" value={ref.val}
                  onChange={(e) => setCal((c) => ({ ...c, [k]: { ...c[k], val: e.target.value } }))}
                  placeholder="value at tick"
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
              </div>
            ))}
            <div className="mt-2 flex gap-4 text-[11px]">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={xLog} onChange={(e) => setXLog(e.target.checked)} /> X log scale</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={yLog} onChange={(e) => setYLog(e.target.checked)} /> Y log scale</label>
            </div>
            {!calibration && <p className="mt-1 text-[11px] text-amber-400">Two distinct marks + values per axis needed (log axes need positive values).</p>}
          </div>

          {/* step 2 — curves */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">2 · Trace curves</span>
              <button onClick={() => { setCurves((cs) => [...cs, { label: `curve ${cs.length + 1}`, colorHex: CURVE_HUES[cs.length % CURVE_HUES.length], tol: 0.12, points: [] }]); setActiveCurve(curves.length); }}
                className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-[11px] hover:bg-slate-600"><Plus size={11} /> Add</button>
            </div>
            {curves.map((cv, i) => (
              <div key={i} className={`mb-2 rounded-lg border p-2 ${i === activeCurve ? "border-blue-500 bg-slate-900/60" : "border-slate-700"}`}
                onClick={() => setActiveCurve(i)}>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={cv.colorHex} onChange={(e) => updateCurve(i, { colorHex: e.target.value })}
                    className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" title="curve colour" />
                  <input value={cv.label} onChange={(e) => updateCurve(i, { label: e.target.value })}
                    className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
                  <span className="shrink-0 text-[10px] text-slate-400">{cv.points.length} pts</span>
                  {curves.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); setCurves((cs) => cs.filter((_, k) => k !== i)); setActiveCurve(0); }}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-red-400"><Trash2 size={12} /></button>
                  )}
                </div>
                {i === activeCurve && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setMode("eyedrop")} className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${mode === "eyedrop" ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}><Pipette size={11} /> Eyedrop colour</button>
                      <button onClick={() => autoTrace(i)} disabled={!imageData} className="flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-[11px] hover:bg-emerald-600 disabled:opacity-40"><Wand2 size={11} /> Auto-trace</button>
                      <button onClick={() => setMode(mode === "points" ? "idle" : "points")} className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${mode === "points" ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}><MousePointerClick size={11} /> Click points</button>
                      <button onClick={() => updateCurve(i, { points: [] })} className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-[11px] hover:bg-slate-600"><Trash2 size={11} /> Clear</button>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-slate-400">
                      colour tolerance
                      <input type="range" min="0.02" max="0.4" step="0.01" value={cv.tol}
                        onChange={(e) => updateCurve(i, { tol: parseFloat(e.target.value) })} className="flex-1" />
                      <span className="w-8 tabular-nums">{cv.tol.toFixed(2)}</span>
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* step 3 — labels */}
          <div className="mb-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-300">3 · Labels</div>
            <div className="space-y-1.5">
              <input value={subplotLabel} onChange={(e) => setSubplotLabel(e.target.value)} placeholder="subplot title"
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
              <div className="flex gap-1.5">
                <input value={xLabel} onChange={(e) => setXLabel(e.target.value)} placeholder="x-axis label"
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
                <input value={yLabel} onChange={(e) => setYLabel(e.target.value)} placeholder="y-axis label"
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-white focus:border-blue-400 focus:outline-none" />
              </div>
            </div>
          </div>

          {/* preview + save */}
          <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-[11px]">
            <div className="mb-1 font-semibold text-slate-300">Data preview</div>
            {dataSeries.map((s, i) => (
              <div key={i} className="flex items-center justify-between tabular-nums text-slate-400">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.colorHex }} />{s.label}</span>
                <span>{s.data.length ? `${s.data.length} pts · x[${s.data[0][0].toPrecision(3)}…${s.data[s.data.length - 1][0].toPrecision(3)}]` : "no data"}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={doSave} disabled={!canSave}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
              <Save size={14} /> Use this traced data
            </button>
            <button onClick={doCopy} disabled={!canSave} title="Copy the digitized JSON to paste into a saved spec"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-[12px] hover:bg-slate-700 disabled:opacity-40">
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
