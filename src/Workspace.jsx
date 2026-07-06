/**
 * Generic interactive workspace, driven entirely by a PaperSpec object —
 * either the bundled sample or one extracted from an uploaded PDF by Claude.
 *
 *  - Concept-figure primer (static images/SVG + plain-language explanations)
 *  - Methodology pipeline: one card per block, equation + live sliders
 *  - Result engine: one synchronized chart per block, baseline vs modified
 *  - Smart Conclusion box that tracks drift from the paper's baseline
 *  - (i) Theory & Code overlay, references drawer, click-to-pin cursor,
 *    right-click inspector with deltas and local stats
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import {
  Info, RotateCcw, BookOpen, X, FlaskConical, SlidersHorizontal,
  Activity, GitBranch, Pin, PinOff, FileText, Code2, Sigma, Waves, Cpu,
  ChevronRight, TriangleAlert, CircleCheck, CircleAlert, ArrowLeft, Image as ImageIcon,
} from "lucide-react";
import {
  buildHelpers, defaultsFromSpec, compileSpec, runSpec,
  driftPercent, summaryMetrics, buildRows,
} from "./engine.js";

/* Palette — validated (CVD ΔE ≥ 16.6, ≥3:1 contrast on light surface) */
const C = {
  active:   "#2a78d6",
  baseline: "#898781",
  grid:     "#e1e0d9",
  axis:     "#c3c2b7",
  inkMuted: "#898781",
  ink:      "#0b0b0b",
};

const BLOCK_ICONS = [Activity, SlidersHorizontal, Sigma, GitBranch, Waves, Cpu];

const fmt = (v, d = 3) =>
  v === undefined || v === null || Number.isNaN(v) ? "–" : (+v).toFixed(d);

/** Drift readout: past 999% the number stops being informative (numerical blow-up). */
const fmtDrift = (v) => (v > 999 ? "≥999" : fmt(v, 1));

/* ---------------- small presentational pieces ---------------- */

function Eq({ children }) {
  return (
    <div
      className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-[15px] leading-relaxed text-slate-800 overflow-x-auto"
      style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
    >
      {children}
    </div>
  );
}

function InfoButton({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title="Theory & Code bridge"
      className="shrink-0 rounded-full p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
    >
      <Info size={16} />
    </button>
  );
}

function LegendRow({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-1">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <svg width="18" height="6" aria-hidden="true">
            <line x1="0" y1="3" x2="18" y2="3" stroke={it.color} strokeWidth="2"
              strokeDasharray={it.dash || "none"} />
          </svg>
          {it.label}
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label, series }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 shadow-lg px-3 py-2 text-xs backdrop-blur">
      <div className="mb-1 font-semibold text-slate-700">t = {fmt(label, 2)}</div>
      {series.map((s) => {
        const row = payload.find((p) => p.dataKey === s.key);
        if (!row) return null;
        return (
          <div key={s.key} className="flex items-center gap-2 py-0.5">
            <svg width="14" height="4" aria-hidden="true">
              <line x1="0" y1="2" x2="14" y2="2" stroke={s.color} strokeWidth="2"
                strokeDasharray={s.dash || "none"} />
            </svg>
            <span className="font-semibold tabular-nums text-slate-800">{fmt(row.value)}</span>
            <span className="text-slate-400">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ParamSlider({ def, value, onChange }) {
  const drifted = Math.abs(value - def.def) > 1e-9;
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-600">
          <span className="font-semibold text-slate-800"
            style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}>
            {def.sym}
          </span>
          <span className="ml-1.5">{def.label}</span>
        </span>
        <span className="flex items-center gap-1.5">
          {drifted && (
            <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700">
              was {def.def}
            </span>
          )}
          <input
            type="number"
            value={value}
            min={def.min} max={def.max} step={def.step}
            onChange={(e) => onChange(def.key, +e.target.value)}
            className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right text-xs tabular-nums text-slate-800 focus:border-blue-400 focus:outline-none"
          />
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={def.min} max={def.max} step={def.step}
        onChange={(e) => onChange(def.key, +e.target.value)}
        className="mt-1 w-full accent-blue-600"
        aria-label={def.label}
      />
    </div>
  );
}

/* ---------------- concept figure primer ---------------- */

function ConceptFigures({ figures }) {
  if (!figures?.length) return null;
  return (
    <section className="mt-4" aria-label="Concept primer">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <ImageIcon size={13} /> Concept primer · read this first
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {figures.map((fig, i) => (
          <div key={i}
            className={`rounded-xl border border-slate-200 bg-white shadow-sm ${figures.length === 1 ? "md:col-span-2" : ""}`}>
            <div className="border-b border-slate-100 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-slate-800">{fig.title}</h3>
            </div>
            <div className="px-4 py-3">
              {fig.svg && (
                <div className="mb-3 overflow-x-auto rounded-lg border border-slate-100 bg-slate-50 p-2"
                  dangerouslySetInnerHTML={{ __html: fig.svg }} />
              )}
              {fig.image && (
                <div className="mb-3 overflow-hidden rounded-lg border border-slate-100">
                  <img src={fig.image} alt={fig.title} className="w-full" loading="lazy" />
                </div>
              )}
              {!fig.svg && !fig.image && fig.page != null && (
                <div className="mb-3 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-400">
                  Figure on PDF page {fig.page} (preview unavailable)
                </div>
              )}
              <p className="text-[13px] leading-relaxed text-slate-600">{fig.explanation}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- methodology block ---------------- */

function MethodBlock({ step, block, params, onChange, onInfo, isLast, error }) {
  const IconCmp = BLOCK_ICONS[step % BLOCK_ICONS.length];
  return (
    <div className="relative">
      <div className={`rounded-xl border bg-white shadow-sm ${error ? "border-red-300" : "border-slate-200"}`}>
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <IconCmp size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Block {step}
            </div>
            <h3 className="text-sm font-semibold text-slate-800">{block.title}</h3>
          </div>
          <InfoButton onClick={() => onInfo(block.key)} label={`Theory and code for ${block.title}`} />
        </div>

        <div className="px-4 py-3">
          <Eq>{block.equation}</Eq>
          {error && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {error}
            </div>
          )}
          <div className="mt-2">
            {block.params.map((p) => (
              <ParamSlider key={p.key} def={p} value={params[p.key]} onChange={onChange} />
            ))}
            {!block.params.length && (
              <p className="text-[11px] text-slate-400">No tunable coefficients in this block.</p>
            )}
          </div>
        </div>
      </div>

      {!isLast && (
        <div className="flex justify-center py-1 text-slate-300" aria-hidden="true">
          <ChevronRight size={16} className="rotate-90" />
        </div>
      )}
    </div>
  );
}

/* ---------------- chart card ---------------- */

function ChartCard({ title, blockKey, rows, tMax, height = 180, pinnedT, onPin, onInfo, onInspect }) {
  const lastHover = useRef(null);
  const series = [
    { key: blockKey + "B", label: "Baseline (paper)", color: C.baseline, dash: "6 4" },
    { key: blockKey + "A", label: "Modified (you)",   color: C.active },
  ];

  const handleMove = useCallback((state) => {
    if (state && state.activeTooltipIndex != null) lastHover.current = state.activeTooltipIndex;
  }, []);
  const handleClick = useCallback((state) => {
    if (state && state.activeLabel != null) onPin(+state.activeLabel);
  }, [onPin]);
  const handleContext = useCallback((e) => {
    e.preventDefault();
    if (lastHover.current == null) return;
    onInspect({ x: e.clientX, y: e.clientY, index: lastHover.current, title, series });
  }, [onInspect, title]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm" onContextMenu={handleContext}>
      <div className="flex items-center justify-between px-4 pt-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <InfoButton onClick={() => onInfo(blockKey)} label={`Theory and code for ${title}`} />
      </div>
      <div className="px-2 pt-1">
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={rows}
            syncId="paperSync"
            margin={{ top: 6, right: 12, bottom: 2, left: -8 }}
            onMouseMove={handleMove}
            onClick={handleClick}
          >
            <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="t" type="number" domain={[0, tMax]}
              tickCount={7} tick={{ fill: C.inkMuted, fontSize: 10 }}
              stroke={C.axis} tickLine={false}
            />
            <YAxis
              tick={{ fill: C.inkMuted, fontSize: 10 }} stroke="transparent"
              tickLine={false} width={52}
              tickFormatter={(v) => fmt(v, 1)}
            />
            <Tooltip
              content={<ChartTooltip series={series} />}
              cursor={{ stroke: C.inkMuted, strokeWidth: 1, strokeDasharray: "3 3" }}
              isAnimationActive={false}
            />
            {pinnedT != null && (
              <ReferenceLine x={pinnedT} stroke={C.ink} strokeWidth={1.5} strokeDasharray="5 3" />
            )}
            {series.map((s) => (
              <Line
                key={s.key} dataKey={s.key} name={s.label}
                stroke={s.color} strokeWidth={2} dot={false}
                strokeDasharray={s.dash || undefined}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <LegendRow items={series} />
    </div>
  );
}

/* ---------------- right-click inspector ---------------- */

function Inspector({ inspect, rows, onClose }) {
  useEffect(() => {
    const kill = (e) => { if (e.key === "Escape") onClose(); };
    const clickAway = () => onClose();
    window.addEventListener("keydown", kill);
    window.addEventListener("click", clickAway);
    return () => {
      window.removeEventListener("keydown", kill);
      window.removeEventListener("click", clickAway);
    };
  }, [onClose]);

  if (!inspect) return null;
  const { x, y, index, title, series } = inspect;
  const row = rows[index];
  if (!row) return null;

  const activeS = series.find((s) => s.key.endsWith("A"));
  const baseS   = series.find((s) => s.key.endsWith("B"));

  const statKey = activeS ? activeS.key : series[0].key;
  const lo = Math.max(0, index - 10), hi = Math.min(rows.length - 1, index + 10);
  let sum = 0, sum2 = 0, mn = Infinity, mx = -Infinity, cnt = 0;
  for (let i = lo; i <= hi; i++) {
    const v = rows[i][statKey];
    if (v == null) continue;
    sum += v; sum2 += v * v; mn = Math.min(mn, v); mx = Math.max(mx, v); cnt++;
  }
  const mean = cnt ? sum / cnt : 0;
  const std = cnt ? Math.sqrt(Math.max(0, sum2 / cnt - mean * mean)) : 0;

  const delta = activeS && baseS && row[activeS.key] != null && row[baseS.key] != null
    ? row[activeS.key] - row[baseS.key] : null;
  const deltaPct = delta != null && Math.abs(row[baseS.key]) > 1e-9
    ? (delta / Math.abs(row[baseS.key])) * 100 : null;

  const left = Math.min(x + 8, (typeof window !== "undefined" ? window.innerWidth : 1200) - 280);
  const top  = Math.min(y + 8, (typeof window !== "undefined" ? window.innerHeight : 800) - 260);

  return (
    <div
      className="fixed z-50 w-64 rounded-xl border border-slate-300 bg-white p-3 text-xs shadow-2xl"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      role="dialog" aria-label="Point inspector"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-slate-800">Inspect · {title}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close inspector">
          <X size={13} />
        </button>
      </div>
      <div className="mb-2 rounded bg-slate-50 px-2 py-1 font-medium text-slate-700">
        t = {fmt(row.t, 2)} (sample #{index})
      </div>
      <table className="w-full">
        <tbody>
          {series.map((s) => (
            <tr key={s.key}>
              <td className="py-0.5 text-slate-500">{s.label}</td>
              <td className="py-0.5 text-right font-semibold tabular-nums text-slate-800">
                {fmt(row[s.key])}
              </td>
            </tr>
          ))}
          {delta != null && (
            <tr className="border-t border-slate-100">
              <td className="py-0.5 text-slate-500">Δ vs baseline</td>
              <td className={`py-0.5 text-right font-semibold tabular-nums ${Math.abs(delta) > 0.05 ? "text-red-600" : "text-emerald-700"}`}>
                {delta >= 0 ? "+" : ""}{fmt(delta)}
                {deltaPct != null && <span className="ml-1 text-slate-400">({deltaPct >= 0 ? "+" : ""}{fmt(deltaPct, 1)}%)</span>}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-2 border-t border-slate-100 pt-2 text-slate-500">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Local stats (±10 samples, modified)
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
          <span>μ = {fmt(mean)}</span>
          <span>σ = {fmt(std)}</span>
          <span>min = {fmt(mn)}</span>
          <span>max = {fmt(mx)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- theory & code overlay ---------------- */

function InfoModal({ block, onClose }) {
  useEffect(() => {
    const kill = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", kill);
    return () => window.removeEventListener("keydown", kill);
  }, [onClose]);

  if (!block) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog" aria-modal="true" aria-label={block.title}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">{block.title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <FileText size={13} /> Paper theory
          </div>
          <p className="rounded-lg border-l-4 border-blue-200 bg-blue-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
            {block.theory}
          </p>

          <div className="mb-2 mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Code2 size={13} /> Computational implementation (Python / NumPy)
          </div>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-[12.5px] leading-relaxed text-slate-100">
            <code>{block.pythonCode}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ---------------- references drawer ---------------- */

function ReferencesDrawer({ references, open, onClose }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={onClose} />}
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-80 transform bg-white shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <BookOpen size={15} /> Original References
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close references">
            <X size={16} />
          </button>
        </div>
        <ol className="space-y-3 overflow-y-auto px-5 py-4">
          {references.map((r, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-600">
              <span className="shrink-0 font-semibold text-slate-400">[{i + 1}]</span>
              {r}
            </li>
          ))}
          {!references.length && (
            <li className="text-xs text-slate-400">No references extracted.</li>
          )}
        </ol>
      </aside>
    </>
  );
}

/* ---------------- smart conclusion ---------------- */

function ConclusionBox({ drift, conclusion, baseM, actM, modifiedCount }) {
  let tier;
  if (drift < 2)        tier = { icon: CircleCheck,   tone: "emerald", head: "Consistent with the paper",
    body: "The workspace currently reproduces the author's baseline. " + conclusion };
  else if (drift < 15)  tier = { icon: CircleAlert,   tone: "sky",     head: "Minor deviation from baseline",
    body: `Your ${modifiedCount} modified parameter${modifiedCount === 1 ? "" : "s"} shift the headline result by ${fmtDrift(drift)}% (normalized RMS). The paper's qualitative conclusion still holds, but its reported figures no longer match this parameter set.` };
  else if (drift < 40)  tier = { icon: TriangleAlert, tone: "amber",   head: "Significant drift from the published result",
    body: `The modified system deviates ${fmtDrift(drift)}% from the author's baseline. The paper's quantitative claims are no longer supported at these coefficients — you are exploring outside the validated operating envelope.` };
  else                  tier = { icon: TriangleAlert, tone: "red",     head: "Conclusion no longer supported",
    body: `At ${fmtDrift(drift)}% normalized drift the system is in a qualitatively different regime than the one the paper characterizes. Treat the current run as a counterfactual experiment, not a reproduction.` };

  const toneMap = {
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-900",
    sky:     "border-sky-300 bg-sky-50 text-sky-900",
    amber:   "border-amber-300 bg-amber-50 text-amber-900",
    red:     "border-red-300 bg-red-50 text-red-900",
  };
  const TierIcon = tier.icon;

  const metricDefs = [
    { label: "Drift",       a: Math.min(drift, 999), b: 0, unit: "%", d: 1 },
    { label: "Peak |y|",    a: actM.peak, b: baseM.peak, unit: "",  d: 3 },
    { label: "RMS",         a: actM.rms,  b: baseM.rms,  unit: "",  d: 3 },
    { label: "Mean",        a: actM.mean, b: baseM.mean, unit: "",  d: 3 },
  ];

  return (
    <div className={`rounded-xl border-2 p-4 ${toneMap[tier.tone]}`}>
      <div className="flex items-start gap-3">
        <TierIcon size={20} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold">Smart Conclusion — {tier.head}</h2>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold tabular-nums">
              drift {fmtDrift(drift)}%
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed opacity-90">{tier.body}</p>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {metricDefs.map((m) => {
              const changed = fmt(m.a, m.d) !== fmt(m.b, m.d);
              return (
                <div key={m.label} className="rounded-lg bg-white/70 px-2.5 py-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{m.label}</div>
                  <div className="text-sm font-bold tabular-nums">{fmt(m.a, m.d)}{m.unit}</div>
                  <div className={`text-[10px] tabular-nums ${changed ? "font-semibold" : "opacity-50"}`}>
                    baseline {fmt(m.b, m.d)}{m.unit}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- main workspace ---------------- */

export default function Workspace({ spec, onBack }) {
  const defaults = useMemo(() => defaultsFromSpec(spec), [spec]);
  const helpers  = useMemo(() => buildHelpers(spec.protocol), [spec]);
  const compiled = useMemo(() => compileSpec(spec), [spec]);

  const [params, setParams] = useState(defaults);
  const [infoKey, setInfoKey] = useState(null);
  const [refsOpen, setRefsOpen] = useState(false);
  const [pinnedT, setPinnedT] = useState(null);
  const [inspect, setInspect] = useState(null);

  useEffect(() => { setParams(defaults); setPinnedT(null); }, [defaults]);

  const baseline = useMemo(() => runSpec(spec, compiled, defaults, helpers), [spec, compiled, defaults, helpers]);
  const active   = useMemo(() => runSpec(spec, compiled, params, helpers), [spec, compiled, params, helpers]);

  const finalKey = spec.blocks[spec.blocks.length - 1].key;
  const rows  = useMemo(() => buildRows(spec, helpers, baseline.outputs, active.outputs), [spec, helpers, baseline, active]);
  const drift = useMemo(() => driftPercent(baseline.outputs, active.outputs, finalKey), [baseline, active, finalKey]);
  const baseM = useMemo(() => summaryMetrics(baseline.outputs[finalKey]), [baseline, finalKey]);
  const actM  = useMemo(() => summaryMetrics(active.outputs[finalKey]), [active, finalKey]);

  const modifiedCount = useMemo(
    () => Object.keys(defaults).filter((k) => Math.abs(params[k] - defaults[k]) > 1e-9).length,
    [params, defaults]
  );

  const setParam = useCallback((key, value) => {
    setParams((p) => ({ ...p, [key]: Number.isFinite(value) ? value : p[key] }));
  }, []);

  const togglePin = useCallback((t) => {
    setPinnedT((prev) => (prev != null && Math.abs(prev - t) < 1e-9 ? null : t));
  }, []);

  const infoBlock = spec.blocks.find((b) => b.key === infoKey) || null;

  return (
    <div className="min-h-screen bg-slate-100 pb-16" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {/* ===== header ===== */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-3xl">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                <FlaskConical size={13} /> Interactive Paper Playground
              </div>
              <h1 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                {spec.meta.title}
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                {spec.meta.authors}
                {spec.meta.venue ? <> · <span className="italic">{spec.meta.venue}</span></> : null}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{spec.meta.abstract}</p>
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              <button
                onClick={onBack}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:border-blue-300 hover:text-blue-700"
              >
                <ArrowLeft size={14} /> Analyze another paper
              </button>
              <button
                onClick={() => setRefsOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:border-blue-300 hover:text-blue-700"
              >
                <BookOpen size={14} /> View original references
              </button>
              <button
                onClick={() => { setParams(defaults); setPinnedT(null); }}
                disabled={modifiedCount === 0}
                className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-40"
              >
                <RotateCcw size={14} /> Reset to author baseline
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <ConclusionBox
          drift={drift}
          conclusion={spec.conclusion}
          baseM={baseM}
          actM={actM}
          modifiedCount={modifiedCount}
        />

        {active.error && (
          <div className="mt-3 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <strong>Pipeline error:</strong> {active.error}
          </div>
        )}

        <ConceptFigures figures={spec.conceptFigures} />

        {/* cursor status row */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            {pinnedT != null ? <Pin size={13} className="text-slate-700" /> : <PinOff size={13} />}
            {pinnedT != null
              ? <>Global cursor pinned at <strong className="tabular-nums text-slate-700">t = {fmt(pinnedT, 2)}</strong> across all plots — click that point again to unpin.</>
              : "Hover any plot for a synchronized crosshair on every chart · click to pin a global cursor · right-click a point to inspect deltas & local stats."}
          </span>
          {pinnedT != null && (
            <button
              onClick={() => setPinnedT(null)}
              className="rounded border border-slate-300 px-2 py-0.5 text-[11px] hover:bg-white"
            >
              Unpin
            </button>
          )}
        </div>

        {/* ===== workspace grid ===== */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <section className="lg:col-span-2" aria-label="Methodology pipeline">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <GitBranch size={13} /> Methodology pipeline · live coefficients
            </div>
            {spec.blocks.map((block, i) => (
              <MethodBlock
                key={block.key}
                step={i}
                block={block}
                params={params}
                onChange={setParam}
                onInfo={setInfoKey}
                isLast={i === spec.blocks.length - 1}
                error={compiled.errors[block.key]}
              />
            ))}
            <p className="mt-2 px-1 text-[11px] leading-relaxed text-slate-400">
              {spec.protocol.description}
            </p>
          </section>

          <section className="flex flex-col gap-4 lg:col-span-3" aria-label="Result engine">
            <div className="-mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Activity size={13} /> Result engine · baseline vs. modified
            </div>
            {spec.blocks.map((block, i) => (
              <ChartCard
                key={block.key}
                title={`${String.fromCharCode(65 + i)} · ${block.title}`}
                blockKey={block.key}
                rows={rows}
                tMax={spec.protocol.T}
                height={i === spec.blocks.length - 1 ? 240 : 180}
                pinnedT={pinnedT}
                onPin={togglePin}
                onInfo={setInfoKey}
                onInspect={setInspect}
              />
            ))}
          </section>
        </div>
      </main>

      <InfoModal block={infoBlock} onClose={() => setInfoKey(null)} />
      <ReferencesDrawer references={spec.references} open={refsOpen} onClose={() => setRefsOpen(false)} />
      <Inspector inspect={inspect} rows={rows} onClose={() => setInspect(null)} />
    </div>
  );
}
