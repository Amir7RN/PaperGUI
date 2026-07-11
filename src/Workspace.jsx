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
  ChevronRight, TriangleAlert, CircleCheck, CircleAlert, ArrowLeft, Image as ImageIcon, LogOut,
  Landmark, Maximize2, Lightbulb, LineChart as LineChartIcon, LayoutTemplate,
} from "lucide-react";
import LayoutEditor from "./LayoutEditor.jsx";
import { loadLayout, layoutStyle, sectionByKey } from "./layout.js";
import {
  buildHelpers, defaultsFromSpec, compileSpec, runSpec,
  driftPercent, summaryMetrics, buildRows,
  compileResultFigures, runResultPanel, buildPanelRows, makeFigureHelpers,
} from "./engine.js";

/* categorical hues for multi-series result reproductions (validated set) */
const SERIES_HUES = ["#2a78d6", "#1baf7a", "#eda100", "#e34948", "#4a3aa7", "#e87ba4"];

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

/* ---------------- section chrome ---------------- */

const SECTION_TONES = {
  violet:  { badge: "bg-violet-600",  ring: "ring-violet-200/60",  text: "text-violet-700"  },
  amber:   { badge: "bg-amber-500",   ring: "ring-amber-200/60",   text: "text-amber-700"   },
  blue:    { badge: "bg-blue-600",    ring: "ring-blue-200/60",    text: "text-blue-700"    },
  emerald: { badge: "bg-emerald-600", ring: "ring-emerald-200/60", text: "text-emerald-700" },
};

function SectionHeader({ num, tone, icon: IconCmp, title, sub }) {
  const t = SECTION_TONES[tone];
  return (
    <div className="mb-4 flex items-start gap-3" style={{ marginTop: "var(--sec-gap, 40px)" }}>
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl ${t.badge} font-bold text-white shadow-md ring-4 ${t.ring}`}
        style={{ width: "var(--sec-badge, 36px)", height: "var(--sec-badge, 36px)", fontSize: "calc(var(--sec-badge, 36px) * 0.4)" }}
      >
        {num}
      </div>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-bold text-slate-900" style={{ fontSize: "var(--sec-head, 16px)" }}>
          <IconCmp size={16} className={t.text} /> {title}
        </h2>
        <p className="mt-0.5 leading-relaxed text-slate-500" style={{ fontSize: "var(--sec-sub, 12px)" }}>{sub}</p>
      </div>
    </div>
  );
}

/* ---------------- fullscreen figure lightbox ---------------- */

function Lightbox({ fig, onClose }) {
  useEffect(() => {
    const kill = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", kill);
    return () => window.removeEventListener("keydown", kill);
  }, [onClose]);

  if (!fig) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      role="dialog" aria-modal="true" aria-label={fig.title}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/25"
      >
        <X size={20} />
      </button>
      <div
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-auto bg-slate-50 p-4">
          {fig.image ? (
            <img src={fig.image} alt={fig.title} className="mx-auto max-h-[62vh] w-auto max-w-full" />
          ) : fig.svg ? (
            <div className="mx-auto max-w-3xl" dangerouslySetInnerHTML={{ __html: fig.svg }} />
          ) : (
            <div className="py-16 text-center text-sm text-slate-400">No preview available</div>
          )}
        </div>
        <div className="border-t border-slate-100 px-6 py-4">
          <h3 className="text-sm font-bold text-slate-900">{fig.title}</h3>
          <p className="mt-1.5 max-h-40 overflow-y-auto text-[13px] leading-relaxed text-slate-600">
            {fig.explanation}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 1 · concept figure primer (clickable) ---------------- */

function ConceptFigures({ figures, onOpen }) {
  if (!figures?.length) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {figures.map((fig, i) => (
        <button
          key={i}
          onClick={() => onOpen(fig)}
          className={`group rounded-2xl border border-slate-200/80 bg-white/90 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg ${figures.length === 1 ? "md:col-span-2" : ""}`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-800">{fig.title}</h3>
            <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600 opacity-70 transition group-hover:opacity-100">
              <Maximize2 size={11} /> fullscreen
            </span>
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
            <p className="text-[13px] leading-relaxed text-slate-600 line-clamp-3">{fig.explanation}</p>
            <span className="mt-1.5 inline-block text-[11px] font-medium text-violet-600">
              Click to read the full explanation →
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ---------------- 2 · foundations (borrowed core ideas) ---------------- */

function Foundations({ foundations }) {
  if (!foundations?.length) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {foundations.map((f, i) => (
        <div key={i}
          className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur transition hover:shadow-md">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Landmark size={14} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-800">{f.title}</h3>
                <p className="text-[11px] italic text-slate-400">{f.source}</p>
              </div>
            </div>
          </div>
          <div className="px-4 py-3">
            {f.equation ? <Eq>{f.equation}</Eq> : null}
            <p className={`leading-relaxed text-slate-600 ${f.equation ? "mt-2.5" : ""}`} style={{ fontSize: "var(--found-text, 13px)" }}>{f.concept}</p>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50/70 px-3 py-2">
              <Lightbulb size={13} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-[12px] leading-relaxed text-amber-900">
                <span className="font-semibold">What this paper adds: </span>{f.whyItMatters}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
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

/* ---------------- result-figure reproductions ---------------- */

function ResultFigureTooltip({ active, payload, label, xLabel, legend }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 shadow-lg px-3 py-2 text-xs backdrop-blur">
      <div className="mb-1 font-semibold text-slate-700">{xLabel} = {fmt(label, 2)}</div>
      {payload.map((p) => {
        const info = legend.find((l) => l.key === p.dataKey);
        if (!info) return null;
        return (
          <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
            <svg width="14" height="4" aria-hidden="true">
              <line x1="0" y1="2" x2="14" y2="2" stroke={info.color} strokeWidth="2"
                strokeDasharray={info.dash || "none"} />
            </svg>
            <span className="font-semibold tabular-nums text-slate-800">{fmt(p.value)}</span>
            <span className="text-slate-400">{info.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** One subplot: original is shown once per figure, so this is just the chart. */
function PanelChart({ panel, baseRun, actRun, height = 170 }) {
  const { rows } = useMemo(() => buildPanelRows(baseRun, actRun), [baseRun, actRun]);
  const err = actRun?.error || baseRun?.error;
  const nSeries = (actRun?.series || baseRun?.series || []).length;

  const legend = [];
  for (let k = 0; k < nSeries; k++) {
    const name = (actRun?.series || baseRun?.series)[k]?.label || `series ${k + 1}`;
    legend.push({ key: `a${k}`, label: name, color: SERIES_HUES[k % SERIES_HUES.length] });
  }
  for (let k = 0; k < nSeries; k++) {
    const name = (baseRun?.series || actRun?.series)[k]?.label || `series ${k + 1}`;
    legend.push({ key: `b${k}`, label: `${name} · baseline`, color: C.baseline, dash: "5 4" });
  }

  return (
    <div className="rounded-lg border border-slate-100 bg-white p-2">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <span className="text-[11px] font-semibold text-slate-700">{panel.subplotLabel}</span>
        <span className="text-[10px] text-slate-400">{panel.xLabel} → {panel.yLabel}</span>
      </div>
      {err ? (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-2 text-[11px] text-red-700">{err}</div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows} margin={{ top: 6, right: 10, bottom: 2, left: -12 }}>
            <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="_i" type="number" domain={["dataMin", "dataMax"]}
              tick={{ fill: C.inkMuted, fontSize: 9 }} stroke={C.axis} tickLine={false}
              tickFormatter={(v) => fmt(v, 1)}
            />
            <YAxis
              tick={{ fill: C.inkMuted, fontSize: 9 }} stroke="transparent"
              tickLine={false} width={42} tickFormatter={(v) => fmt(v, 1)}
            />
            <Tooltip
              content={<ResultFigureTooltip xLabel={panel.xLabel} legend={legend} />}
              cursor={{ stroke: C.inkMuted, strokeWidth: 1, strokeDasharray: "3 3" }}
              isAnimationActive={false}
            />
            {legend.map((l) => (
              <Line key={l.key} dataKey={l.key} stroke={l.color} strokeWidth={1.8} dot={false}
                strokeDasharray={l.dash || undefined} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <LegendRow items={legend} />
    </div>
  );
}

function ResultFigureCard({ fig, figIndex, compiled, baseOutputs, actOutputs, defaults, params, baseFigHelpers, actFigHelpers }) {
  const panels = fig.panels || [];
  const runs = useMemo(() => panels.map((panel, pi) => {
    const fn = compiled.fns[`${figIndex}:${pi}`];
    return {
      base: runResultPanel(fn, baseOutputs, defaults, baseFigHelpers),
      act:  runResultPanel(fn, actOutputs, params, actFigHelpers),
    };
  }), [panels, compiled, figIndex, baseOutputs, actOutputs, defaults, params, baseFigHelpers, actFigHelpers]);

  const gridCols = panels.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2";

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Reproduction of {fig.figureLabel}
        </div>
        <h3 className="text-sm font-semibold text-slate-800">{fig.title}</h3>
      </div>

      <div className="grid gap-4 px-4 py-3 lg:grid-cols-5">
        {/* original cropped figure (once, spanning left) */}
        <div className="lg:col-span-2">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Original figure (from the paper)
          </div>
          {fig.image ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <img src={fig.image} alt={`${fig.figureLabel} from the paper`} className="w-full" loading="lazy" />
            </div>
          ) : fig.svg ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-2"
              dangerouslySetInnerHTML={{ __html: fig.svg }} />
          ) : (
            <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-slate-200 px-3 text-center text-[11px] text-slate-400">
              {fig.page ? <>{fig.figureLabel} on page {fig.page} — crop unavailable</> : "No source figure for the sample paper"}
            </div>
          )}
        </div>

        {/* interactive subplots grid */}
        <div className="lg:col-span-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Interactive reproduction · {panels.length} subplot{panels.length === 1 ? "" : "s"} · solid = your run, dashed = paper baseline
          </div>
          <div className={`grid gap-3 ${gridCols}`}>
            {panels.map((panel, pi) => (
              <PanelChart key={pi} panel={panel} baseRun={runs[pi].base} actRun={runs[pi].act} />
            ))}
          </div>
        </div>
      </div>

      <p className="border-t border-slate-100 px-4 py-2.5 text-[12px] leading-relaxed text-slate-600">
        {fig.explanation}
      </p>
    </div>
  );
}

function ResultFigures({ spec, pipelineCompiled, helpers, baseOutputs, actOutputs, defaults, params }) {
  const figs = spec.resultFigures || [];
  const compiled = useMemo(() => compileResultFigures(spec), [spec]);
  const baseFigHelpers = useMemo(() => makeFigureHelpers(spec, pipelineCompiled, helpers, defaults), [spec, pipelineCompiled, helpers, defaults]);
  const actFigHelpers  = useMemo(() => makeFigureHelpers(spec, pipelineCompiled, helpers, params), [spec, pipelineCompiled, helpers, params]);

  if (!figs.length) return null;

  return (
    <div className="grid gap-4">
      {figs.map((fig, i) => (
          <ResultFigureCard
            key={fig.figureLabel + i}
            fig={fig}
            figIndex={i}
            compiled={compiled}
            baseOutputs={baseOutputs}
            actOutputs={actOutputs}
            defaults={defaults}
            params={params}
            baseFigHelpers={baseFigHelpers}
            actFigHelpers={actFigHelpers}
          />
      ))}
    </div>
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

/* ---------------- mac-style lab window ---------------- */

function LabWindow({ title, accent, pages, activeId, onSelect, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300/70 bg-white/95 shadow-2xl backdrop-blur"
      style={{ borderRadius: "var(--card-radius, 16px)" }}>
      {/* title bar */}
      <div className="flex items-center gap-3 border-b border-slate-200/80 bg-gradient-to-b from-slate-100 to-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-inner" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e] shadow-inner" />
          <span className="h-3 w-3 rounded-full bg-[#28c840] shadow-inner" />
        </div>
        <span className="flex-1 truncate text-center text-xs font-semibold text-slate-600">{title}</span>
        <span className="w-14" />
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* sidebar */}
        <nav
          aria-label={`${title} pages`}
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200/70 bg-slate-50/80 p-2 lg:w-56 lg:flex-col lg:overflow-x-visible lg:border-b-0 lg:border-r"
        >
          {pages.map((p) => {
            const selected = p.id === activeId;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                aria-current={selected ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-2 text-left text-xs transition lg:w-full ${
                  selected
                    ? `${accent} font-semibold text-white shadow-md`
                    : "text-slate-600 hover:bg-white hover:shadow-sm"
                }`}
              >
                <span className="block truncate">{p.label}</span>
                {p.sub && (
                  <span className={`block truncate text-[10px] ${selected ? "text-white/75" : "text-slate-400"}`}>
                    {p.sub}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* content */}
        <div className="min-h-[380px] min-w-0 flex-1 p-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- animated pipeline flow diagram ---------------- */

function FlowDiagram({ blocks, activeKey, onSelect }) {
  const BW = 148, BH = 64, GAP = 56;
  const width = blocks.length * BW + (blocks.length - 1) * GAP + 24;
  const height = 120;
  const y = 26;

  return (
    <div className="overflow-x-auto">
      <style>{`
        @keyframes flowdash { to { stroke-dashoffset: -20; } }
        .flow-arrow { stroke-dasharray: 6 6; animation: flowdash 0.7s linear infinite; }
      `}</style>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label="Signal flow through the method's pipeline">
        <defs>
          <marker id="fd-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
        </defs>
        {blocks.map((b, i) => {
          const x = 12 + i * (BW + GAP);
          const selected = b.key === activeKey;
          const cx1 = x + BW, cx2 = x + BW + GAP;
          return (
            <g key={b.key}>
              {i < blocks.length - 1 && (
                <>
                  <line x1={cx1 + 2} y1={y + BH / 2} x2={cx2 - 4} y2={y + BH / 2}
                    stroke="#64748b" strokeWidth="1.6" className="flow-arrow" markerEnd="url(#fd-arr)" />
                  <circle r="4" fill="#2a78d6">
                    <animateMotion dur="1.6s" repeatCount="indefinite"
                      path={`M ${cx1 + 2} ${y + BH / 2} L ${cx2 - 6} ${y + BH / 2}`} />
                  </circle>
                </>
              )}
              <g
                onClick={() => onSelect?.(b.key)}
                style={{ cursor: "pointer" }}
                role="button" aria-label={`Open ${b.title}`}
              >
                <rect x={x} y={y} width={BW} height={BH} rx="12"
                  fill={selected ? "#eff6ff" : "white"}
                  stroke={selected ? "#2a78d6" : "#cbd5e1"}
                  strokeWidth={selected ? 2 : 1.2}
                  className="transition-all"
                />
                {selected && (
                  <rect x={x} y={y} width={BW} height={BH} rx="12" fill="none"
                    stroke="#93c5fd" strokeWidth="5" opacity="0.35" />
                )}
                <text x={x + BW / 2} y={y + 24} textAnchor="middle" fontSize="10.5" fontWeight="700"
                  fill={selected ? "#1d4ed8" : "#0f172a"}>
                  Step {i}
                </text>
                <foreignObject x={x + 6} y={y + 30} width={BW - 12} height={BH - 34}>
                  <div xmlns="http://www.w3.org/1999/xhtml"
                    style={{ fontSize: "9px", lineHeight: "1.15", color: "#475569", textAlign: "center", overflow: "hidden" }}>
                    {b.title}
                  </div>
                </foreignObject>
              </g>
              <text x={x + BW / 2} y={y + BH + 18} textAnchor="middle" fontSize="9" fill="#94a3b8">
                {i === 0 ? "input" : i === blocks.length - 1 ? "→ headline result" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------------- concept lab window ---------------- */

function ConceptLab({ spec, params, defaults, setParam, rows, compiled, pinnedT, onPin, onInfo, onInspect, layout }) {
  const chartH = layout?.numeric?.conceptChartH ?? 300;
  const [pageId, setPageId] = useState("overview");
  const pages = [
    { id: "overview", label: "Overview", sub: "the whole pipeline, animated" },
    ...spec.blocks.map((b, i) => ({ id: b.key, label: `Step ${i} · ${b.title.split("—")[0].trim()}`, sub: b.params.map((p) => p.sym).join("  ") })),
  ];
  const block = spec.blocks.find((b) => b.key === pageId);
  const idx = spec.blocks.findIndex((b) => b.key === pageId);

  return (
    <LabWindow
      title={`Concept Lab — ${spec.meta.title.slice(0, 60)}${spec.meta.title.length > 60 ? "…" : ""}`}
      accent="bg-blue-600"
      pages={pages}
      activeId={pageId}
      onSelect={setPageId}
    >
      {pageId === "overview" ? (
        <div>
          <p className="mb-3 max-w-3xl text-[13px] leading-relaxed text-slate-600">
            The method as a signal chain: each box is one step of the paper's pipeline, and the
            moving dots are the signal flowing through it. <strong>Click a box</strong> (or a page on
            the left) to open that step — its equation in plain language, its dials, and its live plot.
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <FlowDiagram blocks={spec.blocks} activeKey={null} onSelect={setPageId} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{spec.protocol.description}</p>
        </div>
      ) : block ? (
        <div className="grid gap-4 xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-2">
            <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
              <FlowDiagram blocks={spec.blocks} activeKey={block.key} onSelect={setPageId} />
            </div>
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">{block.title}</h3>
              <InfoButton onClick={() => onInfo(block.key)} label={`Theory and code for ${block.title}`} />
            </div>
            <Eq>{block.equation}</Eq>
            <p className="mt-2 leading-relaxed text-slate-600" style={{ fontSize: "var(--concept-text, 12.5px)" }}>{block.theory}</p>
            {compiled.errors[block.key] && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                {compiled.errors[block.key]}
              </div>
            )}
            <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-500">
                Turn the dials — the plot reacts instantly
              </div>
              {block.params.map((p) => (
                <ParamSlider key={p.key} def={p} value={params[p.key]} onChange={setParam} />
              ))}
              {!block.params.length && (
                <p className="text-[11px] text-slate-400">This step has no tunable coefficients.</p>
              )}
            </div>
          </div>
          <div className="min-w-0 xl:col-span-3">
            <ChartCard
              title={`Step ${idx} output · baseline vs. yours`}
              blockKey={block.key}
              rows={rows}
              tMax={spec.protocol.T}
              height={chartH}
              pinnedT={pinnedT}
              onPin={onPin}
              onInfo={onInfo}
              onInspect={onInspect}
            />
            <p className="mt-2 text-[11px] text-slate-400">
              Dashed gray = the paper's published setting · solid blue = your current dials. Right-click
              any point for exact values and deltas.
            </p>
          </div>
        </div>
      ) : null}
    </LabWindow>
  );
}

/* ---------------- results lab window ---------------- */

function ResultsLab({ spec, pipelineCompiled, helpers, baseOutputs, actOutputs, defaults, params, setParam, onOpenFig, layout }) {
  const figs = spec.resultFigures || [];
  const [pageId, setPageId] = useState(figs[0]?.figureLabel || "");
  const [showParams, setShowParams] = useState(false);
  const panelH = layout?.numeric?.panelChartH ?? 170;

  const compiled = useMemo(() => compileResultFigures(spec), [spec]);
  const baseFigHelpers = useMemo(() => makeFigureHelpers(spec, pipelineCompiled, helpers, defaults), [spec, pipelineCompiled, helpers, defaults]);
  const actFigHelpers  = useMemo(() => makeFigureHelpers(spec, pipelineCompiled, helpers, params), [spec, pipelineCompiled, helpers, params]);

  const figIndex = figs.findIndex((f) => f.figureLabel === pageId);
  const fig = figs[figIndex];

  const runs = useMemo(() => {
    if (!fig) return [];
    return (fig.panels || []).map((panel, pi) => {
      const fn = compiled.fns[`${figIndex}:${pi}`];
      return {
        base: runResultPanel(fn, baseOutputs, defaults, baseFigHelpers),
        act:  runResultPanel(fn, actOutputs, params, actFigHelpers),
      };
    });
  }, [fig, figIndex, compiled, baseOutputs, actOutputs, defaults, params, baseFigHelpers, actFigHelpers]);

  if (!figs.length) return null;
  const allParams = spec.blocks.flatMap((b) => b.params);

  return (
    <LabWindow
      title="Results Lab — the paper's figures, live"
      accent="bg-emerald-600"
      pages={figs.map((f) => ({ id: f.figureLabel, label: `${f.figureLabel} · ${f.title.slice(0, 34)}${f.title.length > 34 ? "…" : ""}`, sub: `${f.panels?.length || 0} subplot${(f.panels?.length || 0) === 1 ? "" : "s"}` }))}
      activeId={pageId}
      onSelect={setPageId}
    >
      {fig && (
        <div>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">{fig.figureLabel} — {fig.title}</h3>
              <p className="mt-1 max-w-3xl leading-relaxed text-slate-600" style={{ fontSize: "var(--result-text, 12.5px)" }}>{fig.explanation}</p>
            </div>
            <button
              onClick={() => setShowParams(!showParams)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                showParams ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
              }`}
            >
              <SlidersHorizontal size={13} /> Tune parameters
            </button>
          </div>

          {showParams && (
            <div className="mb-3 grid gap-x-6 rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
              {allParams.map((p) => (
                <ParamSlider key={p.key} def={p} value={params[p.key]} onChange={setParam} />
              ))}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Original figure from the paper · click to enlarge
              </div>
              {fig.image ? (
                <button onClick={() => onOpenFig({ title: `${fig.figureLabel} — ${fig.title}`, image: fig.image, explanation: fig.explanation })}
                  className="block w-full overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:shadow-lg"
                  style={{ maxWidth: "var(--result-orig-max, 520px)" }}>
                  <img src={fig.image} alt={`${fig.figureLabel} from the paper`} className="w-full" loading="lazy" />
                </button>
              ) : fig.svg ? (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-2"
                  dangerouslySetInnerHTML={{ __html: fig.svg }} />
              ) : (
                <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-slate-200 px-3 text-center text-[11px] text-slate-400">
                  {fig.page ? <>{fig.figureLabel} on page {fig.page} — crop unavailable</> : "No source figure available"}
                </div>
              )}
            </div>

            <div className="xl:col-span-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Interactive reproduction · solid = your run, dashed = paper baseline
              </div>
              <div className={`grid gap-3 ${(fig.panels?.length || 0) > 1 ? "md:grid-cols-2" : ""}`}>
                {(fig.panels || []).map((panel, pi) => (
                  <PanelChart key={pi} panel={panel} baseRun={runs[pi]?.base} actRun={runs[pi]?.act} height={panelH} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </LabWindow>
  );
}

/* ---------------- main workspace ---------------- */

export default function Workspace({ spec, onBack, onSignOut }) {
  const defaults = useMemo(() => defaultsFromSpec(spec), [spec]);
  const helpers  = useMemo(() => buildHelpers(spec.protocol), [spec]);
  const compiled = useMemo(() => compileSpec(spec), [spec]);

  const [params, setParams] = useState(defaults);
  const [infoKey, setInfoKey] = useState(null);
  const [refsOpen, setRefsOpen] = useState(false);
  const [pinnedT, setPinnedT] = useState(null);
  const [inspect, setInspect] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [layout, setLayout] = useState(loadLayout);
  const [editorOpen, setEditorOpen] = useState(false);
  const sec = useCallback((k) => sectionByKey(layout, k), [layout]);

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
    <div className="min-h-screen pb-16" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", ...layoutStyle(layout) }}>
      {/* ===== header ===== */}
      <header className="border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto px-4 py-5 sm:px-6" style={{ maxWidth: "var(--content-max, 1280px)" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-3xl">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                <FlaskConical size={13} /> Interactive Paper Playground
              </div>
              <h1 className="font-bold leading-snug text-slate-900" style={{ fontSize: "var(--title-size, 22px)" }}>
                {spec.meta.title}
              </h1>
              <p className="mt-1 text-slate-500" style={{ fontSize: "var(--author-size, 12px)" }}>
                {spec.meta.authors}
                {spec.meta.venue ? <> · <span className="italic">{spec.meta.venue}</span></> : null}
              </p>
              <p className="mt-2 leading-relaxed text-slate-600" style={{ fontSize: "var(--abstract-size, 13px)" }}>{spec.meta.abstract}</p>
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
                onClick={() => setEditorOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:border-blue-300 hover:text-blue-700"
              >
                <LayoutTemplate size={14} /> Edit layout
              </button>
              <button
                onClick={() => { setParams(defaults); setPinnedT(null); }}
                disabled={modifiedCount === 0}
                className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-40"
              >
                <RotateCcw size={14} /> Reset to author baseline
              </button>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:border-slate-300"
                >
                  <LogOut size={14} /> Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto px-4 pt-4 sm:px-6" style={{ maxWidth: "var(--content-max, 1280px)" }}>
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

        {/* ===== 1 · concept figures (clickable → fullscreen) ===== */}
        {spec.conceptFigures?.length && sec("concept").on ? (
          <section aria-label="Concept primer">
            <SectionHeader num={1} tone="violet" icon={ImageIcon} title={sec("concept").title} sub={sec("concept").sub} />
            <ConceptFigures figures={spec.conceptFigures} onOpen={setLightbox} />
          </section>
        ) : null}

        {/* ===== 2 · foundations (borrowed core ideas) ===== */}
        {spec.foundations?.length && sec("foundations").on ? (
          <section aria-label="Foundations from prior work">
            <SectionHeader num={2} tone="amber" icon={Landmark} title={sec("foundations").title} sub={sec("foundations").sub} />
            <Foundations foundations={spec.foundations} />
          </section>
        ) : null}

        {/* ===== 3 · concept lab window ===== */}
        {sec("method").on ? (
          <section aria-label="The paper's contribution">
            <SectionHeader num={3} tone="blue" icon={GitBranch} title={sec("method").title} sub={sec("method").sub} />
            <ConceptLab
              spec={spec}
              params={params}
              defaults={defaults}
              setParam={setParam}
              rows={rows}
              compiled={compiled}
              pinnedT={pinnedT}
              onPin={togglePin}
              onInfo={setInfoKey}
              onInspect={setInspect}
              layout={layout}
            />
          </section>
        ) : null}

        {/* ===== 4 · results lab window ===== */}
        {spec.resultFigures?.length && sec("results").on ? (
          <section aria-label="Reproduced result figures">
            <SectionHeader num={4} tone="emerald" icon={LineChartIcon} title={sec("results").title} sub={sec("results").sub} />
            <ResultsLab
              spec={spec}
              pipelineCompiled={compiled}
              helpers={helpers}
              baseOutputs={baseline.outputs}
              actOutputs={active.outputs}
              defaults={defaults}
              params={params}
              setParam={setParam}
              onOpenFig={setLightbox}
              layout={layout}
            />
          </section>
        ) : null}
      </main>

      <InfoModal block={infoBlock} onClose={() => setInfoKey(null)} />
      <ReferencesDrawer references={spec.references} open={refsOpen} onClose={() => setRefsOpen(false)} />
      <Inspector inspect={inspect} rows={rows} onClose={() => setInspect(null)} />
      <Lightbox fig={lightbox} onClose={() => setLightbox(null)} />
      <LayoutEditor open={editorOpen} layout={layout} onChange={setLayout} onClose={() => setEditorOpen(false)} />
    </div>
  );
}
