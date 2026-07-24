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
  Sparkles, BookMarked, Play, Pause, Puzzle, Rocket, Network, ChevronLeft, FileCode2, Crosshair,
  Shuffle, Wand2, Trophy, Bot, ListChecks, GraduationCap, Images, Link2,
  ShieldCheck, Layers, RotateCw, Check as CheckIcon, GripVertical,
} from "lucide-react";
import SectionChat from "./SectionChat.jsx";
import ExplainerVideo from "./ExplainerVideo.jsx";
import { buildExplainer } from "./narrate.js";
import LayoutEditor from "./LayoutEditor.jsx";
import DigitizerEditor from "./DigitizerEditor.jsx";
import { DigitizedPanel, isSpecialDigitized, PALETTE } from "./DigitizedPanels.jsx";
import DesignBox from "./DesignBox.jsx";
import { loadLayout, saveLayout, layoutStyle, sectionByKey } from "./layout.js";
import {
  buildHelpers, defaultsFromSpec, compileSpec, runSpec, buildRows,
  compileResultFigures, runResultPanel, buildPanelRows, makeFigureHelpers,
  digitizedRealRun, resampleRunToGrid,
} from "./engine.js";
import {
  extractFitTargets, fitParamDefs, makeLossFn, matchPct,
  patternSearchFit, scrambleParams,
} from "./refit.js";

/* categorical hues for multi-series result reproductions (validated set) */
const SERIES_HUES = PALETTE; // shared 10-hue validated categorical palette

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
const BOX_IDS = ["conclusion", "sec-story", "sec-concept", "sec-foundations", "sec-model", "sec-method", "sec-results", "sec-reverse"];

const fmt = (v, d = 3) =>
  v === undefined || v === null || Number.isNaN(v) ? "–" : (+v).toFixed(d);

/* Recharts axis-title props — every chart carries its axis labels ON the plot
 * (author feedback: header-only labels read as "unlabeled axes"). */
const xAxisTitle = (label) => (label ? {
  value: label, position: "insideBottom", offset: -6,
  fill: "#64748b", fontSize: 10.5, fontWeight: 600,
} : undefined);
const yAxisTitle = (label) => (label ? {
  value: label, angle: -90, position: "insideLeft", offset: 12,
  fill: "#64748b", fontSize: 10.5, fontWeight: 600,
  style: { textAnchor: "middle" },
} : undefined);

/** Plain-language note for log-scale axes — "−12" means 10⁻¹², not a negative
 *  quantity. Shown under any chart whose axis labels mention a log scale. */
function LogScaleNote({ labels }) {
  const joined = (labels || []).filter(Boolean).join(" ");
  if (!/log/i.test(joined)) return null;
  return (
    <p className="mt-1 flex items-start gap-1.5 px-1 text-[10.5px] leading-snug text-slate-400">
      <Info size={11} className="mt-0.5 shrink-0" />
      <span>
        Log₁₀ scale: each step of 1 is a factor of 10. A reading of −12 means 10⁻¹²
        in the axis unit (a millionth of a millionth) — negative numbers mean
        “very small”, not “below zero”.
      </span>
    </p>
  );
}

/** Axis tick formatter with decimals adapted to magnitude, so a ±0.05 error
 *  axis doesn't collapse every tick to "0.0". */
const fmtTick = (v) => {
  if (v === undefined || v === null || Number.isNaN(v)) return "";
  const a = Math.abs(+v);
  if (a === 0) return "0";
  if (a >= 10) return (+v).toFixed(0);
  if (a >= 1) return (+v).toFixed(1);
  if (a >= 0.1) return (+v).toFixed(2);
  if (a >= 0.001) return (+v).toFixed(3);
  return (+v).toExponential(1);
};

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

/** When `onToggle` is given, each entry becomes a click target that hides/
 *  shows its series — the cheapest way to make ANY multi-series chart feel
 *  hands-on, including ones with zero sliders (reported-data explorers). */
function LegendRow({ items, hidden, onToggle }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-1">
      {items.map((it) => {
        const isHidden = hidden?.has(it.key);
        const dot = (
          <svg width="18" height="6" aria-hidden="true">
            <line x1="0" y1="3" x2="18" y2="3" stroke={isHidden ? "#cbd5e1" : it.color} strokeWidth="2"
              strokeDasharray={it.dash || "none"} />
          </svg>
        );
        if (!onToggle) {
          return (
            <span key={it.label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              {dot}{it.label}
            </span>
          );
        }
        return (
          <button
            key={it.label} type="button" onClick={() => onToggle(it.key)}
            title={isHidden ? `Show ${it.label}` : `Hide ${it.label}`}
            className={`flex items-center gap-1.5 rounded px-1 text-[11px] transition ${
              isHidden ? "text-slate-300 line-through" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {dot}{it.label}
          </button>
        );
      })}
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
  fuchsia: { badge: "bg-fuchsia-600", ring: "ring-fuchsia-200/60", text: "text-fuchsia-700" },
};

function SectionHeader({ num, tone, icon: IconCmp, title, sub, onAsk }) {
  const t = SECTION_TONES[tone];
  return (
    <div className="pp-rise mb-4 flex items-start gap-3" style={{ marginTop: "var(--sec-gap, 40px)" }}>
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl ${t.badge} font-bold text-white shadow-md ring-4 ${t.ring}`}
        style={{ width: "var(--sec-badge, 36px)", height: "var(--sec-badge, 36px)", fontSize: "calc(var(--sec-badge, 36px) * 0.4)" }}
      >
        {num}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 font-bold text-slate-900" style={{ fontSize: "calc(var(--sec-head, 16px) * var(--box-font-scale, 1))" }}>
          <IconCmp size={16} className={t.text} /> {title}
        </h2>
        <p className="mt-0.5 leading-relaxed text-slate-500" style={{ fontSize: "calc(var(--sec-sub, 12px) * var(--box-font-scale, 1))" }}>{sub}</p>
      </div>
      {onAsk && (
        <button
          onClick={onAsk}
          title="Ask questions, get Socratically tutored, quiz yourself, or talk by voice — all about this section"
          className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-100"
        >
          <GraduationCap size={13} /> Tutor &amp; quiz
        </button>
      )}
    </div>
  );
}

/** Sticky jump-to bar: a guide panel so reaching any section is one click,
 *  not an endless scroll — and skipping a "nice but not urgent" section
 *  (like the mind map) costs nothing. Highlights the section currently in
 *  view via IntersectionObserver. */
function SectionNav({ sections, conclusionLabel }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const barRef = useRef(null);

  // Scroll-spy via IntersectionObserver-as-trigger + full recompute (see
  // DraggableGuide) — avoids stale-entry bugs and permanent rAF polling.
  useEffect(() => {
    const compute = () => {
      let current = sections[0]?.id;
      for (const s of sections) {
        const el = document.querySelector(`[data-box="${s.boxId}"]`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 90) current = s.id;
        else break;
      }
      setActiveId(current);
    };
    compute();
    const els = sections.map((s) => document.querySelector(`[data-box="${s.boxId}"]`)).filter(Boolean);
    const io = new IntersectionObserver(compute, { threshold: [0, 0.5, 1], rootMargin: "-60px 0px 0px 0px" });
    els.forEach((e) => io.observe(e));
    window.addEventListener("resize", compute);
    return () => { io.disconnect(); window.removeEventListener("resize", compute); };
  }, [sections]);

  const jump = (boxId) => {
    document.querySelector(`[data-box="${boxId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (sections.length < 2) return null;
  return (
    <div ref={barRef} className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex gap-1 overflow-x-auto px-4 py-2 sm:px-6" style={{ maxWidth: "var(--content-max, 1280px)" }}>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="mr-1 shrink-0 rounded-full border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700"
          title={conclusionLabel}
        >
          ↑ top
        </button>
        {sections.map((s, i) => {
          const t = SECTION_TONES[s.tone];
          const selected = activeId === s.id;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => jump(s.boxId)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition ${
                selected ? `${t.badge} border-transparent text-white shadow-sm` : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${selected ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>
                {i + 1}
              </span>
              <Icon size={12} className={selected ? "text-white" : t.text} />
              {s.navLabel}
            </button>
          );
        })}
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

  // No autoplay: readers step through the story themselves (author feedback —
  // the auto-advance was too fast and took the pacing away from the reader).
  // ▶ still exists for anyone who wants the slideshow.
  const DUR = 9000;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
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
  // Manual navigation pauses the slideshow — clicking "next" means the reader
  // wants to drive, not to restart the timer.
  const jump = (i) => { setIdx(i); setPlaying(false); setCycle((c) => c + 1); };

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${hue.bg} shadow-lg`}>
      <style>{`
        @keyframes beatIn { from { opacity: 0; transform: translateY(14px) scale(0.985); } to { opacity: 1; transform: none; } }
        @keyframes beatIcon { 0% { opacity: 0; transform: scale(0.4) rotate(-8deg); } 60% { transform: scale(1.12); } 100% { opacity: 1; transform: none; } }
        @keyframes beatBar { from { width: 0%; } to { width: 100%; } }
        @keyframes bgIconIn { from { opacity: 0; transform: scale(0.8) rotate(-6deg); } to { opacity: 0.08; transform: none; } }
      `}</style>

      {/* the story spine — a mini journey map (node per beat, connected by a
          fill-as-you-go line) instead of flat progress bars. Same visual
          language as the mind map below it, so the story reads as a diagram
          building itself, not a stack of text cards. */}
      <div className="relative z-10 flex items-center px-4 pt-4 sm:px-8">
        {beats.map((b, i) => {
          const BIcon = b.Icon;
          const reached = i <= idx;
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-white/15">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-white/80"
                    style={{
                      width: i - 1 < idx ? "100%" : "0%",
                      animation: i - 1 === idx && playing ? `beatBar ${DUR}ms linear forwards` : undefined,
                    }}
                    key={`${i}-${cycle}`}
                  />
                </div>
              )}
              <button
                onClick={() => jump(i)}
                aria-label={`Jump to: ${b.kicker}`}
                title={b.kicker}
                className={`relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  i === idx ? "h-8 w-8 shadow-lg" : "h-6 w-6"
                }`}
                style={{
                  borderColor: BEAT_HUES[b.kind].bar,
                  background: reached ? BEAT_HUES[b.kind].bar : "transparent",
                }}
              >
                <BIcon size={i === idx ? 14 : 11} className={reached ? "text-white" : "text-white/40"} />
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* the beat itself — re-keyed so the entrance animation replays */}
      <div key={`${idx}-${cycle}`} className="relative flex min-h-[240px] flex-col items-center justify-center overflow-hidden px-6 py-10 text-center sm:px-16">
        {/* oversized watermark icon — cheap depth cue so each beat reads as
            a scene, not a paragraph */}
        <BeatIcon
          size={220}
          className="pointer-events-none absolute -right-8 top-1/2 -translate-y-1/2 text-white sm:right-2"
          style={{ animation: "bgIconIn 900ms ease-out both" }}
          aria-hidden="true"
        />
        <div className="relative" style={{ animation: "beatIn 600ms cubic-bezier(0.22,1,0.36,1) both" }}>
          <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${hue.chip}`}
            style={{ animation: "beatIcon 700ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
            <BeatIcon size={22} />
          </div>
          <div className={`mx-auto mb-2 w-fit rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${hue.chip}`}>
            {beat.kicker}
          </div>
          {beat.headline && (
            <h3 className="mb-2 max-w-2xl text-xl font-extrabold leading-snug text-white sm:text-2xl">{beat.headline}</h3>
          )}
          <p className={`max-w-2xl leading-relaxed text-slate-200 ${beat.headline ? "text-[14px]" : "text-lg font-medium sm:text-xl"}`}>
            {beat.text}
          </p>
        </div>
      </div>

      {/* controls */}
      <div className="relative z-10 flex items-center justify-center gap-2 pb-3">
        <button onClick={() => jump(Math.max(0, idx - 1))} aria-label="Previous"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/25"><ChevronLeft size={15} /></button>
        <button
          onClick={() => {
            if (!playing && idx === beats.length - 1) { setIdx(0); setPlaying(true); setCycle((c) => c + 1); }
            else { setPlaying(!playing); setCycle((c) => c + 1); }
          }}
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

/* Fixed reading order left-to-right: problem/prior work feed the paper,
 * the paper introduces its method, method delivers contributions and
 * results. Laying nodes out in columns (a Sankey-style flow) instead of a
 * wheel means edges mostly run short and rightward instead of criss-crossing
 * the whole canvas — that's what was making the old radial map look like a
 * plate of spaghetti. */
const MM_COL = { problem: 0, prior: 0, paper: 1, method: 2, contribution: 3, result: 4 };
const MM_COL_TITLE = ["Starting point", "The paper", "Method", "Contributions", "Results"];

function MindMap({ mindmap }) {
  const [activeId, setActiveId] = useState(null);
  const nodes = mindmap?.nodes || [];
  const edges = mindmap?.edges || [];
  if (nodes.length < 2) return null;

  const NW = 160, NH = 56, COL_GAP = 84, ROW_GAP = 22, PAD = 20, TITLE_H = 22;

  const { pos, colX, colCount, H } = useMemo(() => {
    const cols = [[], [], [], [], []];
    nodes.forEach((n) => cols[MM_COL[n.kind] ?? 2].push(n));

    // one barycenter pass, left→right then right→left, to untangle crossings
    const orderOf = {};
    cols.forEach((list) => list.forEach((n, i) => { orderOf[n.id] = i; }));
    const neighborOrders = (id, dir) =>
      edges
        .filter((e) => (dir === "in" ? e.to === id : e.from === id))
        .map((e) => orderOf[dir === "in" ? e.from : e.to])
        .filter((v) => v != null);
    const sweep = (range) => {
      for (const ci of range) {
        const dir = ci === 0 ? "out" : "in";
        cols[ci] = cols[ci]
          .map((n) => {
            const ns = neighborOrders(n.id, dir);
            const avg = ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : orderOf[n.id] ?? 0;
            return { n, avg };
          })
          .sort((a, b) => a.avg - b.avg)
          .map((x, i) => { orderOf[x.n.id] = i; return x.n; });
      }
    };
    sweep([1, 2, 3, 4]);
    sweep([3, 2, 1, 0]);

    const activeCols = cols.map((c, i) => ({ i, c })).filter((x) => x.c.length);
    const maxRows = Math.max(...cols.map((c) => c.length), 1);
    const innerH = maxRows * NH + (maxRows - 1) * ROW_GAP;
    const H = TITLE_H + PAD * 2 + innerH;

    const pos = {}, colX = {};
    activeCols.forEach(({ i, c }, ci) => {
      const x = PAD + ci * (NW + COL_GAP) + NW / 2;
      colX[i] = x;
      const totalH = c.length * NH + (c.length - 1) * ROW_GAP;
      const startY = TITLE_H + PAD + (innerH - totalH) / 2;
      c.forEach((n, ri) => { pos[n.id] = { x, y: startY + ri * (NH + ROW_GAP) + NH / 2 }; });
    });
    return { pos, colX, colCount: activeCols.length, H };
  }, [nodes, edges]);

  const W = PAD * 2 + colCount * NW + (colCount - 1) * COL_GAP;

  const active = nodes.find((n) => n.id === activeId) || null;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <Network size={13} className="text-rose-600" /> The whole paper, one map — read left to right, click any node
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
          .mm-edge { stroke-dasharray: 500; stroke-dashoffset: 500; animation: edgeDraw 900ms ease-out forwards; }
        `}</style>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Concept map of the paper" style={{ minWidth: Math.max(640, colCount * 190) }}>
          <defs>
            <marker id="mm-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#b9c2cf" />
            </marker>
          </defs>

          {/* column headers — the reading order made explicit */}
          {Object.entries(colX).map(([ci, x]) => (
            <text key={ci} x={x} y={TITLE_H - 6} textAnchor="middle" fontSize="9.5" fontWeight="700"
              fill="#94a3b8" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {MM_COL_TITLE[ci]}
            </text>
          ))}

          {edges.map((e, i) => {
            const a = pos[e.from], b = pos[e.to];
            if (!a || !b) return null;
            const dx = Math.max(28, (b.x - a.x) / 2);
            const path = `M ${a.x + NW / 2} ${a.y} C ${a.x + NW / 2 + dx} ${a.y}, ${b.x - NW / 2 - dx} ${b.y}, ${b.x - NW / 2 - 6} ${b.y}`;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            return (
              <g key={i}>
                <path d={path} fill="none" stroke="#cbd5e1" strokeWidth="1.5"
                  markerEnd="url(#mm-arr)" className="mm-edge" style={{ animationDelay: `${150 + i * 70}ms` }} />
                {e.label ? (
                  <>
                    <rect x={mx - 28} y={my - 9} width="56" height="16" rx="8" fill="white" opacity="0.92" />
                    <text x={mx} y={my + 3} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="600">
                      {e.label.slice(0, 13)}
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
            const isCenter = n.kind === "paper";
            const w = isCenter ? NW + 16 : NW, h = isCenter ? NH + 6 : NH;
            const selected = activeId === n.id;
            return (
              <g key={n.id} className="mm-node" style={{ animationDelay: `${i * 70}ms` }}
                onClick={() => setActiveId(selected ? null : n.id)} role="button" aria-label={n.label}>
                <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={12}
                  fill={k.fill} stroke={k.stroke} strokeWidth={selected ? 3 : 1.8} />
                {selected && (
                  <rect x={p.x - w / 2 - 3} y={p.y - h / 2 - 3} width={w + 6} height={h + 6} rx={14}
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
            {/* the paper's real figure, or an inline (e.g. animated) SVG the
                spec provides — never a fabricated stand-in */}
            {fig.image ? (
              <div className="mb-3 flex items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
                <img src={fig.image} alt={fig.title}
                  className="max-h-64 w-auto max-w-full object-contain" loading="lazy" />
              </div>
            ) : fig.svg ? (
              <div className="mb-3 flex items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white p-2"
                dangerouslySetInnerHTML={{ __html: fig.svg }} />
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
              tickFormatter={fmtTick}
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

/** Pretty names for the classified figure families (REQ1 honest-degrade). */
const FAMILY_LABEL = {
  kaplanMeier: "Kaplan–Meier survival curve", forest: "forest plot", pie: "pie / donut chart",
  stackedArea: "stacked-area chart", volcano: "volcano plot", manhattan: "Manhattan plot",
  roc: "ROC curve", ecdf: "ECDF plot", qq: "Q–Q plot", contour: "contour / field map",
  quiver: "vector-field plot", sankey: "Sankey diagram", choropleth: "thematic map",
  network: "network diagram", tree: "phylogenetic tree", dendrogram: "dendrogram",
  sem: "path / SEM diagram", ternary: "ternary plot", slope: "slope chart",
  waterfall: "waterfall chart", blandAltman: "Bland–Altman plot", funnel: "funnel plot",
  bode: "Bode plot", polar: "polar plot", surface3d: "3-D surface plot",
  image: "micrograph / image", schematic: "schematic diagram", other: "specialist figure",
};

/** Honest-degrade panel (REQ1): the analyzer classified this subplot as a
 *  figure family it can't reproduce faithfully (or was unsure), so instead of
 *  a possibly-wrong chart the reader gets a clear note pointing to the real
 *  cropped figure beside it. A faithful original beats a fabricated chart. */
function OriginalOnlyPanel({ panel }) {
  const fam = FAMILY_LABEL[panel.figureFamily] || "figure";
  return (
    <div className="flex h-full min-h-[150px] flex-col justify-center rounded-lg border border-dashed border-amber-300/70 bg-amber-50/50 p-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
        {panel.subplotLabel}
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
          shown as original
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-slate-600">
        {panel.degradeReason ||
          `This is a ${fam} — shown as the paper's own figure on the left, not a reproduction.`}
      </p>
      <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
        Read it directly from the real figure above/left, with the guided-tour markers. We only
        build an interactive version when we can reproduce it faithfully — never a look-alike.
      </p>
    </div>
  );
}

/** Predict-then-reveal (retrieval practice): when a panel carries a `predict`
 *  quiz, the chart is blurred behind a one-question overlay. The reader must
 *  commit to an answer BEFORE the real result reveals — then sees why. Guessing
 *  first, then seeing, is the strongest way to make a figure stick, and it uses
 *  the paper's own data as the answer key. No predict object ⇒ renders straight
 *  through, so it never affects panels (or bundled samples) without one. */
function PredictGate({ predict, children }) {
  const [chosen, setChosen] = useState(null);
  if (!predict?.prompt || !Array.isArray(predict.options) || predict.options.length < 2) return children;
  const answered = chosen !== null;
  const correct = answered && chosen === predict.answerIdx;
  return (
    <div>
      <div className="relative">
        <div className={answered ? "" : "pointer-events-none select-none blur-[6px] opacity-60"} aria-hidden={!answered}>
          {children}
        </div>
        {!answered && (
          <div className="absolute inset-0 flex flex-col justify-center gap-2 rounded-lg border border-indigo-200 bg-white/95 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Predict first</div>
            <p className="text-[12px] font-semibold leading-snug text-slate-800">{predict.prompt}</p>
            <div className="flex flex-col gap-1.5">
              {predict.options.map((o, i) => (
                <button key={i} onClick={() => setChosen(i)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[11.5px] text-slate-700 hover:border-indigo-400 hover:text-indigo-700">
                  {String.fromCharCode(65 + i)}. {o}
                </button>
              ))}
            </div>
            <p className="text-[9.5px] text-slate-400">Commit to an answer — then the real result reveals.</p>
          </div>
        )}
      </div>
      {answered && (
        <div className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${correct ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          <strong>{correct ? "You predicted right. " : "Good guess — not quite. "}</strong>
          {predict.insight}
          {!correct && <span className="text-slate-500"> (answer: {String.fromCharCode(65 + predict.answerIdx)})</span>}
        </div>
      )}
    </div>
  );
}

/** One subplot. Hover values are NOT drawn on the plot (a floating box hides
 *  the curves) — they're forwarded to a dedicated readout box via onHover. */
function PanelChart({ panel, baseRun, actRun, height = 170, onHover, activeSuffix = "", baselineSuffix = "paper's value" }) {
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
  const hasBase = !!(baseRun && !baseRun.error && baseRun.series?.length);
  const nSeries = (actRun?.series || baseRun?.series || []).length;

  // One legend entry PER SERIES (not one for "yours" + a separate grey one
  // for "paper's baseline") and the baseline keeps that series' OWN color,
  // just dashed — with 2+ series, a flat grey for every baseline made it
  // impossible to tell which dashed line paired with which solid one. A panel
  // with no baseline (a digitized-only real curve, no model to chase it) shows
  // just the solid series.
  const legend = [];
  for (let k = 0; k < nSeries; k++) {
    const s = (actRun?.series || baseRun?.series)[k];
    const name = s?.label || `series ${k + 1}`;
    // digitized series may carry the ORIGINAL figure's color — keep it
    const color = s?.color || SERIES_HUES[k % SERIES_HUES.length];
    legend.push({ key: `a${k}`, pairKey: `s${k}`, label: activeSuffix ? `${name} · ${activeSuffix}` : name, color });
    if (hasBase) legend.push({ key: `b${k}`, pairKey: `s${k}`, label: `${name} · ${baselineSuffix}`, color, dash: "5 4" });
  }

  const [hidden, setHidden] = useState(() => new Set());
  useEffect(() => { setHidden(new Set()); }, [panel]);
  const toggleSeries = useCallback((key) => {
    const pairKey = legend.find((l) => l.key === key)?.pairKey || key;
    setHidden((h) => {
      const n = new Set(h);
      const bothHidden = legend.filter((l) => l.pairKey === pairKey).every((l) => n.has(l.key));
      legend.filter((l) => l.pairKey === pairKey).forEach((l) => (bothHidden ? n.delete(l.key) : n.add(l.key)));
      return n;
    });
  }, [legend]);

  const [readout, setReadout] = useState(null);
  const [pinned, setPinned] = useState(null);
  useEffect(() => { setPinned(null); }, [panel]);

  const readAt = useCallback((state) => (!state?.activePayload?.length ? null : {
    x: state.activeLabel,
    rows: legend.filter((l) => !hidden.has(l.key)).map((l) => {
      const p = state.activePayload.find((ap) => ap.dataKey === l.key);
      return p ? { ...l, value: p.value } : null;
    }).filter(Boolean),
  }), [legend, hidden]);

  const handleMove = useCallback((state) => {
    if (!pinned) setReadout(readAt(state));
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
  }, [onHover, panel, legend, pinned, readAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleClick = useCallback((state) => {
    const r = readAt(state);
    if (!r) return;
    setPinned((prev) => (prev && prev.x === r.x ? null : r));
  }, [readAt]);

  const shown = pinned || readout;

  return (
    <div className="rounded-lg border border-slate-100 bg-white p-2">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          {panel.subplotLabel}
          {panel.digitized ? (
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700"
              title={panel.digitized.source || "traced off the real figure"}>
              traced from figure
            </span>
          ) : panel.dataSource === "reported" ? (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
              paper's numbers
            </span>
          ) : null}
        </span>
        <span className="text-[10px] text-slate-400">{panel.xLabel} → {panel.yLabel}</span>
      </div>
      {err ? (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-2 text-[11px] text-red-700">{err}</div>
      ) : kind === "bar" ? (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={rows} margin={{ top: 6, right: 10, bottom: 14, left: 2 }}
            onMouseMove={handleMove} onClick={handleClick} style={{ cursor: "pointer" }}>
            <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey={categories ? "_c" : "_i"} type="category"
              tick={{ fill: C.inkMuted, fontSize: 9 }} stroke={C.axis} tickLine={false}
              interval={0} angle={rows.length > 6 ? -30 : 0} height={rows.length > 6 ? 42 : 30}
              label={xAxisTitle(panel.xLabel)}
            />
            <YAxis
              tick={{ fill: C.inkMuted, fontSize: 9 }} stroke="transparent"
              tickLine={false} width={50} tickFormatter={fmtTick}
              label={yAxisTitle(panel.yLabel)}
            />
            <Tooltip content={() => null} cursor={{ fill: "rgba(100,116,139,0.08)" }}
              isAnimationActive={false} />
            {legend.filter((l) => !hidden.has(l.key)).map((l) => (
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
          <LineChart data={rows} margin={{ top: 6, right: 10, bottom: 14, left: 2 }}
            onMouseMove={handleMove} onClick={handleClick} style={{ cursor: "pointer" }}>
            <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="_i" type="number" domain={["dataMin", "dataMax"]}
              tick={{ fill: C.inkMuted, fontSize: 9 }} stroke={C.axis} tickLine={false}
              tickFormatter={fmtTick}
              label={xAxisTitle(panel.xLabel)}
            />
            <YAxis
              tick={{ fill: C.inkMuted, fontSize: 9 }} stroke="transparent"
              tickLine={false} width={50} tickFormatter={fmtTick}
              label={yAxisTitle(panel.yLabel)}
            />
            {pinned != null && (
              <ReferenceLine x={pinned.x} stroke={C.ink} strokeWidth={1.5} strokeDasharray="5 3" />
            )}
            {/* cursor line only — values go to the readout row right below, never over the curves */}
            <Tooltip
              content={() => null}
              cursor={{ stroke: C.inkMuted, strokeWidth: 1, strokeDasharray: "3 3" }}
              isAnimationActive={false}
            />
            {legend.filter((l) => !hidden.has(l.key)).map((l) => (
              <Line key={l.key} dataKey={l.key} stroke={l.color}
                strokeWidth={kind === "scatter" ? 0 : 1.8}
                dot={kind === "scatter" ? { r: 2.2, fill: l.color, strokeWidth: 0 } : false}
                strokeDasharray={l.dash || undefined} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <LegendRow items={legend} hidden={hidden} onToggle={toggleSeries} />
      {/* the readout lives RIGHT HERE, under the plot that produced it — not
          in a shared box elsewhere on the page, which is what made numbers
          hard to trace back to a plot */}
      <div className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md px-2 py-1 text-[11px] tabular-nums ${pinned ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-500"}`}>
        {shown ? (
          <>
            {pinned && <Pin size={10} className="shrink-0" />}
            <span>{panel.xLabel} = <strong>{fmt(shown.x, 2)}</strong></span>
            {shown.rows.map((r) => (
              <span key={r.key}>
                <span style={{ color: r.color }}>{r.label}:</span> <strong>{fmt(r.value)}</strong>
              </span>
            ))}
            {pinned && (
              <button onClick={() => setPinned(null)} className="ml-auto rounded-full bg-white/20 px-1.5 hover:bg-white/30" title="Unpin">✕</button>
            )}
          </>
        ) : (
          <span className="text-slate-400">hover for exact values, click to lock them</span>
        )}
      </div>
      <LogScaleNote labels={[panel.xLabel, panel.yLabel]} />
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

  // Live insight: an optional second kernel that turns the CURRENT slider
  // state + computed result into one plain-language sentence — the "so what"
  // that makes a demo informative instead of an arbitrary slider toy.
  const insight = useMemo(() => {
    if (!demo?.insightJs || result.error) return null;
    try {
      // eslint-disable-next-line no-new-func
      const f = new Function("params", "result", "helpers", demo.insightJs);
      const s = f(params, result.value, helpers);
      return typeof s === "string" && s.trim() ? s : null;
    } catch { return null; }
  }, [demo, params, result, helpers]);

  return { helpers, params, setParam, result, insight };
}

/** Chart demo (line / bar / scatter) with its own dials and a readout. */
function DemoChart({ demo }) {
  const { helpers, params, setParam, result, insight } = useDemo(demo);
  const [readout, setReadout] = useState(null);
  const [pinned, setPinned] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const kind = demo.chartKind || "line";

  // ▶ sweep: animates one slider (the param flagged `animate`, else the first)
  // from min to max so the demo plays itself like a tiny movie.
  const sweepParam = demo.params?.find((p) => p.animate) || demo.params?.[0] || null;
  const [sweeping, setSweeping] = useState(false);
  useEffect(() => { setSweeping(false); }, [demo]);
  useEffect(() => {
    if (!sweeping || !sweepParam) return;
    const p = sweepParam;
    const steps = 80;
    let i = 0;
    setParam(p.key, p.min);
    const id = setInterval(() => {
      i += 1;
      const v = Math.min(p.max, p.min + (p.max - p.min) * (i / steps));
      setParam(p.key, +v.toFixed(6));
      if (i >= steps) { clearInterval(id); setSweeping(false); }
    }, 70);
    return () => clearInterval(id);
  }, [sweeping]); // eslint-disable-line react-hooks/exhaustive-deps

  // reset the click-to-pin / hide-series state whenever a different demo
  // is loaded (e.g. switching pages in Foundations/Explorables Lab)
  useEffect(() => { setPinned(null); setHidden(new Set()); }, [demo]);
  const toggleSeries = useCallback((key) => {
    setHidden((h) => { const n = new Set(h); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

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

  const readAt = useCallback((state) => (!state?.activePayload?.length ? null : {
    x: state.activeLabel,
    rows: legend
      .filter((l) => !hidden.has(l.key))
      .map((l) => {
        const p = state.activePayload.find((ap) => ap.dataKey === l.key);
        return p ? { ...l, value: p.value } : null;
      }).filter(Boolean),
  }), [legend, hidden]);

  const handleMove = useCallback((state) => { if (!pinned) setReadout(readAt(state)); }, [readAt, pinned]);
  const handleClick = useCallback((state) => {
    const r = readAt(state);
    if (!r) return;
    setPinned((prev) => (prev && prev.x === r.x ? null : r));
  }, [readAt]);

  const shown = pinned || readout;
  const noSliders = !demo.params?.length;

  return (
    <div>
      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{err}</div>
      ) : (
        <div className="rounded-lg border border-slate-100 bg-white p-2">
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <span className="flex items-center gap-2">
              {sweepParam && (
                <button
                  type="button"
                  onClick={() => setSweeping(!sweeping)}
                  className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                    sweeping ? "bg-rose-600 text-white hover:bg-rose-500" : "bg-slate-800 text-white hover:bg-slate-700"
                  }`}
                  title={sweeping ? "Stop the sweep" : `Animate ${sweepParam.label} from ${sweepParam.min} to ${sweepParam.max}`}
                >
                  {sweeping ? "◼ stop" : "▶ play"}
                  <span className="font-normal opacity-80" style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}>{sweepParam.sym}</span>
                </button>
              )}
              <span className="text-[10px] font-medium text-slate-400">
                {noSliders ? "click a point to lock in its exact value" : "drag the dials below, or click the plot to lock a reading"}
              </span>
            </span>
            <span className="text-[10px] text-slate-400">{demo.xLabel} → {demo.yLabel}</span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            {kind === "bar" || categories ? (
              <BarChart data={rows} margin={{ top: 6, right: 10, bottom: 16, left: 4 }}
                onMouseMove={handleMove} onClick={handleClick} style={{ cursor: "pointer" }}>
                <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
                <XAxis dataKey={categories ? "_c" : "_i"} type="category"
                  tick={{ fill: C.inkMuted, fontSize: 9 }} stroke={C.axis} tickLine={false}
                  interval={0} angle={rows.length > 6 ? -30 : 0} height={rows.length > 6 ? 44 : 30}
                  label={xAxisTitle(demo.xLabel)} />
                <YAxis tick={{ fill: C.inkMuted, fontSize: 9 }} stroke="transparent"
                  tickLine={false} width={52} tickFormatter={fmtTick}
                  label={yAxisTitle(demo.yLabel)} />
                <Tooltip content={() => null} cursor={{ fill: "rgba(100,116,139,0.08)" }}
                  isAnimationActive={false} />
                {legend.filter((l) => !hidden.has(l.key)).map((l) => (
                  <Bar key={l.key} dataKey={l.key} fill={l.color} isAnimationActive={false} />
                ))}
              </BarChart>
            ) : (
              <LineChart data={rows} margin={{ top: 6, right: 10, bottom: 16, left: 4 }}
                onMouseMove={handleMove} onClick={handleClick} style={{ cursor: "pointer" }}>
                <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
                <XAxis dataKey="_i" type="number" domain={["dataMin", "dataMax"]}
                  tick={{ fill: C.inkMuted, fontSize: 9 }} stroke={C.axis} tickLine={false}
                  tickFormatter={fmtTick}
                  label={xAxisTitle(demo.xLabel)} />
                <YAxis tick={{ fill: C.inkMuted, fontSize: 9 }} stroke="transparent"
                  tickLine={false} width={52} tickFormatter={fmtTick}
                  label={yAxisTitle(demo.yLabel)} />
                <Tooltip content={() => null}
                  cursor={{ stroke: C.inkMuted, strokeWidth: 1, strokeDasharray: "3 3" }}
                  isAnimationActive={false} />
                {pinned != null && (
                  <ReferenceLine x={pinned.x} stroke={C.ink} strokeWidth={1.5} strokeDasharray="5 3" />
                )}
                {legend.filter((l) => !hidden.has(l.key)).map((l) => (
                  <Line key={l.key} dataKey={l.key} stroke={l.color}
                    strokeWidth={kind === "scatter" ? 0 : 2}
                    dot={kind === "scatter" ? { r: 2.4, fill: l.color, strokeWidth: 0 } : false}
                    isAnimationActive={false} />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
            <LegendRow items={legend} hidden={hidden} onToggle={toggleSeries} />
            <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] tabular-nums ${pinned ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-600"}`}>
              {shown
                ? <>
                    {pinned && <Pin size={10} className="shrink-0" />}
                    x = <strong>{fmt(shown.x, 2)}</strong>{shown.rows.map((r) => (
                      <span key={r.key} className="ml-3"><span style={{ color: pinned ? r.color : r.color }}>{r.label}:</span> <strong>{fmt(r.value)}</strong></span>
                    ))}
                    {pinned && (
                      <button onClick={() => setPinned(null)} className="ml-2 rounded-full bg-white/20 px-1.5 hover:bg-white/30" title="Unpin">✕</button>
                    )}
                  </>
                : <span className="text-slate-400">hover for values</span>}
            </div>
          </div>
          <LogScaleNote labels={[demo.xLabel, demo.yLabel]} />
        </div>
      )}
      {insight && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2">
          <Lightbulb size={13} className="mt-0.5 shrink-0 text-emerald-600" />
          <p className="text-[12px] font-medium leading-relaxed text-emerald-900 tabular-nums">{insight}</p>
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

/* ---- grounding helpers: make sections 4 & 5 visibly BE the paper ----
 * The single reason authors rejected these sections was "I can't tell what
 * this shows / it looks invented". The fix is to always show, next to any live
 * plot, the paper's OWN figure it derives from, plus an explicit provenance
 * chip naming the figure/equation/section. */

/** "From FIG. 2 · Eq. 3" — the traceability stamp, glowing so it reads as the
 * anchor to the real paper, not decoration. */
function ProvenanceChip({ provenance, className = "" }) {
  const p = provenance;
  if (!p) return null;
  const parts = [p.figure, p.equation, p.section].filter(Boolean);
  if (!parts.length) return null;
  return (
    <span className={`pp-provenance inline-flex items-center gap-1 rounded-full border border-indigo-300/70 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 ${className}`}
      title="Where this comes from in the paper">
      <Link2 size={10} /> From {parts.join(" · ")}
    </span>
  );
}

/** The paper's real cropped figure, with a caption. Clicking opens the lightbox. */
function PaperFigure({ figure, onOpen, className = "" }) {
  if (!figure?.image) return null;
  return (
    <figure className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-2 py-1">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          <Images size={11} /> {figure.label || "The paper's own figure"}
        </span>
        {onOpen && (
          <button onClick={() => onOpen({ image: figure.image, title: figure.caption || figure.label })}
            className="text-slate-400 hover:text-indigo-600" title="Enlarge">
            <Maximize2 size={12} />
          </button>
        )}
      </div>
      <img src={figure.image} alt={figure.caption || figure.label || "paper figure"}
        className="block max-h-[280px] w-full cursor-zoom-in object-contain"
        onClick={() => onOpen?.({ image: figure.image, title: figure.caption || figure.label })} loading="lazy" />
      {figure.caption && (
        <figcaption className="border-t border-slate-100 px-2 py-1 text-[10.5px] leading-snug text-slate-500">
          {figure.caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Symbol glossary + key takeaways: the "learn" layer that turns a wall of
 * sliders into a lesson. Terms come from the section's own content. */
function LearnStrip({ terms, takeaways, material }) {
  const hasTerms = terms?.length, hasTake = takeaways?.length, hasMat = material?.length;
  if (!hasTerms && !hasTake && !hasMat) return null;
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      {hasTake ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            <ListChecks size={12} /> Key takeaways
          </div>
          <ul className="space-y-1">
            {takeaways.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] leading-snug text-emerald-900">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />{t}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hasTerms ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <GraduationCap size={12} /> Symbol glossary
          </div>
          <dl className="space-y-1">
            {terms.map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-[12px] leading-snug">
                <dt className="shrink-0 font-bold text-slate-800" style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}>{t.sym}</dt>
                <dd className="text-slate-600">{t.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {hasMat ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3 md:col-span-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <BookOpen size={12} /> Useful material
          </div>
          <ul className="flex flex-wrap gap-2">
            {material.map((m, i) => (
              <li key={i}>
                <a href={m.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
                  <Link2 size={11} /> {m.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Wraps sections 4 & 5 in the premium "lab" identity (animated gradient frame
 * + glass surface). Scoped to these two sections only. */
function LabShell({ children }) {
  return <div className="pp-lab"><div className="pp-lab__inner p-3 sm:p-4">{children}</div></div>;
}

/** Rich dark opening slide for the Background explainer — the concepts this
 * paper builds on, previewed as cards (with their real figure thumbnails where
 * available), so the first slide teaches instead of sitting blank. */
function FoundationsStageIntro({ foundations = [], accent = "#d97706" }) {
  return (
    <div className="relative flex h-full w-full flex-col justify-center gap-4 overflow-hidden rounded-lg p-6"
      style={{ background: "radial-gradient(120% 90% at 50% 0%, #2a2113, #0b1220)" }}>
      <div className="flex items-center gap-2">
        <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: `${accent}22`, border: `1px solid ${accent}66` }}>
          <Landmark size={22} style={{ color: "#fbbf24" }} />
        </span>
        <div>
          <div className="text-xl font-bold text-white sm:text-2xl">The background this paper builds on</div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            {foundations.length} idea{foundations.length === 1 ? "" : "s"} from prior work — not this paper's results
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {foundations.slice(0, 4).map((c, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-white/12 bg-white/8 p-2.5">
            {c.figure?.image ? (
              <img src={c.figure.image} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover ring-1 ring-white/15" />
            ) : (
              <span className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-white/10 text-[10px] font-bold text-amber-200">{i + 1}</span>
            )}
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold text-white">{c.title}</div>
              <div className="truncate text-[10.5px] text-slate-300">{(c.source || "").split(",")[0]}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FoundationsLab({ foundations, explainer, onOpenFig }) {
  const [pageIdx, setPageIdx] = useState(0);
  const f = foundations[Math.min(pageIdx, foundations.length - 1)];
  if (!f) return null;

  // The Background section teaches PRIOR-WORK concepts you need before the paper
  // — NOT the paper's own results. So the explainer stage shows the interactive
  // concept demos (filling the frame), never the paper's result figures; those
  // live, digitized and interactive, in the Results lab.
  const renderVisual = (visual) => {
    const d = foundations[visual?.foundationIdx]?.demo;
    if ((visual?.type === "demo" || visual?.type === "figure") && d) {
      return <StageDemo demo={d} />;
    }
    const fi = foundations[visual?.foundationIdx];
    if (fi) return <IntroCard title={fi.title} sub={fi.source} icon={Landmark} accent="#d97706" />;
    return <FoundationsStageIntro foundations={foundations} />;
  };

  return (
    <LabShell>
      {explainer?.scenes?.length ? (
        <div className="mb-4">
          <ExplainerVideo explainer={explainer} renderVisual={renderVisual} accent="#d97706" />
        </div>
      ) : null}
      <LabWindow
        title="Foundations Lab — learn the background by playing"
        accent="bg-amber-500"
        pages={foundations.map((x, i) => ({ id: String(i), label: x.title, sub: (x.source || "").split(",")[0] }))}
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
            {f.svg && (
              <div className="mt-3 rounded-lg border border-slate-100 bg-white p-2"
                dangerouslySetInnerHTML={{ __html: f.svg }} />
            )}
          </div>
          <div className="min-w-0 xl:col-span-3">
            {f.demo ? (
              <>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Try it — {f.demo.caption}
                  </span>
                  <ProvenanceChip provenance={f.demo.provenance || f.provenance} />
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
        <LearnStrip terms={f.glossary} takeaways={f.takeaways} material={f.material} />
      </LabWindow>
    </LabShell>
  );
}

/** Title card for the explainer's opening/closing scenes — fills the whole
 * frame with a large animated motif and the scene title, so there is no dead
 * black space and no tiny floating thumbnails. Deliberately carries NO result
 * figures: the Background/Model title scenes are framing, and the paper's own
 * result figures live (digitized, interactive) in the Results lab instead. */
function IntroCard({ title, sub, icon: Icon = GraduationCap, accent = "#6366f1" }) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-lg p-6 text-center"
      style={{ background: "radial-gradient(120% 90% at 50% 0%, #1e293b, #0b1220)" }}>
      {/* large animated aura filling the frame */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        {[0, 1.1, 2.2].map((d, i) => (
          <span key={i} className="pp-ring absolute rounded-full"
            style={{ height: "60vh", width: "60vh", maxHeight: "80%", maxWidth: "80%", border: `2px solid ${accent}`, animationDelay: `${d}s` }} />
        ))}
      </div>
      <div className="pp-float relative grid h-16 w-16 place-items-center rounded-3xl"
        style={{ background: `${accent}22`, border: `1px solid ${accent}66` }}>
        <Icon size={32} style={{ color: accent }} />
      </div>
      <div className="relative">
        <div className="text-2xl font-bold text-white sm:text-3xl">{title}</div>
        {sub && <div className="mt-1.5 text-sm text-slate-300">{sub}</div>}
      </div>
    </div>
  );
}

/** A live demo (foundation concept toy or reproduced chart) shown big on the
 * explainer stage — centered and using the full width, so no wasted black. */
function StageDemo({ demo }) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto rounded-lg bg-white p-3">
      <div className="w-full max-w-3xl">
        {demo.kind === "frames" ? <DemoFrames demo={demo} /> : <DemoChart demo={demo} />}
      </div>
    </div>
  );
}

/** A governing equation shown big on the explainer stage. */
function StageEquation({ eq, accent = "#2563eb" }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-3">
      <div className="w-full max-w-3xl">
        <div className="pp-eq rounded-2xl px-6 py-8 text-center">
          <div className="text-lg sm:text-xl"><Eq>{eq.eq}</Eq></div>
        </div>
        {eq.plain && <p className="mt-3 text-center text-[13px] leading-relaxed text-slate-200">{eq.plain}</p>}
      </div>
    </div>
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

function ResultsLab({ spec, pipelineCompiled, helpers, baseOutputs, actOutputs, defaults, params, setParam, onOpenFig, layout, isOwner = false, onTrace }) {
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

      // Digitized panel: the traced REAL curve is the locked ground truth
      // (solid, never moves). If the panel also has a model, resample it onto
      // the same x grid and hand it in as the "baseline" (dashed) so it moves
      // with the sliders — the reader watches the model chase the real data.
      if (panel.digitized) {
        const real = digitizedRealRun(panel.digitized);
        const grid = real?.x || null;
        const model = fn && grid
          ? resampleRunToGrid(runResultPanel(fn, actOutputs, params, actFigHelpers), grid)
          : null;
        return { act: real, base: model, digitized: true };
      }

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
            <div className="flex shrink-0 items-center gap-2">
              {isOwner && fig.image && (
                <button onClick={() => onTrace(figIndex)}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                  <Crosshair size={13} /> Trace figure → real data
                </button>
              )}
              {hasPanels && (
                <button
                  onClick={() => setShowParams(!showParams)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    showParams ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
                  }`}
                >
                  <SlidersHorizontal size={13} /> Tune parameters
                </button>
              )}
            </div>
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
                    <div key={pi}>
                      <PredictGate predict={panel.reproduce === false ? null : panel.predict}>
                        {panel.reproduce === false ? (
                          <OriginalOnlyPanel panel={panel} />
                        ) : isSpecialDigitized(panel) ? (
                          <DigitizedPanel panel={panel} height={panelH} />
                        ) : (
                          <PanelChart panel={panel} baseRun={runs[pi]?.base} actRun={runs[pi]?.act}
                            height={panelH} onHover={setHover}
                            activeSuffix={runs[pi]?.digitized ? "traced" : ""}
                            baselineSuffix={runs[pi]?.digitized ? "live model" : "paper's value"} />
                        )}
                      </PredictGate>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  Plots marked <strong>traced from figure</strong> are the paper's real curve, digitized
                  point-for-point off the figure (solid, locked) — any dashed line is our live model
                  chasing it as you turn the dials. <strong>Paper's numbers</strong> plots are the paper's
                  published table values; the rest are a live simulation. None replace the measured figure on the left.
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
                {isOwner && fig.image && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    Use <strong>Trace figure → real data</strong> above to turn each subplot of this figure into an interactive plot.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        );
      })()}
    </LabWindow>
  );
}

/* ---------------- the model: how the paper actually works ----------------
 * Renders spec.model — the paper's methodology at the level authors care
 * about: experiment vs simulation, the actual toolchain (instruments,
 * software, algorithms), the governing equations with a term-by-term
 * glossary, the assumptions, and how the results were validated. */

const APPROACH_META = {
  experiment: { label: "Experimental study", Icon: FlaskConical, tone: "bg-rose-50 text-rose-700 border-rose-200" },
  simulation: { label: "Computational / theory study", Icon: Cpu, tone: "bg-blue-50 text-blue-700 border-blue-200" },
  hybrid:     { label: "Experiment + simulation", Icon: Waves, tone: "bg-violet-50 text-violet-700 border-violet-200" },
};

/** The Model methodology as a SEQUENCED panel instead of a wall of text: one
 * stage at a time (overview → each governing equation → assumptions → how it
 * was checked), advanced by Prev/Next or a Play button that auto-reveals the
 * sequence, each stage fading in. Replaces the old everything-at-once grid that
 * read like a retyped methods section. */
function ModelSequence({ model }) {
  const meta = APPROACH_META[model.approach] || APPROACH_META.simulation;
  const AIcon = meta.Icon;
  const steps = useMemo(() => {
    const s = [{ kind: "overview", label: "Overview" }];
    (model.equations || []).forEach((e, i) => s.push({ kind: "equation", i, label: e.name || `Eq. ${i + 1}` }));
    if (model.assumptions?.length) s.push({ kind: "assumptions", label: "Assumptions" });
    if (model.validation) s.push({ kind: "validation", label: "How it was checked" });
    return s;
  }, [model]);

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  const clamp = (i) => Math.max(0, Math.min(steps.length - 1, i));
  const go = (i) => { setPlaying(false); setStep(clamp(i)); };

  useEffect(() => {
    clearTimeout(timer.current);
    if (!playing) return;
    if (step >= steps.length - 1) { setPlaying(false); return; }
    timer.current = setTimeout(() => setStep((s) => clamp(s + 1)), 6500);
    return () => clearTimeout(timer.current);
  }, [playing, step, steps.length]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const cur = steps[Math.min(step, steps.length - 1)];
  const eq = cur.kind === "equation" ? model.equations[cur.i] : null;

  return (
    <div className="p-4">
      {/* transport: play the sequence, or step through it */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => { if (step >= steps.length - 1) setStep(0); setPlaying((p) => !p); }}
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-blue-700"
          title={playing ? "Pause" : "Play the methodology, stage by stage"}>
          {playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" className="translate-x-[1px]" />}
          {playing ? "Pause" : "Play the walkthrough"}
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => go(step - 1)} disabled={step === 0}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-30" title="Previous stage">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => go(step + 1)} disabled={step >= steps.length - 1}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-30" title="Next stage">
            <ChevronRight size={16} />
          </button>
        </div>
        {/* labelled step pills */}
        <div className="flex flex-wrap items-center gap-1">
          {steps.map((s, i) => (
            <button key={i} onClick={() => go(i)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                i === step ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              title={s.label}>
              {i === step ? s.label : i + 1}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] font-medium tabular-nums text-slate-400">{step + 1} / {steps.length}</span>
      </div>

      {/* stage — ONE thing at a time, re-fades on every change */}
      <div key={step} className="pp-rise min-h-[320px] rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5">
        {cur.kind === "overview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.tone}`}>
                <AIcon size={12} /> {meta.label}
              </span>
            </div>
            <p className="max-w-3xl text-[15px] leading-relaxed text-slate-800">{model.summary}</p>
            {model.toolchain?.length ? (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Code2 size={12} /> The actual toolchain — instruments &amp; software
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {model.toolchain.map((t, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm">
                      <span className="mt-0.5 shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[9.5px] font-bold text-white">{t.name}</span>
                      <span className="text-[11.5px] leading-snug text-slate-600">{t.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {cur.kind === "equation" && eq && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h4 className="text-sm font-bold text-slate-900">{eq.name}</h4>
              {eq.source ? <span className="text-[10.5px] italic text-slate-400">{eq.source}</span> : null}
              <ProvenanceChip provenance={eq.provenance} />
            </div>
            <div className="pp-eq rounded-2xl px-4 py-6 text-center text-lg sm:text-xl"><Eq>{eq.eq}</Eq></div>
            <p className="max-w-3xl text-[13px] leading-relaxed text-slate-700">{eq.plain}</p>
            {eq.terms?.length ? (
              <table className="w-full border-t border-slate-100 text-[11.5px]">
                <tbody>
                  {eq.terms.map((t, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="w-24 py-1.5 pr-3 align-top font-semibold text-slate-800" style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}>{t.sym}</td>
                      <td className="py-1.5 leading-snug text-slate-600">{t.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        )}

        {cur.kind === "assumptions" && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <CircleAlert size={12} /> The assumptions the results rest on
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {model.assumptions.map((a, i) => (
                <li key={i} className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-[12.5px] leading-snug text-slate-700 shadow-sm">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-800 text-[10px] font-bold text-white">{i + 1}</span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {cur.kind === "validation" && (
          <div className="flex h-full flex-col justify-center gap-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
              <CircleCheck size={12} /> How the authors checked themselves
            </div>
            <p className="max-w-3xl rounded-2xl border border-emerald-100 bg-emerald-50/60 px-5 py-4 text-[14px] leading-relaxed text-emerald-900">
              {model.validation}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Rich dark stage card for the Model explainer's opening slide — fills the
 * frame with the approach + summary + toolchain instead of a bare title. */
function ModelStageIntro({ model, accent = "#2563eb" }) {
  const meta = APPROACH_META[model.approach] || APPROACH_META.simulation;
  const AIcon = meta.Icon;
  return (
    <div className="relative flex h-full w-full flex-col justify-center gap-3 overflow-hidden rounded-lg p-6"
      style={{ background: "radial-gradient(120% 90% at 15% 0%, #16233b, #0b1220)" }}>
      <div className="flex items-center gap-2">
        <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: `${accent}22`, border: `1px solid ${accent}66` }}>
          <AIcon size={22} style={{ color: "#93c5fd" }} />
        </span>
        <div>
          <div className="text-xl font-bold text-white sm:text-2xl">What the paper actually did</div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-300">{meta.label}</div>
        </div>
      </div>
      <p className="max-w-2xl text-[13.5px] leading-relaxed text-slate-200 line-clamp-4">{model.summary}</p>
      {model.toolchain?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {model.toolchain.slice(0, 6).map((t, i) => (
            <span key={i} className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-100" title={t.role}>
              {t.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Rich dark stage card for the Model explainer's closing slide — the real
 * validation + assumptions, not an empty "How it was checked" title. */
function ModelStageValidation({ model, accent = "#10b981" }) {
  return (
    <div className="relative flex h-full w-full flex-col justify-center gap-3 overflow-hidden rounded-lg p-6"
      style={{ background: "radial-gradient(120% 90% at 85% 0%, #0f2a22, #0b1220)" }}>
      <div className="flex items-center gap-2">
        <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: `${accent}22`, border: `1px solid ${accent}66` }}>
          <CircleCheck size={22} style={{ color: "#6ee7b7" }} />
        </span>
        <div className="text-xl font-bold text-white sm:text-2xl">How we know it holds up</div>
      </div>
      {model.validation ? (
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-emerald-50">{model.validation}</p>
      ) : (
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-slate-300">The paper reports no explicit validation step.</p>
      )}
      {model.assumptions?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {model.assumptions.slice(0, 4).map((a, i) => (
            <span key={i} className="max-w-[46%] truncate rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[10.5px] text-slate-200" title={a}>
              · {a}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TheModel({ model, explainer, onOpenFig }) {
  if (!model) return null;
  const meta = APPROACH_META[model.approach] || APPROACH_META.simulation;
  const AIcon = meta.Icon;

  // The Model explainer shows the paper's real governing EQUATIONS, big and
  // filling the frame — the methodology, not the result figures (those live,
  // digitized and interactive, in the Results lab).
  const renderVisual = (visual) => {
    if (visual?.type === "equation" && model.equations?.[visual.equationIdx]) {
      return <StageEquation eq={model.equations[visual.equationIdx]} accent="#2563eb" />;
    }
    if (visual?.type === "validation") return <ModelStageValidation model={model} />;
    return <ModelStageIntro model={model} />;
  };

  return (
   <LabShell>
    {explainer?.scenes?.length ? (
      <div className="mb-4">
        <ExplainerVideo explainer={explainer} renderVisual={renderVisual} accent="#2563eb" material={model.material || []} />
      </div>
    ) : null}
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-800 px-4 py-2.5">
        <span className="text-[13px] font-bold text-white">
          The Model — what the paper actually did, and the equations underneath
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.tone}`}>
          <AIcon size={12} /> {meta.label}
        </span>
      </div>

      <ModelSequence model={model} />
      <div className="px-4 pb-4">
        <LearnStrip terms={model.glossary} takeaways={model.takeaways} material={model.material} />
      </div>
    </div>
   </LabShell>
  );
}

/* ---------------- reverse-engineering lab ----------------
 * The paper's digitized curve is the locked ground truth; the reduced live
 * model is the challenger. The reader scrambles the parameters (or hand-tunes
 * them) and an in-browser optimizer walks the sliders back until the model
 * lands on the published curve — recovering the parameter values the authors
 * used from the figure alone. Works on any paper whose result panels carry
 * BOTH digitized data and a live model kernel. */

function MatchMeter({ pct, label, active = false, onClick }) {
  const tone = pct >= 90 ? "emerald" : pct >= 70 ? "amber" : "rose";
  const bar = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500" }[tone];
  const txt = { emerald: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700" }[tone];
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
        active ? "border-fuchsia-300 bg-fuchsia-50/60 shadow-sm" : "border-slate-200 bg-white hover:border-fuchsia-200"
      }`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-semibold text-slate-700">{label}</span>
        <span className={`shrink-0 text-sm font-extrabold tabular-nums ${txt}`}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar} transition-all duration-300`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </button>
  );
}

function ReverseLab({ spec, pipelineCompiled, helpers, actOutputs, defaults, params, setParam, setAllParams, targets, layout }) {
  const paramDefs = useMemo(() => fitParamDefs(spec), [spec]);
  const lossFn = useMemo(
    () => makeLossFn(spec, pipelineCompiled, helpers, targets),
    [spec, pipelineCompiled, helpers, targets]
  );
  const figCompiled = useMemo(() => compileResultFigures(spec), [spec]);
  const actFigHelpers = useMemo(
    () => makeFigureHelpers(spec, pipelineCompiled, helpers, params),
    [spec, pipelineCompiled, helpers, params]
  );

  const [activeId, setActiveId] = useState(targets[0]?.id || "");
  const [fitting, setFitting] = useState(false);
  const [fitDone, setFitDone] = useState(null); // final optimizer state
  const [scrambled, setScrambled] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearInterval(timerRef.current), []);

  const current = useMemo(() => lossFn(params), [lossFn, params]);
  const overall = matchPct(current.loss);
  const panelH = layout?.numeric?.panelChartH ?? 220;

  const target = targets.find((t) => t.id === activeId) || targets[0];
  const chart = useMemo(() => {
    if (!target) return null;
    const real = digitizedRealRun(target.panel.digitized);
    if (!real) return null;
    const fn = figCompiled.fns[target.id];
    const model = fn
      ? resampleRunToGrid(runResultPanel(fn, actOutputs, params, actFigHelpers), real.x)
      : null;
    return { real, model };
  }, [target, figCompiled, actOutputs, params, actFigHelpers]);

  const stopFit = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    setFitting(false);
  }, []);

  const startFit = useCallback(() => {
    if (fitting || !paramDefs.length) return;
    setFitDone(null);
    setFitting(true);
    const gen = patternSearchFit(paramDefs, params, lossFn);
    let last = null;
    timerRef.current = setInterval(() => {
      // a few optimizer probes per tick → the sliders visibly walk home
      for (let k = 0; k < 3; k++) {
        const n = gen.next();
        if (n.done) {
          clearInterval(timerRef.current); timerRef.current = null;
          if (last) { setAllParams(last.params); setFitDone(last); }
          setFitting(false);
          return;
        }
        last = n.value;
        if (last.done) {
          clearInterval(timerRef.current); timerRef.current = null;
          setAllParams(last.params); setFitDone(last); setFitting(false);
          return;
        }
      }
      setAllParams(last.params);
    }, 50);
  }, [fitting, paramDefs, params, lossFn, setAllParams]);

  const scramble = useCallback(() => {
    if (fitting) return;
    setFitDone(null);
    setScrambled(true);
    setAllParams(scrambleParams(paramDefs, defaults));
  }, [fitting, paramDefs, defaults, setAllParams]);

  if (!targets.length || !paramDefs.length) return null;

  const range = (d) => d.max - d.min || 1;
  const recovered = fitDone
    ? paramDefs.map((d) => ({
        def: d,
        paper: defaults[d.key],
        found: fitDone.params[d.key],
        offPct: (Math.abs(fitDone.params[d.key] - defaults[d.key]) / range(d)) * 100,
      }))
    : null;
  const recoveredClean = recovered && recovered.every((r) => r.offPct < 3);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-fuchsia-600 px-4 py-2.5">
        <span className="text-[13px] font-bold text-white">
          Reverse-Engineering Lab — recover the paper's parameters from its own curves
        </span>
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          {targets.length} target curve{targets.length === 1 ? "" : "s"} · {paramDefs.length} unknowns
        </span>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-7">
        {/* left rail: how it works + targets + verdict */}
        <div className="space-y-3 xl:col-span-2">
          <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/50 p-3 text-[12px] leading-relaxed text-slate-700">
            The <strong>solid curves</strong> are digitized point-for-point off the paper's published
            figure — they never move. The <strong>dashed curve</strong> is the reduced model of the
            paper's method, driven by the {paramDefs.length} dials below. <strong>Scramble</strong> the
            dials, then hit <strong>Auto-fit</strong>: an optimizer runs the model hundreds of times in
            your browser and walks every dial back until the model sits on the published data —
            recovering the operating point the authors used, from the figure alone.
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Fit quality — model vs the paper's digitized data
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-slate-500">Overall match</span>
              <span className={`text-2xl font-black tabular-nums ${overall >= 90 ? "text-emerald-600" : overall >= 70 ? "text-amber-600" : "text-rose-600"}`}>
                {overall.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${overall >= 90 ? "bg-emerald-500" : overall >= 70 ? "bg-amber-500" : "bg-rose-500"}`}
                style={{ width: `${Math.max(2, overall)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
              100% = the model overlays the digitized curve exactly (RMS deviation 0% of the curve's range).
            </p>
          </div>

          <div className="space-y-2">
            {targets.map((t) => (
              <MatchMeter
                key={t.id}
                label={`${t.figureLabel} · ${t.subplotLabel || t.yLabel}`}
                pct={matchPct(current.per[t.id])}
                active={t.id === (target?.id || "")}
                onClick={() => setActiveId(t.id)}
              />
            ))}
          </div>

          {recovered && (
            <div className={`rounded-xl border p-3 ${recoveredClean ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                <Trophy size={13} className={recoveredClean ? "text-emerald-600" : "text-amber-600"} />
                {recoveredClean
                  ? "Parameters recovered from the published curve"
                  : "Best fit found — compare with the paper's values"}
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="pb-1">Parameter</th>
                    <th className="pb-1 text-right">Paper</th>
                    <th className="pb-1 text-right">Recovered</th>
                  </tr>
                </thead>
                <tbody>
                  {recovered.map((r) => (
                    <tr key={r.def.key} className="border-t border-slate-200/60">
                      <td className="py-1 pr-2 text-slate-600">{r.def.label}</td>
                      <td className="py-1 text-right font-semibold tabular-nums text-slate-800">{fmt(r.paper, 3).replace(/\.?0+$/, "")}</td>
                      <td className={`py-1 text-right font-semibold tabular-nums ${r.offPct < 3 ? "text-emerald-700" : "text-amber-700"}`}>
                        {fmt(r.found, 3).replace(/\.?0+$/, "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                {recoveredClean
                  ? "Every dial landed within 3% of the paper's setting — the published figure encodes the whole operating point."
                  : "Dials in amber found a different setting with a similar curve — parameters that trade off against each other can't be separated from this figure alone."}
              </p>
            </div>
          )}
        </div>

        {/* right: chart + controls + dials */}
        <div className="xl:col-span-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              onClick={scramble}
              disabled={fitting}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-fuchsia-300 hover:text-fuchsia-700 disabled:opacity-40"
            >
              <Shuffle size={13} /> Scramble the dials
            </button>
            <button
              onClick={fitting ? stopFit : startFit}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white shadow-sm ${
                fitting ? "bg-slate-700 hover:bg-slate-600" : "bg-fuchsia-600 hover:bg-fuchsia-700"
              }`}
            >
              <Wand2 size={13} /> {fitting ? "Fitting… (click to stop)" : "Auto-fit: reverse-engineer the curve"}
            </button>
            <button
              onClick={() => { if (!fitting) { setAllParams(defaults); setFitDone(null); setScrambled(false); } }}
              disabled={fitting}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:border-slate-300 disabled:opacity-40"
            >
              <RotateCcw size={13} /> Paper's values
            </button>
            {scrambled && !fitDone && !fitting && (
              <span className="text-[11px] font-medium text-fuchsia-700">
                Dials scrambled — tune by hand and watch the match %, or let Auto-fit recover them.
              </span>
            )}
          </div>

          {target && chart && (
            <PanelChart
              panel={target.panel}
              baseRun={chart.model}
              actRun={chart.real}
              height={Math.max(panelH, 230)}
              activeSuffix="paper (digitized)"
              baselineSuffix="your model"
            />
          )}
          {target && (
            <p className="mt-1.5 text-[11px] text-slate-400">
              {target.figureLabel} — {target.figureTitle} · axes: {target.xLabel} → {target.yLabel}
              {target.panel.digitized?.source ? <> · source: {target.panel.digitized.source}</> : null}
            </p>
          )}

          <div className="mt-3 grid gap-x-6 rounded-xl border border-fuchsia-100 bg-fuchsia-50/40 px-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
            {paramDefs.map((p) => (
              <ParamSlider key={p.key} def={p} value={params[p.key]} onChange={setParam} />
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            The same dials drive the Method Lab and every live overlay in the Results Lab — a fit found
            here carries through the whole page. Auto-fit is a bounded pattern search over{" "}
            {paramDefs.length} parameters, minimizing the RMS gap to the digitized points; it runs
            entirely in your browser.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- claims vs evidence (trust layer) ----------------
 * Every headline claim tagged by how directly the paper's OWN evidence backs
 * it — the honest "what's shown vs asserted?" a researcher asks first. */
const CLAIM_STYLE = {
  direct:   { label: "Shown",    cls: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500", icon: ShieldCheck,
    tip: "Directly demonstrated by a figure or table in this paper" },
  indirect: { label: "Inferred", cls: "border-amber-200 bg-amber-50 text-amber-800",       dot: "bg-amber-500",   icon: CircleAlert,
    tip: "Supported, but via inference, aggregation or a proxy" },
  asserted: { label: "Asserted", cls: "border-slate-200 bg-slate-50 text-slate-600",       dot: "bg-slate-400",   icon: TriangleAlert,
    tip: "Stated without direct in-paper evidence (cited work or framing)" },
};

function ClaimsEvidence({ claims }) {
  const items = (claims || []).filter((c) => c && c.claim);
  if (!items.length) return null;
  const counts = items.reduce((m, c) => ({ ...m, [c.strength]: (m[c.strength] || 0) + 1 }), {});
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
        {["direct", "indirect", "asserted"].map((k) => counts[k] ? (
          <span key={k} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-semibold ${CLAIM_STYLE[k].cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${CLAIM_STYLE[k].dot}`} /> {counts[k]} {CLAIM_STYLE[k].label.toLowerCase()}
          </span>
        ) : null)}
        <span className="text-slate-400">how directly the paper's own evidence backs each claim</span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((c, i) => {
          const st = CLAIM_STYLE[c.strength] || CLAIM_STYLE.asserted;
          const Icon = st.icon;
          return (
            <li key={i} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/40 p-3">
              <span className={`mt-0.5 flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${st.cls}`} title={st.tip}>
                <Icon size={12} /> {st.label}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-snug text-slate-800">{c.claim}</p>
                <p className="mt-0.5 text-[11.5px] text-slate-500">
                  {c.support && c.support !== "none" && c.evidence
                    ? <span className="font-semibold text-slate-600">{c.evidence}</span>
                    : <span className="italic">no direct in-paper evidence</span>}
                  {c.note ? <> — {c.note}</> : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------- flashcards (durable memory) ----------------
 * Flip-card deck of the paper's must-remember facts; "known" marks persist per
 * paper in localStorage so a one-shot read becomes something you revisit. */
function Flashcards({ cards, paperKey }) {
  const deck = (cards || []).filter((c) => c && c.front && c.back);
  const storeKey = `pp-flashcards-known:${paperKey}`;
  const [known, setKnown] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storeKey) || "[]")); } catch { return new Set(); }
  });
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!deck.length) return null;

  const persist = (set) => { try { localStorage.setItem(storeKey, JSON.stringify([...set])); } catch { /* quota */ } };
  const go = (d) => { setIdx((i) => (i + d + deck.length) % deck.length); setFlipped(false); };
  const toggleKnown = () => {
    setKnown((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      persist(next);
      return next;
    });
  };
  const card = deck[idx];
  const isKnown = known.has(idx);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>Card {idx + 1} of {deck.length}{card.tag ? <> · <span className="font-semibold text-indigo-600">{card.tag}</span></> : null}</span>
        <span className="font-semibold text-emerald-600">{known.size}/{deck.length} known</span>
      </div>
      <button
        onClick={() => setFlipped((f) => !f)}
        className="flex min-h-[132px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/40 px-5 py-6 text-center transition hover:border-indigo-300"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">{flipped ? "Answer" : "Prompt · click to flip"}</span>
        <span className={`leading-snug text-slate-800 ${flipped ? "text-[13px]" : "text-[14.5px] font-semibold"}`}>
          {flipped ? card.back : card.front}
        </span>
      </button>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button onClick={() => go(-1)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:border-indigo-300">
          <ChevronLeft size={14} /> Prev
        </button>
        <button onClick={toggleKnown}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${
            isKnown ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
          }`}>
          <CheckIcon size={14} /> {isKnown ? "Known" : "Mark known"}
        </button>
        <button onClick={() => go(1)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:border-indigo-300">
          Next <ChevronRight size={14} />
        </button>
      </div>
      {known.size > 0 && (
        <button onClick={() => { const empty = new Set(); setKnown(empty); persist(empty); }}
          className="mt-2 flex items-center gap-1 text-[10.5px] text-slate-400 hover:text-slate-600">
          <RotateCw size={11} /> reset progress
        </button>
      )}
    </div>
  );
}

/* ---------------- ask-anywhere (select text → grounded explain) ----------------
 * Selecting any text inside a section pops a small "Explain" chip; clicking it
 * opens the section dock with the selection asked for you — so the reason to
 * leave for a chatbot (my exact question, right here) lives inside the page. */
function SelectionExplain({ onAsk }) {
  const [chip, setChip] = useState(null); // { x, y, text, sectionId, sectionTitle }
  useEffect(() => {
    const onUp = () => {
      // let the selection settle
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel && String(sel).trim();
        if (!text || text.length < 4 || text.length > 400) { setChip(null); return; }
        let node = sel.anchorNode;
        while (node && node.nodeType !== 1) node = node.parentNode;
        const host = node && node.closest?.("[data-section-id]");
        if (!host) { setChip(null); return; }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setChip({
          x: rect.left + rect.width / 2, y: rect.top - 8,
          text, sectionId: host.getAttribute("data-section-id"),
          sectionTitle: host.getAttribute("data-section-title") || "this section",
        });
      }, 10);
    };
    const onDown = () => setChip(null);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("mouseup", onUp); document.removeEventListener("mousedown", onDown); };
  }, []);
  if (!chip) return null;
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={() => {
        onAsk({ sectionId: chip.sectionId, title: chip.sectionTitle, initialAsk: `Explain this, in the context of this section: “${chip.text}”` });
        setChip(null);
        window.getSelection()?.removeAllRanges();
      }}
      style={{ position: "fixed", left: chip.x, top: chip.y, transform: "translate(-50%, -100%)", zIndex: 60 }}
      className="pp-rise flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-2 text-[12px] font-semibold text-white shadow-xl ring-2 ring-white hover:bg-indigo-700"
    >
      <Sparkles size={13} /> Explain the selected text
    </button>
  );
}

/* ---------------- left guide rail (orientation + jump-to) ----------------
 * Fills the blank left margin on wide screens with a persistent map of the
 * page: what this walkthrough IS, the few gestures that unlock it, and a
 * vertical table of contents that tracks where you are. So a reader opening an
 * analyzed paper immediately knows what they're looking at and where to go. */
const GUIDE_TIPS = [
  { icon: SlidersHorizontal, text: "Drag any slider — the figures recompute live." },
  { icon: Sparkles, text: "Select any text → “Explain the selected text”." },
  { icon: GraduationCap, text: "Tutor & quiz on every section — type or talk." },
  { icon: Layers, text: "Flip the flashcards to make it stick." },
];

// Fixed placement chosen by the designer. Not user-draggable — pinned in the
// left margin, scaled up, always visible while scrolling.
const GUIDE_LEFT = 11;
const GUIDE_TOP = 330;
const GUIDE_SCALE = 1.3;
const GUIDE_W = 224;

function GuideRail({ sections }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);

  // Only show when the left margin is wide enough to hold the (scaled) rail
  // without covering the centred ~1280px content column. Otherwise the sticky
  // top nav handles navigation.
  const fits = () => (typeof window !== "undefined") &&
    ((window.innerWidth - 1280) / 2) >= (GUIDE_LEFT + GUIDE_W * GUIDE_SCALE + 10);
  const [roomy, setRoomy] = useState(fits());
  useEffect(() => {
    const onResize = () => setRoomy(fits());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Scroll-spy: highlight the section you're currently in. An IntersectionObserver
  // is used only as a cheap trigger; on every fire we recompute the active section
  // from ALL sections' live rects (the last whose top has passed a line ~130px
  // down) — avoids the "only-changed-entries" staleness of a naive observer.
  useEffect(() => {
    const compute = () => {
      let current = sections[0]?.id;
      for (const s of sections) {
        const el = document.querySelector(`[data-box="${s.boxId}"]`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 130) current = s.id;
        else break;
      }
      setActiveId(current);
    };
    compute();
    const els = sections.map((s) => document.querySelector(`[data-box="${s.boxId}"]`)).filter(Boolean);
    const io = new IntersectionObserver(compute, { threshold: [0, 0.5, 1], rootMargin: "-80px 0px 0px 0px" });
    els.forEach((e) => io.observe(e));
    window.addEventListener("resize", compute);
    return () => { io.disconnect(); window.removeEventListener("resize", compute); };
  }, [sections]);

  const jump = (boxId) => document.querySelector(`[data-box="${boxId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (!roomy) return null;

  return (
    <div style={{ position: "fixed", left: GUIDE_LEFT, top: GUIDE_TOP, width: GUIDE_W, transform: `scale(${GUIDE_SCALE})`, transformOrigin: "top left", zIndex: 40 }}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="flex flex-col gap-2.5 overflow-y-auto p-2.5" style={{ maxHeight: `calc((100vh - ${GUIDE_TOP + 16}px) / ${GUIDE_SCALE})` }}>
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">Your guide</div>
          <ul className="flex flex-col gap-1.5">
            {GUIDE_TIPS.map((t, i) => {
              const Icon = t.icon;
              return (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-snug text-slate-600">
                  <Icon size={13} className="mt-0.5 shrink-0 text-indigo-500" /> {t.text}
                </li>
              );
            })}
          </ul>
        </div>

        <nav className="border-t border-slate-100 pt-2">
          <div className="mb-0.5 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">On this page</div>
          {sections.map((s, i) => {
            const t = SECTION_TONES[s.tone];
            const on = activeId === s.id;
            const Icon = s.icon;
            return (
              <button key={s.id} onClick={() => jump(s.boxId)}
                className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[12px] transition ${
                  on ? "bg-slate-100 font-semibold text-slate-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white ${t.badge}`}>{i + 1}</span>
                <Icon size={13} className={on ? t.text : "text-slate-400"} />
                <span className="truncate">{s.navLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/* ---------------- main workspace ---------------- */

export default function Workspace({ spec: baseSpec, onBack, onSignOut, isOwner = false }) {
  // Digitized (traced-from-figure) data an owner authors live is layered onto
  // the spec here — keyed "figIdx:panelIdx" — so tracing never mutates the
  // original and every downstream memo just sees a spec with `digitized` blocks
  // filled in. onSave from the editor writes into this map.
  const [digitizedOverrides, setDigitizedOverrides] = useState({}); // figIndex -> panels[]
  const [traceTarget, setTraceTarget] = useState(null); // figIndex
  const spec = useMemo(() => {
    if (!Object.keys(digitizedOverrides).length) return baseSpec;
    const figs = (baseSpec.resultFigures || []).map((f, fi) =>
      digitizedOverrides[fi] ? { ...f, panels: digitizedOverrides[fi] } : f);
    return { ...baseSpec, resultFigures: figs };
  }, [baseSpec, digitizedOverrides]);

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
  const [chatSection, setChatSection] = useState(null); // {sectionId, title} | null
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

  // Bulk setter used by the Reverse-Engineering Lab's scramble / auto-fit
  const setAllParams = useCallback((next) => {
    setParams((p) => ({ ...p, ...next }));
  }, []);
  const fitTargets = useMemo(() => extractFitTargets(spec), [spec]);

  const togglePin = useCallback((t) => {
    setPinnedT((prev) => (prev != null && Math.abs(prev - t) < 1e-9 ? null : t));
  }, []);

  const infoBlock = spec.blocks.find((b) => b.key === infoKey) || null;

  // One list drives both the sticky jump-to nav and the actual sections
  // below, so a section that's off/empty just disappears from both places
  // instead of leaving a numbering gap or a dead nav entry.
  const sections = [
    {
      id: "story", boxId: "sec-story", boxLabel: "Story", navLabel: "Story", ariaLabel: "The paper's story",
      show: !!spec.story && sec("story").on, tone: "rose", icon: Sparkles,
      content: <StoryPlayer story={spec.story} />,
    },
    {
      id: "mindmap", boxId: "sec-mindmap", boxLabel: "Mind map", navLabel: "Map", ariaLabel: "The paper as a concept map",
      show: !!spec.mindmap?.nodes?.length && sec("mindmap").on, tone: "rose", icon: Network,
      content: <MindMap mindmap={spec.mindmap} />,
    },
    {
      id: "concept", boxId: "sec-concept", boxLabel: "Idea in pictures", navLabel: "Idea", ariaLabel: "Concept primer",
      show: !!spec.conceptFigures?.length && sec("concept").on, tone: "violet", icon: ImageIcon,
      content: <ConceptFigures figures={spec.conceptFigures} onOpen={setLightbox} />,
    },
    {
      id: "foundations", boxId: "sec-foundations", boxLabel: "Background", navLabel: "Background", ariaLabel: "Foundations from prior work",
      show: !!spec.foundations?.length && sec("foundations").on, tone: "amber", icon: Landmark,
      content: <FoundationsLab foundations={spec.foundations} explainer={buildExplainer(spec, "foundations")} onOpenFig={setLightbox} />,
    },
    {
      id: "model", boxId: "sec-model", boxLabel: "The model", navLabel: "Model", ariaLabel: "The paper's methodology, tools and governing equations",
      show: !!spec.model && sec("model").on, tone: "blue", icon: Sigma,
      content: <TheModel model={spec.model} explainer={buildExplainer(spec, "model")} onOpenFig={setLightbox} />,
    },
    {
      id: "method", boxId: "sec-method", boxLabel: "Method lab", navLabel: "Method", ariaLabel: "The paper's contribution",
      show: hasPipeline && sec("method").on, tone: "blue", icon: GitBranch,
      content: (
        <ConceptLab
          spec={spec} params={params} defaults={defaults} setParam={setParam} rows={rows} compiled={compiled}
          pinnedT={pinnedT} onPin={togglePin} onInfo={setInfoKey} onInspect={setInspect} layout={layout}
        />
      ),
    },
    {
      id: "explorables", boxId: "sec-explorables", boxLabel: "Explorables lab", navLabel: "Explore", ariaLabel: "Interactive explorers derived from the paper's own equations and data",
      show: !!spec.explorables?.length && sec("explorables").on, tone: "amber", icon: FlaskConical,
      content: <ExplorablesLab explorables={spec.explorables} />,
    },
    {
      id: "results", boxId: "sec-results", boxLabel: "Results lab", navLabel: "Results", ariaLabel: "The paper's result figures",
      show: !!spec.resultFigures?.length && sec("results").on, tone: "emerald", icon: LineChartIcon,
      content: (
        <ResultsLab
          spec={spec} pipelineCompiled={compiled} helpers={helpers} baseOutputs={baseline.outputs} actOutputs={active.outputs}
          defaults={defaults} params={params} setParam={setParam} onOpenFig={setLightbox} layout={layout}
          isOwner={isOwner} onTrace={(figIndex) => setTraceTarget(figIndex)}
        />
      ),
    },
    {
      id: "reverse", boxId: "sec-reverse", boxLabel: "Reverse-engineer", navLabel: "Reverse", ariaLabel: "Reverse-engineer the paper's results",
      show: hasPipeline && fitTargets.length > 0 && sec("reverse").on, tone: "fuchsia", icon: Crosshair,
      content: (
        <ReverseLab
          spec={spec} pipelineCompiled={compiled} helpers={helpers} actOutputs={active.outputs}
          defaults={defaults} params={params} setParam={setParam} setAllParams={setAllParams}
          targets={fitTargets} layout={layout}
        />
      ),
    },
    {
      id: "claims", boxId: "sec-claims", boxLabel: "Claims vs evidence", navLabel: "Claims", ariaLabel: "The paper's claims tagged by evidence",
      show: !!spec.claims?.length && sec("claims").on, tone: "emerald", icon: ShieldCheck,
      content: <ClaimsEvidence claims={spec.claims} />,
    },
    {
      id: "flashcards", boxId: "sec-flashcards", boxLabel: "Remember this paper", navLabel: "Recall", ariaLabel: "Flashcards for this paper",
      show: !!spec.flashcards?.length && sec("flashcards").on, tone: "violet", icon: Layers,
      content: <Flashcards cards={spec.flashcards} paperKey={spec.meta?.title || "paper"} />,
    },
  ].filter((s) => s.show);

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

      {!free && <SectionNav sections={sections} conclusionLabel="Back to top" />}

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

        {/* sections come from the `sections` list built above — a hidden or
            empty one just disappears from the array, so numbering never
            leaves a gap and the nav bar always matches what's on screen. */}
        {sections.map((s, i) => (
          <DesignBox key={s.id} id={s.boxId} label={s.boxLabel} mode={free ? "free" : "flow"} rect={layout.boxes[s.boxId]} onRect={setBox} register={registerBox}>
            <section aria-label={s.ariaLabel} data-section-id={s.id} data-section-title={sec(s.id).title}>
              <SectionHeader
                num={i + 1} tone={s.tone} icon={s.icon} title={sec(s.id).title} sub={sec(s.id).sub}
                onAsk={() => setChatSection({ sectionId: s.id, title: sec(s.id).title })}
              />
              {s.content}
            </section>
          </DesignBox>
        ))}
      </main>

      {!free && <GuideRail sections={sections} />}

      <SelectionExplain onAsk={setChatSection} />
      <SectionChat spec={spec} open={chatSection} onClose={() => setChatSection(null)} />

      <InfoModal block={infoBlock} onClose={() => setInfoKey(null)} />
      <ReferencesDrawer references={spec.references} open={refsOpen} onClose={() => setRefsOpen(false)} />
      <Inspector inspect={inspect} rows={rows} onClose={() => setInspect(null)} />
      <Lightbox fig={lightbox} onClose={() => setLightbox(null)} />
      <LayoutEditor open={editorOpen} layout={layout} onChange={setLayout} onClose={() => setEditorOpen(false)} />
      {traceTarget != null && (() => {
        // seed from the CURRENT figure (restores prior traced subplots); the
        // editor returns a full panels[] that replaces this figure's panels
        const f = spec.resultFigures?.[traceTarget];
        if (!f) return null;
        return (
          <DigitizerEditor
            fig={f}
            onClose={() => setTraceTarget(null)}
            onSave={(panels) => {
              setDigitizedOverrides((prev) => ({ ...prev, [traceTarget]: panels }));
              setTraceTarget(null);
            }}
          />
        );
      })()}
    </div>
  );
}
