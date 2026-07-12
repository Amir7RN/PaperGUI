/**
 * Generic interactive workspace, driven entirely by a PaperSpec object —
 * either the bundled sample or one extracted from an uploaded PDF by the AI.
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
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import {
  Info, RotateCcw, BookOpen, X, FlaskConical, SlidersHorizontal,
  Activity, GitBranch, Pin, PinOff, FileText, Code2, Sigma, Waves, Cpu,
  ChevronRight, TriangleAlert, CircleCheck, CircleAlert, ArrowLeft, Image as ImageIcon, LogOut,
  Landmark, Maximize2, Lightbulb, LineChart as LineChartIcon, LayoutTemplate, Move,
  Sparkles, BookMarked, Play, Pause, Puzzle, Rocket, Network, ChevronLeft, FileCode2,
} from "lucide-react";
import LayoutEditor from "./LayoutEditor.jsx";
import DesignBox from "./DesignBox.jsx";
import { loadLayout, saveLayout, layoutStyle, sectionByKey } from "./layout.js";
import {
  buildHelpers, defaultsFromSpec, compileSpec, runSpec, buildRows,
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

/* draggable top-level boxes on the free-form canvas */
const BOX_IDS = ["conclusion", "sec-story", "sec-concept", "sec-foundations", "sec-method", "sec-results"];

const fmt = (v, d = 3) =>
  v === undefined || v === null || Number.isNaN(v) ? "–" : (+v).toFixed(d);

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
  rose:    { badge: "bg-rose-600",    ring: "ring-rose-200/60",    text: "text-rose-700"    },
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
        <h2 className="flex items-center gap-2 font-bold text-slate-900" style={{ fontSize: "calc(var(--sec-head, 16px) * var(--box-font-scale, 1))" }}>
          <IconCmp size={16} className={t.text} /> {title}
        </h2>
        <p className="mt-0.5 leading-relaxed text-slate-500" style={{ fontSize: "calc(var(--sec-sub, 12px) * var(--box-font-scale, 1))" }}>{sub}</p>
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

/* ---------------- 0 · the story, as an auto-playing animated sequence ----
 * No text walls: the story plays itself like a short film's title cards —
 * one animated beat at a time with tap-to-jump progress bars (story-player
 * pattern). Pause, scrub, replay. */

const BEAT_HUES = {
  problem:      { bg: "from-slate-800 to-slate-900",  chip: "bg-red-500/20 text-red-300",       bar: "#e34948" },
  gap:          { bg: "from-slate-800 to-slate-900",  chip: "bg-amber-500/20 text-amber-300",   bar: "#eda100" },
  contribution: { bg: "from-slate-800 to-slate-900",  chip: "bg-rose-500/20 text-rose-300",     bar: "#e0447c" },
  payoff:       { bg: "from-slate-800 to-slate-900",  chip: "bg-emerald-500/20 text-emerald-300", bar: "#1baf7a" },
};

function StoryPlayer({ story }) {
  const beats = useMemo(() => {
    if (!story) return [];
    const b = [];
    if (story.problem) b.push({ kind: "problem", Icon: TriangleAlert, kicker: "The problem", headline: null, text: story.problem });
    if (story.gap)     b.push({ kind: "gap", Icon: Puzzle, kicker: "What was missing", headline: null, text: story.gap });
    (story.contribution || []).forEach((c, i, arr) => {
      b.push({ kind: "contribution", Icon: Sparkles, kicker: `This paper adds — ${i + 1} of ${arr.length}`, headline: c.headline, text: c.detail });
    });
    if (story.whyItMatters) b.push({ kind: "payoff", Icon: Rocket, kicker: "Why it matters", headline: null, text: story.whyItMatters });
    return b;
  }, [story]);

  const DUR = 7000;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [cycle, setCycle] = useState(0); // bumps to restart the bar animation on replay

  useEffect(() => {
    if (!playing || beats.length < 2) return;
    const t = setTimeout(() => {
      setIdx((i) => (i + 1 < beats.length ? i + 1 : (setPlaying(false), i)));
    }, DUR);
    return () => clearTimeout(t);
  }, [idx, playing, beats.length, cycle]);

  if (!beats.length) return null;
  const beat = beats[Math.min(idx, beats.length - 1)];
  const hue = BEAT_HUES[beat.kind];
  const BeatIcon = beat.Icon;
  const jump = (i) => { setIdx(i); setPlaying(true); setCycle((c) => c + 1); };

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${hue.bg} shadow-lg`}>
      <style>{`
        @keyframes beatIn { from { opacity: 0; transform: translateY(14px) scale(0.985); } to { opacity: 1; transform: none; } }
        @keyframes beatIcon { 0% { opacity: 0; transform: scale(0.4) rotate(-8deg); } 60% { transform: scale(1.12); } 100% { opacity: 1; transform: none; } }
        @keyframes beatBar { from { width: 0%; } to { width: 100%; } }
      `}</style>

      {/* tap-to-jump progress bars */}
      <div className="absolute left-0 right-0 top-0 z-10 flex gap-1 px-3 pt-3">
        {beats.map((b, i) => (
          <button key={i} onClick={() => jump(i)} aria-label={`Story part ${i + 1}`}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
            <span
              className="block h-full rounded-full"
              style={{
                background: BEAT_HUES[b.kind].bar,
                width: i < idx ? "100%" : i > idx ? "0%" : undefined,
                animation: i === idx && playing ? `beatBar ${DUR}ms linear forwards` : undefined,
                animationName: i === idx && playing ? "beatBar" : undefined,
                ...(i === idx && !playing ? { width: "100%" } : {}),
              }}
              key={`${i}-${cycle}-${i === idx}`}
            />
          </button>
        ))}
      </div>

      {/* the beat itself — re-keyed so the entrance animation replays */}
      <div key={`${idx}-${cycle}`} className="flex min-h-[240px] flex-col items-center justify-center px-6 py-12 text-center sm:px-16"
        style={{ animation: "beatIn 600ms cubic-bezier(0.22,1,0.36,1) both" }}>
        <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${hue.chip}`}
          style={{ animation: "beatIcon 700ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
          <BeatIcon size={22} />
        </div>
        <div className={`mb-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${hue.chip}`}>
          {beat.kicker}
        </div>
        {beat.headline && (
          <h3 className="mb-2 max-w-2xl text-xl font-extrabold leading-snug text-white sm:text-2xl">{beat.headline}</h3>
        )}
        <p className={`max-w-2xl leading-relaxed text-slate-200 ${beat.headline ? "text-[14px]" : "text-lg font-medium sm:text-xl"}`}>
          {beat.text}
        </p>
      </div>

      {/* controls */}
      <div className="absolute bottom-3 left-0 right-0 z-10 flex items-center justify-center gap-2">
        <button onClick={() => jump(Math.max(0, idx - 1))} aria-label="Previous"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/25"><ChevronLeft size={15} /></button>
        <button
          onClick={() => { if (!playing && idx === beats.length - 1) { jump(0); } else { setPlaying(!playing); setCycle((c) => c + 1); } }}
          aria-label={playing ? "Pause" : "Play"}
          className="rounded-full bg-white/15 px-4 py-2 text-white hover:bg-white/30">
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button onClick={() => jump(Math.min(beats.length - 1, idx + 1))} aria-label="Next"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/25"><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

/* ---------------- the paper as a clickable concept map ---------------- */

const NODE_KINDS = {
  paper:        { fill: "#0f172a", stroke: "#334155", ink: "#fff",    legend: "the paper" },
  problem:      { fill: "#fdeeee", stroke: "#e34948", ink: "#7f1d1d", legend: "problem" },
  prior:        { fill: "#fdf6e3", stroke: "#eda100", ink: "#713f12", legend: "prior work" },
  method:       { fill: "#eef4fc", stroke: "#2a78d6", ink: "#1e3a8a", legend: "method" },
  contribution: { fill: "#fdeef5", stroke: "#e0447c", ink: "#831843", legend: "contribution" },
  result:       { fill: "#e9f9f2", stroke: "#1baf7a", ink: "#064e3b", legend: "result" },
};

function MindMap({ mindmap }) {
  const [activeId, setActiveId] = useState(null);
  const nodes = mindmap?.nodes || [];
  const edges = mindmap?.edges || [];
  if (nodes.length < 2) return null;

  const center = nodes.find((n) => n.kind === "paper") || nodes[0];
  const ring = nodes.filter((n) => n !== center);

  const W = 900, H = 470, cx = W / 2, cy = H / 2;
  const NW = 150, NH = 54;
  const rx = (W - NW) / 2 - 12, ry = (H - NH) / 2 - 12;

  const pos = { [center.id]: { x: cx, y: cy } };
  ring.forEach((n, i) => {
    const a = (i / ring.length) * 2 * Math.PI - Math.PI / 2;
    pos[n.id] = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });

  const active = nodes.find((n) => n.id === activeId) || null;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <Network size={13} className="text-rose-600" /> The whole paper, one map — click any node
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {Object.entries(NODE_KINDS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: v.stroke }} /> {v.legend}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <style>{`
          @keyframes nodePop { from { opacity: 0; transform: scale(0.55); } to { opacity: 1; transform: none; } }
          @keyframes edgeDraw { to { stroke-dashoffset: 0; } }
          .mm-node { transform-box: fill-box; transform-origin: center; animation: nodePop 500ms cubic-bezier(0.34,1.56,0.64,1) both; cursor: pointer; }
          .mm-edge { stroke-dasharray: 400; stroke-dashoffset: 400; animation: edgeDraw 900ms ease-out forwards; }
        `}</style>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Concept map of the paper" style={{ minWidth: 640 }}>
          {edges.map((e, i) => {
            const a = pos[e.from], b = pos[e.to];
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cbd5e1" strokeWidth="1.5"
                  className="mm-edge" style={{ animationDelay: `${150 + i * 80}ms` }} />
                {e.label ? (
                  <>
                    <rect x={mx - 30} y={my - 9} width="60" height="16" rx="8" fill="white" opacity="0.9" />
                    <text x={mx} y={my + 3} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="600">
                      {e.label.slice(0, 14)}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}
          {nodes.map((n, i) => {
            const p = pos[n.id];
            if (!p) return null;
            const k = NODE_KINDS[n.kind] || NODE_KINDS.method;
            const isCenter = n === center;
            const w = isCenter ? NW + 26 : NW, h = isCenter ? NH + 10 : NH;
            const selected = activeId === n.id;
            return (
              <g key={n.id} className="mm-node" style={{ animationDelay: `${i * 90}ms` }}
                onClick={() => setActiveId(selected ? null : n.id)} role="button" aria-label={n.label}>
                <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={h / 2}
                  fill={k.fill} stroke={k.stroke} strokeWidth={selected ? 3 : 1.8} />
                {selected && (
                  <rect x={p.x - w / 2 - 3} y={p.y - h / 2 - 3} width={w + 6} height={h + 6} rx={(h + 6) / 2}
                    fill="none" stroke={k.stroke} strokeWidth="5" opacity="0.25" />
                )}
                <foreignObject x={p.x - w / 2 + 8} y={p.y - h / 2 + 6} width={w - 16} height={h - 12}>
                  <div xmlns="http://www.w3.org/1999/xhtml"
                    style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                             textAlign: "center", fontSize: isCenter ? "12px" : "11px", fontWeight: 700,
                             lineHeight: 1.2, color: k.ink, overflow: "hidden" }}>
                    {n.label}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>

      {/* click-to-read detail — the only prose, and only on demand */}
      <div className={`mt-2 rounded-xl border px-4 py-3 transition-colors ${active ? "border-slate-300 bg-slate-50" : "border-dashed border-slate-200 bg-transparent"}`}>
        {active ? (
          <div className="flex items-start gap-2.5">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: (NODE_KINDS[active.kind] || NODE_KINDS.method).stroke }} />
            <div>
              <div className="text-[12px] font-bold text-slate-800">{active.label}</div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">{active.detail}</p>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">Click a node to see what it means for this paper.</p>
        )}
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
            {/* only the paper's real figure — never a fabricated stand-in */}
            {fig.image ? (
              <div className="mb-3 flex items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
                <img src={fig.image} alt={fig.title}
                  className="max-h-64 w-auto max-w-full object-contain" loading="lazy" />
              </div>
            ) : fig.page != null ? (
              <div className="mb-3 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-400">
                Figure on PDF page {fig.page} (preview unavailable)
              </div>
            ) : null}
            <p className="text-[13px] leading-relaxed text-slate-600 line-clamp-4">{fig.explanation}</p>
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
            <p className={`leading-relaxed text-slate-600 ${f.equation ? "mt-2.5" : ""}`} style={{ fontSize: "calc(var(--found-text, 13px) * var(--box-font-scale, 1))" }}>{f.concept}</p>
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
  const [readout, setReadout] = useState(null);
  const series = [
    { key: blockKey + "B", label: "Baseline (paper)", color: C.baseline, dash: "6 4" },
    { key: blockKey + "A", label: "Modified (you)",   color: C.active },
  ];

  const handleMove = useCallback((state) => {
    if (state && state.activeTooltipIndex != null) lastHover.current = state.activeTooltipIndex;
    if (state?.activePayload?.length) {
      setReadout({
        x: state.activeLabel,
        rows: series.map((s) => {
          const p = state.activePayload.find((ap) => ap.dataKey === s.key);
          return p ? { ...s, value: p.value } : null;
        }).filter(Boolean),
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
              content={() => null}
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
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
        <LegendRow items={series} />
        <div className="rounded-md bg-slate-50 px-2 py-1 text-[11px] tabular-nums text-slate-600">
          {readout ? (
            <>
              t = <strong>{fmt(readout.x, 2)}</strong>
              {readout.rows.map((r) => (
                <span key={r.key} className="ml-3">
                  <span style={{ color: r.color === C.baseline ? "#52514e" : r.color }}>{r.label}:</span>{" "}
                  <strong>{fmt(r.value)}</strong>
                </span>
              ))}
            </>
          ) : (
            <span className="text-slate-400">hover the plot for exact values</span>
          )}
        </div>
      </div>
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

/** One subplot. Hover values are NOT drawn on the plot (a floating box hides
 *  the curves) — they're forwarded to a dedicated readout box via onHover. */
function PanelChart({ panel, baseRun, actRun, height = 170, onHover }) {
  const kind = panel.chartKind || "line";
  const categories = actRun?.categories || baseRun?.categories || null;
  const { rows } = useMemo(() => {
    const r = buildPanelRows(baseRun, actRun);
    if (kind === "bar" && categories) {
      r.rows = r.rows.map((row, i) => ({ ...row, _c: categories[i] ?? String(row._i) }));
    }
    return r;
  }, [baseRun, actRun, kind, categories]);
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

  const handleMove = useCallback((state) => {
    if (!onHover || !state?.activePayload?.length) return;
    onHover({
      subplot: panel.subplotLabel,
      xLabel: panel.xLabel,
      yLabel: panel.yLabel,
      x: state.activeLabel,
      rows: legend.map((l) => {
        const p = state.activePayload.find((ap) => ap.dataKey === l.key);
        return p ? { ...l, value: p.value } : null;
      }).filter(Boolean),
    });
  }, [onHover, panel, legend]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-lg border border-slate-100 bg-white p-2">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          {panel.subplotLabel}
          {panel.dataSource === "reported" && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
              paper's numbers
            </span>
          )}
        </span>
        <span className="text-[10px] text-slate-400">{panel.xLabel} → {panel.yLabel}</span>
      </div>
      {err ? (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-2 text-[11px] text-red-700">{err}</div>
      ) : kind === "bar" ? (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={rows} margin={{ top: 6, right: 10, bottom: 2, left: -12 }}
            onMouseMove={handleMove}>
            <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey={categories ? "_c" : "_i"} type="category"
              tick={{ fill: C.inkMuted, fontSize: 9 }} stroke={C.axis} tickLine={false}
              interval={0} angle={rows.length > 6 ? -30 : 0} height={rows.length > 6 ? 42 : 30}
            />
            <YAxis
              tick={{ fill: C.inkMuted, fontSize: 9 }} stroke="transparent"
              tickLine={false} width={42} tickFormatter={(v) => fmt(v, 1)}
            />
            <Tooltip content={() => null} cursor={{ fill: "rgba(100,116,139,0.08)" }}
              isAnimationActive={false} />
            {legend.map((l) => (
              <Bar key={l.key} dataKey={l.key}
                fill={l.dash ? "transparent" : l.color}
                stroke={l.dash ? l.color : undefined}
                strokeWidth={l.dash ? 1.5 : 0}
                strokeDasharray={l.dash || undefined}
                isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows} margin={{ top: 6, right: 10, bottom: 2, left: -12 }}
            onMouseMove={handleMove}>
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
            {/* cursor line only — values go to the readout box, never over the curves */}
            <Tooltip
              content={() => null}
              cursor={{ stroke: C.inkMuted, strokeWidth: 1, strokeDasharray: "3 3" }}
              isAnimationActive={false}
            />
            {legend.map((l) => (
              <Line key={l.key} dataKey={l.key} stroke={l.color}
                strokeWidth={kind === "scatter" ? 0 : 1.8}
                dot={kind === "scatter" ? { r: 2.2, fill: l.color, strokeWidth: 0 } : false}
                strokeDasharray={l.dash || undefined} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <LegendRow items={legend} />
    </div>
  );
}

/** Dedicated live-readout box: shows the hovered subplot's values as a table. */
function ReadoutBox({ hover }) {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Live readout — hover any subplot
      </div>
      {hover ? (
        <>
          <div className="mb-1 text-[11px] font-semibold text-slate-700">
            {hover.subplot} · {hover.xLabel} = <span className="tabular-nums">{fmt(hover.x, 2)}</span>
          </div>
          <table className="w-full">
            <tbody>
              {hover.rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-0.5 pr-2">
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <svg width="16" height="4" aria-hidden="true">
                        <line x1="0" y1="2" x2="16" y2="2" stroke={r.color} strokeWidth="2"
                          strokeDasharray={r.dash || "none"} />
                      </svg>
                      {r.label}
                    </span>
                  </td>
                  <td className="py-0.5 text-right text-[12px] font-semibold tabular-nums text-slate-800">
                    {fmt(r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-[11px] text-slate-400">
          Move the mouse across any plot on the right — exact values appear here instead of covering the curves.
        </p>
      )}
    </div>
  );
}

/** The real cropped figure with 3-6 numbered hotspot markers pinned on it —
 *  the clickable version of the guided tour. Click a marker to read what
 *  happens at that exact spot; click the image itself (outside a marker) to
 *  open it fullscreen via `onOpen`, when provided. */
function HotspotFigure({ fig, onOpen }) {
  const [activeIdx, setActiveIdx] = useState(null);
  const hotspots = fig.hotspots || [];
  const active = activeIdx != null ? hotspots[activeIdx] : null;

  if (!fig.image && !fig.svg) return null;

  const Wrapper = onOpen ? "button" : "div";
  return (
    <div>
      <Wrapper
        {...(onOpen ? { type: "button", onClick: onOpen } : {})}
        className="relative block w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-left transition hover:shadow-lg"
      >
        {fig.image
          ? <img src={fig.image} alt={`${fig.figureLabel} from the paper`} className="w-full" loading="lazy" />
          : <div className="p-2" dangerouslySetInnerHTML={{ __html: fig.svg }} />}
        {hotspots.map((h, i) => (
          <span
            key={i}
            role="button"
            tabIndex={0}
            aria-label={h.label}
            onClick={(e) => { e.stopPropagation(); setActiveIdx(activeIdx === i ? null : i); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setActiveIdx(activeIdx === i ? null : i); } }}
            className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-md transition ${
              activeIdx === i
                ? "scale-125 border-white bg-rose-600 text-white"
                : "border-white bg-rose-500/90 text-white hover:scale-110"
            }`}
            style={{ left: `${(h.x ?? 0.5) * 100}%`, top: `${(h.y ?? 0.5) * 100}%` }}
          >
            {i + 1}
          </span>
        ))}
      </Wrapper>
      {hotspots.length > 0 && (
        <div className={`mt-2 rounded-lg border px-3 py-2 transition-colors ${active ? "border-rose-200 bg-rose-50/70" : "border-dashed border-slate-200"}`}>
          {active ? (
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white">
                {activeIdx + 1}
              </span>
              <div>
                <div className="text-[11.5px] font-bold text-rose-900">{active.label}</div>
                <p className="text-[12px] leading-relaxed text-slate-700">{active.note}</p>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">Click a numbered marker on the figure to see what it proves.</p>
          )}
        </div>
      )}
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

/* ---------------- the paper's takeaway ---------------- */

/** The paper's core finding, stated plainly. If the reader has moved any
 *  sliders, a gentle note explains they're now looking at their own what-if
 *  next to the paper's baseline — no internal metrics, no jargon. */
function TakeawayBox({ conclusion, modifiedCount, onReset }) {
  const exploring = modifiedCount > 0;
  return (
    <div className={`rounded-xl border-2 p-4 ${exploring ? "border-sky-300 bg-sky-50 text-sky-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
      <div className="flex items-start gap-3">
        {exploring
          ? <CircleAlert size={20} className="mt-0.5 shrink-0" />
          : <CircleCheck size={20} className="mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">What the paper found</h2>
          <p className="mt-1 text-[13px] leading-relaxed opacity-90">{conclusion}</p>
          {exploring && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
              <span className="rounded-full bg-white/70 px-2.5 py-1 font-medium">
                You've changed {modifiedCount} dial{modifiedCount === 1 ? "" : "s"} from the paper's published values —
                the plots now show your what-if experiment next to the paper's own setting.
              </span>
              {onReset && (
                <button onClick={onReset}
                  className="rounded-full bg-sky-600 px-2.5 py-1 font-semibold text-white hover:bg-sky-700">
                  Back to the paper's values
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- foundation demos: interactive mini-labs ---------------- */

/** Compile & run a foundation demo kernel: function(params, helpers) -> result. */
function useDemo(demo) {
  const helpers = useMemo(
    () => buildHelpers({ T: demo?.T || 10, dt: demo?.dt || 0.05 }),
    [demo]
  );
  const fn = useMemo(() => {
    if (!demo?.computeJs) return null;
    try {
      // eslint-disable-next-line no-new-func
      return new Function("params", "helpers", demo.computeJs);
    } catch { return null; }
  }, [demo]);
  const [params, setParams] = useState(() =>
    Object.fromEntries((demo?.params || []).map((p) => [p.key, p.def]))
  );
  useEffect(() => {
    setParams(Object.fromEntries((demo?.params || []).map((p) => [p.key, p.def])));
  }, [demo]);
  const result = useMemo(() => {
    if (!fn) return { error: "demo failed to compile" };
    try { return { value: fn(params, helpers) }; }
    catch (e) { return { error: `demo error: ${e.message}` }; }
  }, [fn, params, helpers]);
  const setParam = (key, v) => setParams((p) => ({ ...p, [key]: Number.isFinite(v) ? v : p[key] }));
  return { helpers, params, setParam, result };
}

/** Chart demo (line / bar / scatter) with its own dials and a readout. */
function DemoChart({ demo }) {
  const { helpers, params, setParam, result } = useDemo(demo);
  const [readout, setReadout] = useState(null);
  const kind = demo.chartKind || "line";

  const { rows, legend, err, categories } = useMemo(() => {
    if (result.error) return { rows: [], legend: [], err: result.error, categories: null };
    const v = result.value;
    if (!v?.series?.length) return { rows: [], legend: [], err: "demo returned no series", categories: null };
    const n = v.series[0].data?.length || 0;
    const cats = Array.isArray(v.categories) && v.categories.length === n ? v.categories : null;
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = { _i: v.x ? v.x[i] : helpers.t[i] ?? i, _c: cats ? cats[i] : undefined };
      v.series.forEach((s, k) => { row[`s${k}`] = Number.isFinite(s.data[i]) ? s.data[i] : 0; });
      rows[i] = row;
    }
    const legend = v.series.map((s, k) => ({ key: `s${k}`, label: s.label, color: SERIES_HUES[k % SERIES_HUES.length] }));
    return { rows, legend, err: null, categories: cats };
  }, [result, helpers]);

  const handleMove = useCallback((state) => {
    if (!state?.activePayload?.length) return;
    setReadout({
      x: state.activeLabel,
      rows: legend.map((l) => {
        const p = state.activePayload.find((ap) => ap.dataKey === l.key);
        return p ? { ...l, value: p.value } : null;
      }).filter(Boolean),
    });
  }, [legend]);

  return (
    <div>
      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{err}</div>
      ) : (
        <div className="rounded-lg border border-slate-100 bg-white p-2">
          <div className="mb-1 flex items-baseline justify-end px-1">
            <span className="text-[10px] text-slate-400">{demo.xLabel} → {demo.yLabel}</span>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            {kind === "bar" || categories ? (
              <BarChart data={rows} margin={{ top: 6, right: 10, bottom: 2, left: -8 }} onMouseMove={handleMove}>
                <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
                <XAxis dataKey={categories ? "_c" : "_i"} type="category"
                  tick={{ fill: C.inkMuted, fontSize: 9 }} stroke={C.axis} tickLine={false}
                  interval={0} angle={rows.length > 6 ? -30 : 0} height={rows.length > 6 ? 44 : 30} />
                <YAxis tick={{ fill: C.inkMuted, fontSize: 9 }} stroke="transparent"
                  tickLine={false} width={44} tickFormatter={(v) => fmt(v, 1)} />
                <Tooltip content={() => null} cursor={{ fill: "rgba(100,116,139,0.08)" }}
                  isAnimationActive={false} />
                {legend.map((l) => (
                  <Bar key={l.key} dataKey={l.key} fill={l.color} isAnimationActive={false} />
                ))}
              </BarChart>
            ) : (
              <LineChart data={rows} margin={{ top: 6, right: 10, bottom: 2, left: -8 }} onMouseMove={handleMove}>
                <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
                <XAxis dataKey="_i" type="number" domain={["dataMin", "dataMax"]}
                  tick={{ fill: C.inkMuted, fontSize: 9 }} stroke={C.axis} tickLine={false}
                  tickFormatter={(v) => fmt(v, 1)} />
                <YAxis tick={{ fill: C.inkMuted, fontSize: 9 }} stroke="transparent"
                  tickLine={false} width={44} tickFormatter={(v) => fmt(v, 1)} />
                <Tooltip content={() => null}
                  cursor={{ stroke: C.inkMuted, strokeWidth: 1, strokeDasharray: "3 3" }}
                  isAnimationActive={false} />
                {legend.map((l) => (
                  <Line key={l.key} dataKey={l.key} stroke={l.color}
                    strokeWidth={kind === "scatter" ? 0 : 2}
                    dot={kind === "scatter" ? { r: 2.4, fill: l.color, strokeWidth: 0 } : false}
                    isAnimationActive={false} />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
            <LegendRow items={legend} />
            <div className="rounded-md bg-slate-50 px-2 py-1 text-[11px] tabular-nums text-slate-600">
              {readout
                ? <>x = <strong>{fmt(readout.x, 2)}</strong>{readout.rows.map((r) => (
                    <span key={r.key} className="ml-3"><span style={{ color: r.color }}>{r.label}:</span> <strong>{fmt(r.value)}</strong></span>
                  ))}</>
                : <span className="text-slate-400">hover for values</span>}
            </div>
          </div>
        </div>
      )}
      {demo.params?.length ? (
        <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-1.5">
          {demo.params.map((p) => (
            <ParamSlider key={p.key} def={p} value={params[p.key]} onChange={setParam} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Animated-grid demo (value iteration, message passing, network updates, …):
 *  kernel returns { frames: [{ grid: number[][], note }] }; play/step through. */
function DemoFrames({ demo }) {
  const { params, setParam, result } = useDemo(demo);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  const frames = result.value?.frames || [];
  useEffect(() => { setIdx(0); setPlaying(false); }, [result.value]);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1 < frames.length ? i + 1 : (setPlaying(false), i))), 650);
    return () => clearInterval(t);
  }, [playing, frames.length]);

  if (result.error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{result.error}</div>;
  }
  const frame = frames[Math.min(idx, frames.length - 1)];
  if (!frame?.grid?.length) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">demo returned no frames</div>;
  }

  let mn = Infinity, mx = -Infinity;
  for (const f of frames) for (const row of f.grid) for (const v of row) {
    if (Number.isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  }
  const span = mx - mn || 1;
  const cellColor = (v) => {
    const u = (v - mn) / span; // sequential blue ramp, light -> dark
    const light = [205, 226, 251], dark = [13, 54, 107];
    const c = light.map((l, i) => Math.round(l + (dark[i] - l) * u));
    return { bg: `rgb(${c.join(",")})`, ink: u > 0.55 ? "#fff" : "#0b0b0b" };
  };
  const small = frame.grid.length <= 9 && frame.grid[0].length <= 9;

  return (
    <div>
      <div className="rounded-lg border border-slate-100 bg-white p-3">
        <div className="mb-2 flex items-center gap-2">
          <button onClick={() => setPlaying(!playing)}
            className="rounded-lg bg-slate-800 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-700">
            {playing ? "Pause" : "▶ Play"}
          </button>
          <button onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }}
            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">◀ step</button>
          <button onClick={() => { setPlaying(false); setIdx((i) => Math.min(frames.length - 1, i + 1)); }}
            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">step ▶</button>
          <button onClick={() => { setPlaying(false); setIdx(0); }}
            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">reset</button>
          <span className="ml-auto text-[11px] tabular-nums text-slate-400">
            step {idx + 1} / {frames.length}
          </span>
        </div>
        <div className="inline-grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${frame.grid[0].length}, minmax(0, 1fr))` }}>
          {frame.grid.flatMap((row, r) =>
            row.map((v, c) => {
              const col = cellColor(v);
              return (
                <div key={`${r}-${c}`}
                  className="flex items-center justify-center rounded-sm text-[10px] font-medium tabular-nums transition-colors duration-300"
                  style={{ background: col.bg, color: col.ink, width: small ? 44 : 26, height: small ? 44 : 26 }}>
                  {small && Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) : ""}
                </div>
              );
            })
          )}
        </div>
        {frame.note && <p className="mt-2 text-[11.5px] leading-relaxed text-slate-600">{frame.note}</p>}
      </div>
      {demo.params?.length ? (
        <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-1.5">
          {demo.params.map((p) => (
            <ParamSlider key={p.key} def={p} value={params[p.key]} onChange={setParam} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- foundations lab window ---------------- */

function FoundationsLab({ foundations }) {
  const [pageIdx, setPageIdx] = useState(0);
  const f = foundations[Math.min(pageIdx, foundations.length - 1)];
  if (!f) return null;

  return (
    <LabWindow
      title="Foundations Lab — learn the background by playing"
      accent="bg-amber-500"
      pages={foundations.map((x, i) => ({ id: String(i), label: x.title, sub: x.source.split(",")[0] }))}
      activeId={String(pageIdx)}
      onSelect={(id) => setPageIdx(+id)}
    >
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-2">
          <h3 className="text-sm font-bold text-slate-900">{f.title}</h3>
          <p className="text-[11px] italic text-slate-400">{f.source}</p>
          <p className="mt-2 leading-relaxed text-slate-700" style={{ fontSize: "calc(var(--found-text, 13px) * var(--box-font-scale, 1))" }}>
            {f.concept}
          </p>
          {f.equation ? (
            <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
              <summary className="cursor-pointer select-none text-[11px] font-semibold text-slate-500 hover:text-amber-600">
                Show the math
              </summary>
              <div className="mt-2"><Eq>{f.equation}</Eq></div>
            </details>
          ) : null}
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50/70 px-3 py-2">
            <Lightbulb size={13} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-[12px] leading-relaxed text-amber-900">
              <span className="font-semibold">What this paper adds: </span>{f.whyItMatters}
            </p>
          </div>
        </div>
        <div className="min-w-0 xl:col-span-3">
          {f.demo ? (
            <>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Try it — {f.demo.caption}
              </div>
              {f.demo.kind === "frames" ? <DemoFrames demo={f.demo} /> : <DemoChart demo={f.demo} />}
            </>
          ) : (
            <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-400">
              No interactive demo for this concept
            </div>
          )}
        </div>
      </div>
    </LabWindow>
  );
}

/* ---------------- explorables lab: honest interactivity for EVERY paper ---
 * Each explorable is either basis 'equation' (the paper's own model on
 * sliders, defaults = its fitted/reported coefficients) or 'reported' (the
 * paper's own published numbers as an interactive chart). Same demo schema
 * as foundations, so it reuses DemoChart / DemoFrames verbatim. */

function ExplorablesLab({ explorables }) {
  const [pageIdx, setPageIdx] = useState(0);
  const ex = explorables[Math.min(pageIdx, explorables.length - 1)];
  if (!ex) return null;

  const BASIS = {
    equation: { label: "Paper's equation", tone: "bg-blue-50 text-blue-700 border-blue-200", Icon: Sigma },
    reported: { label: "Paper's reported data", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: BookMarked },
  };
  const basis = BASIS[ex.basis] || BASIS.equation;
  const BasisIcon = basis.Icon;

  return (
    <LabWindow
      title="Explorables Lab — the paper's own equations and numbers, on sliders"
      accent="bg-amber-500"
      pages={explorables.map((x, i) => ({ id: String(i), label: x.title, sub: x.source }))}
      activeId={String(pageIdx)}
      onSelect={(id) => setPageIdx(+id)}
    >
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-2">
          <div className={`mb-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${basis.tone}`}>
            <BasisIcon size={12} /> {basis.label}
          </div>
          <h3 className="text-sm font-bold text-slate-900">{ex.title}</h3>
          <p className="text-[11px] italic text-slate-400">Source: {ex.source}</p>
          <p className="mt-2 leading-relaxed text-slate-700" style={{ fontSize: "calc(var(--found-text, 13px) * var(--box-font-scale, 1))" }}>
            {ex.story}
          </p>
        </div>
        <div className="min-w-0 xl:col-span-3">
          {ex.demo ? (
            <>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Try it — {ex.demo.caption}
              </div>
              {ex.demo.kind === "frames" ? <DemoFrames demo={ex.demo} /> : <DemoChart demo={ex.demo} />}
            </>
          ) : (
            <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-400">
              No interactive demo for this explorer
            </div>
          )}
        </div>
      </div>
    </LabWindow>
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
            {/* the story first — plain language, no formulas in your face */}
            <p className="leading-relaxed text-slate-700" style={{ fontSize: "calc(var(--concept-text, 12.5px) * 1.1 * var(--box-font-scale, 1))" }}>
              {block.plain || block.theory}
            </p>
            <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
              <summary className="cursor-pointer select-none text-[11px] font-semibold text-slate-500 hover:text-blue-600">
                Show the math &amp; the paper's own wording
              </summary>
              <div className="mt-2">
                <Eq>{block.equation}</Eq>
                <p className="mt-2 leading-relaxed text-slate-600" style={{ fontSize: "calc(var(--concept-text, 12.5px) * var(--box-font-scale, 1))" }}>{block.theory}</p>
              </div>
            </details>
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
  const [hover, setHover] = useState(null);
  const panelH = layout?.numeric?.panelChartH ?? 170;

  useEffect(() => { setHover(null); }, [pageId]);

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
      title="Results Lab — the paper's real figures, explained"
      accent="bg-emerald-600"
      pages={figs.map((f) => ({
        id: f.figureLabel,
        label: `${f.figureLabel} · ${f.title.slice(0, 34)}${f.title.length > 34 ? "…" : ""}`,
        sub: f.panels?.length
          ? `${f.panels.length} live subplot${f.panels.length === 1 ? "" : "s"}`
          : "guided tour",
      }))}
      activeId={pageId}
      onSelect={setPageId}
    >
      {fig && (() => {
        const hasPanels = (fig.panels?.length || 0) > 0;
        const original = (fig.image || fig.svg) ? (
          <div style={hasPanels ? { maxWidth: "var(--result-orig-max, 520px)" } : { maxWidth: 760, margin: "0 auto" }}>
            <HotspotFigure
              fig={fig}
              onOpen={fig.image ? () => onOpenFig({ title: `${fig.figureLabel} — ${fig.title}`, image: fig.image, explanation: fig.explanation }) : undefined}
            />
          </div>
        ) : (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-slate-200 px-3 text-center text-[11px] text-slate-400">
            {fig.page ? <>{fig.figureLabel} on page {fig.page} — crop unavailable</> : "No source figure available"}
          </div>
        );

        return (
        <div>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">{fig.figureLabel} — {fig.title}</h3>
            </div>
            {hasPanels && (
              <button
                onClick={() => setShowParams(!showParams)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  showParams ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
                }`}
              >
                <SlidersHorizontal size={13} /> Tune parameters
              </button>
            )}
          </div>

          {showParams && hasPanels && (
            <div className="mb-3 grid gap-x-6 rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
              {allParams.map((p) => (
                <ParamSlider key={p.key} def={p} value={params[p.key]} onChange={setParam} />
              ))}
            </div>
          )}

          {hasPanels ? (
            <div className="grid gap-4 xl:grid-cols-5">
              <div className="xl:col-span-2">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  The real figure, from the paper · click to enlarge
                </div>
                {original}
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <BookMarked size={12} /> Guided tour
                  </div>
                  <p className="leading-relaxed text-slate-700" style={{ fontSize: "calc(var(--result-text, 12.5px) * var(--box-font-scale, 1))" }}>
                    {fig.explanation}
                  </p>
                </div>
                <ReadoutBox hover={hover} />
              </div>

              <div className="xl:col-span-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Interactive reproduction · solid = your dials, dashed = paper's values
                </div>
                <div className={`grid gap-3 ${(fig.panels?.length || 0) > 1 ? "md:grid-cols-2" : ""}`}>
                  {(fig.panels || []).map((panel, pi) => (
                    <PanelChart key={pi} panel={panel} baseRun={runs[pi]?.base} actRun={runs[pi]?.act} height={panelH} onHover={setHover} />
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  Plots marked <strong>paper's numbers</strong> are the paper's own published values, made
                  interactive; the rest come from a simplified live simulation of the paper's own equations,
                  built to move when you turn the dials — neither replaces the measured results on the left.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-5">
              <div className="xl:col-span-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  The real figure, from the paper · click to enlarge
                </div>
                {original}
              </div>
              <div className="xl:col-span-2">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <BookMarked size={12} /> Guided tour — what you're looking at
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
                  <p className="leading-relaxed text-slate-700" style={{ fontSize: "calc(var(--result-text, 12.5px) * 1.05 * var(--box-font-scale, 1))" }}>
                    {fig.explanation}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
        );
      })()}
    </LabWindow>
  );
}

/* ---------------- main workspace ---------------- */

export default function Workspace({ spec, onBack, onSignOut, isOwner = false }) {
  // Papers whose method isn't honestly simulatable (measured data, theory,
  // surveys…) ship with no pipeline — story, figures and foundations carry
  // the dashboard, and every pipeline-dependent section hides itself.
  const hasPipeline = (spec.blocks?.length || 0) > 0;
  const defaults = useMemo(() => defaultsFromSpec(spec), [spec]);
  const helpers  = useMemo(
    () => buildHelpers(spec.protocol?.T && spec.protocol?.dt ? spec.protocol : { T: 10, dt: 0.05 }),
    [spec]
  );
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

  // free-form canvas ("PowerPoint mode")
  const canvasRef = useRef(null);
  const boxEls = useRef({});
  // Non-owners never get free-layout mode (and can't be stranded in it by a
  // stale localStorage flag, since they have no button to exit).
  const free = isOwner && layout.freeMode;

  const registerBox = useCallback((id, el) => {
    if (el) boxEls.current[id] = el; else delete boxEls.current[id];
  }, []);

  const setBox = useCallback((id, rect) => {
    setLayout((L) => {
      const next = { ...L, boxes: { ...L.boxes, [id]: rect } };
      saveLayout(next);
      return next;
    });
  }, []);

  // enter free mode: freeze the current flow positions as the starting canvas
  const toggleFree = useCallback(() => {
    setLayout((L) => {
      if (L.freeMode) { const next = { ...L, freeMode: false }; saveLayout(next); return next; }
      // free canvas is full-bleed: measure x/w against the viewport width, y
      // against the current main top (unchanged — the hint is a fixed pill).
      const canvas = canvasRef.current?.getBoundingClientRect();
      const fullW = document.documentElement.clientWidth || (canvas?.width ?? 1280);
      const boxes = { ...L.boxes };
      if (canvas) {
        for (const [id, el] of Object.entries(boxEls.current)) {
          if (!el || boxes[id]) continue; // keep any positions already saved
          const r = el.getBoundingClientRect();
          boxes[id] = {
            x: +((r.left / fullW) * 100).toFixed(2),
            y: Math.round(r.top - canvas.top),
            w: +((r.width / fullW) * 100).toFixed(2),
            h: Math.round(r.height),
            font: 1,
          };
        }
      }
      const next = { ...L, freeMode: true, boxes };
      saveLayout(next);
      return next;
    });
  }, []);

  const canvasHeight = useMemo(() => {
    if (!free) return undefined;
    let max = 600;
    for (const id of BOX_IDS) {
      const b = layout.boxes[id];
      if (b) max = Math.max(max, b.y + b.h);
    }
    return max + 60;
  }, [free, layout.boxes]);

  useEffect(() => { setParams(defaults); setPinnedT(null); }, [defaults]);

  const baseline = useMemo(() => runSpec(spec, compiled, defaults, helpers), [spec, compiled, defaults, helpers]);
  const active   = useMemo(() => runSpec(spec, compiled, params, helpers), [spec, compiled, params, helpers]);

  const rows  = useMemo(() => buildRows(spec, helpers, baseline.outputs, active.outputs), [spec, helpers, baseline, active]);

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
              {/* Owner-only design tools — hidden from regular visitors. */}
              {isOwner && (
                <>
                  <button
                    onClick={() => setEditorOpen(true)}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:border-blue-300 hover:text-blue-700"
                  >
                    <LayoutTemplate size={14} /> Edit fonts &amp; sections
                  </button>
                  <button
                    onClick={toggleFree}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm ${
                      free ? "border-blue-500 bg-blue-600 text-white hover:bg-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
                    }`}
                  >
                    <Move size={14} /> {free ? "Done arranging" : "Free layout (drag boxes)"}
                  </button>
                </>
              )}
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

      {free && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-blue-300 bg-blue-600/95 px-4 py-2 text-[11px] font-medium text-white shadow-lg backdrop-blur">
          Free layout · drag a box by its blue label · resize from the corner · A−/A+ scales text · saves automatically
        </div>
      )}
      <main
        ref={canvasRef}
        className={free ? "relative w-full p-0" : "mx-auto pt-4"}
        style={free
          ? { height: canvasHeight, maxWidth: "none" }
          : { maxWidth: "var(--content-max, 1280px)", paddingLeft: "var(--page-pad, 24px)", paddingRight: "var(--page-pad, 24px)" }}
      >
        <DesignBox id="conclusion" label="Conclusion" mode={free ? "free" : "flow"} rect={layout.boxes.conclusion} onRect={setBox} register={registerBox}>
          <TakeawayBox
            conclusion={spec.conclusion}
            modifiedCount={modifiedCount}
            onReset={() => { setParams(defaults); setPinnedT(null); }}
          />
          {active.error && (
            <div className="mt-3 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              <strong>Pipeline error:</strong> {active.error}
            </div>
          )}
        </DesignBox>

        {(() => {
          /* sections number themselves in visible order, so hiding one never leaves a gap */
          let n = 0;
          const num = () => ++n;
          return (
            <>
              {/* ===== story · why this paper exists (animated player) ===== */}
              {spec.story && sec("story").on ? (
                <DesignBox id="sec-story" label="Story" mode={free ? "free" : "flow"} rect={layout.boxes["sec-story"]} onRect={setBox} register={registerBox}>
                  <section aria-label="The paper's story">
                    <SectionHeader num={num()} tone="rose" icon={Sparkles} title={sec("story").title} sub={sec("story").sub} />
                    <StoryPlayer story={spec.story} />
                  </section>
                </DesignBox>
              ) : null}

              {/* ===== mindmap · the whole paper as one clickable map ===== */}
              {spec.mindmap?.nodes?.length && sec("mindmap").on ? (
                <DesignBox id="sec-mindmap" label="Mind map" mode={free ? "free" : "flow"} rect={layout.boxes["sec-mindmap"]} onRect={setBox} register={registerBox}>
                  <section aria-label="The paper as a concept map">
                    <SectionHeader num={num()} tone="rose" icon={Network} title={sec("mindmap").title} sub={sec("mindmap").sub} />
                    <MindMap mindmap={spec.mindmap} />
                  </section>
                </DesignBox>
              ) : null}

              {/* ===== concept figures (clickable → fullscreen) ===== */}
              {spec.conceptFigures?.length && sec("concept").on ? (
                <DesignBox id="sec-concept" label="Idea in pictures" mode={free ? "free" : "flow"} rect={layout.boxes["sec-concept"]} onRect={setBox} register={registerBox}>
                  <section aria-label="Concept primer">
                    <SectionHeader num={num()} tone="violet" icon={ImageIcon} title={sec("concept").title} sub={sec("concept").sub} />
                    <ConceptFigures figures={spec.conceptFigures} onOpen={setLightbox} />
                  </section>
                </DesignBox>
              ) : null}

              {/* ===== foundations (borrowed core ideas) ===== */}
              {spec.foundations?.length && sec("foundations").on ? (
                <DesignBox id="sec-foundations" label="Background" mode={free ? "free" : "flow"} rect={layout.boxes["sec-foundations"]} onRect={setBox} register={registerBox}>
                  <section aria-label="Foundations from prior work">
                    <SectionHeader num={num()} tone="amber" icon={Landmark} title={sec("foundations").title} sub={sec("foundations").sub} />
                    <FoundationsLab foundations={spec.foundations} />
                  </section>
                </DesignBox>
              ) : null}

              {/* ===== method lab (only when an honest pipeline exists) ===== */}
              {hasPipeline && sec("method").on ? (
                <DesignBox id="sec-method" label="Method lab" mode={free ? "free" : "flow"} rect={layout.boxes["sec-method"]} onRect={setBox} register={registerBox}>
                  <section aria-label="The paper's contribution">
                    <SectionHeader num={num()} tone="blue" icon={GitBranch} title={sec("method").title} sub={sec("method").sub} />
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
                </DesignBox>
              ) : null}

              {/* ===== explorables lab — the hands-on layer for EVERY paper:
                   the paper's own equations on sliders, its own reported
                   numbers as interactive charts. Runs whether or not a full
                   pipeline exists (bonus explorers for pipeline papers). ===== */}
              {spec.explorables?.length && sec("explorables").on ? (
                <DesignBox id="sec-explorables" label="Explorables lab" mode={free ? "free" : "flow"} rect={layout.boxes["sec-explorables"]} onRect={setBox} register={registerBox}>
                  <section aria-label="Interactive explorers derived from the paper's own equations and data">
                    <SectionHeader num={num()} tone="amber" icon={FlaskConical} title={sec("explorables").title} sub={sec("explorables").sub} />
                    <ExplorablesLab explorables={spec.explorables} />
                  </section>
                </DesignBox>
              ) : null}

              {/* ===== results lab ===== */}
              {spec.resultFigures?.length && sec("results").on ? (
                <DesignBox id="sec-results" label="Results lab" mode={free ? "free" : "flow"} rect={layout.boxes["sec-results"]} onRect={setBox} register={registerBox}>
                  <section aria-label="The paper's result figures">
                    <SectionHeader num={num()} tone="emerald" icon={LineChartIcon} title={sec("results").title} sub={sec("results").sub} />
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
                </DesignBox>
              ) : null}
            </>
          );
        })()}
      </main>

      <InfoModal block={infoBlock} onClose={() => setInfoKey(null)} />
      <ReferencesDrawer references={spec.references} open={refsOpen} onClose={() => setRefsOpen(false)} />
      <Inspector inspect={inspect} rows={rows} onClose={() => setInspect(null)} />
      <Lightbox fig={lightbox} onClose={() => setLightbox(null)} />
      <LayoutEditor open={editorOpen} layout={layout} onChange={setLayout} onClose={() => setEditorOpen(false)} />
    </div>
  );
}
