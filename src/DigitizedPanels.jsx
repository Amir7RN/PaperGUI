/**
 * Renderers for digitized result panels whose data isn't an x–y curve:
 * radar, box, heatmap, violin, grouped bars, horizontal stacked bars,
 * scatter clouds, and radial (polar) bars. Each takes a panel whose
 * `digitized.kind` selects the renderer and carries the real values read off
 * the paper's figure (or its published source data). These render the paper's
 * OWN numbers interactively — no live-model overlay, because these chart
 * types have no slider-driven model to chase; the data IS the panel.
 *
 * Fidelity rule: a reproduction must match the ORIGINAL figure's chart type
 * and orientation — a horizontal stacked bar is never redrawn as vertical
 * grouped bars, a red-to-green heat map is never recolored blue. When the
 * original encodes with its own colors, the spec passes them via
 * `colors` / `palette`; otherwise the shared validated PALETTE applies.
 */

import React, { useState } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";

/** Categorical palette — order fixed, never cycled mid-chart. Validated:
 *  worst adjacent-pair ΔE(Lab) = 46.4 in both normal vision and deuteranopia
 *  (Viénot projection), all L* in the 35–75 band on a white surface. */
export const PALETTE = [
  "#2a78d6", // blue
  "#eda100", // amber
  "#1baf7a", // green
  "#e34948", // red
  "#5b4bc4", // indigo
  "#e87ba4", // pink
  "#64748b", // slate (neutral — always paired with a legend/label)
  "#8a6d3b", // brown
  "#0e9aa7", // teal
  "#b83280", // magenta
];
const HUES = PALETTE;
const fmt = (v, d = 2) => (v === undefined || v === null || Number.isNaN(+v) ? "–" : (+v).toFixed(d));

/** Shared card chrome + "traced from figure" badge. */
function PanelShell({ panel, children, footer }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-2">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700" title={panel.subplotLabel}>
          {panel.subplotLabel}
        </span>
        <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-blue-600"
          title={panel.digitized?.source ? `Traced from ${panel.digitized.source}` : "Traced off the real figure"}>
          traced
        </span>
      </div>
      {children}
      {footer}
    </div>
  );
}

/** Hover readout footer used by every renderer here. */
function Readout({ hover, idle }) {
  return (
    <div className={`mt-1 rounded-md px-2 py-1 text-[11px] tabular-nums ${hover ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-400"}`}>
      {hover || idle}
    </div>
  );
}

/** Small color-chip legend (identity never rides on color alone — labels sit
 *  beside every chip, and the hover readout names the mark). */
function ChipLegend({ items }) {
  if (!items?.length || items.length < 2) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 px-1">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1 text-[9.5px] text-slate-500">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ---------------- radar / spider ---------------- */

function RadarPanel({ panel, height = 220 }) {
  const d = panel.digitized || {};
  const axes = d.axes || [];
  const series = d.series || [];
  if (axes.length < 3 || !series.length) {
    return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">Radar needs ≥3 axes and ≥1 series.</div></PanelShell>;
  }
  const data = axes.map((a, i) => {
    const row = { axis: a.name || `axis ${i + 1}` };
    series.forEach((s, k) => { row[`s${k}`] = Number.isFinite(s.values?.[i]) ? s.values[i] : 0; });
    return row;
  });
  return (
    <PanelShell panel={panel}>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="#e1e0d9" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#52514e", fontSize: 10 }} />
          <PolarRadiusAxis tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={(v) => fmt(v, 1)} />
          {series.map((s, k) => (
            <Radar key={k} name={s.label} dataKey={`s${k}`} stroke={s.color || HUES[k % HUES.length]}
              fill={s.color || HUES[k % HUES.length]} fillOpacity={0.14} strokeWidth={2} isAnimationActive={false} />
          ))}
          <Tooltip formatter={(v) => fmt(v, 2)} contentStyle={{ fontSize: 11 }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        </RadarChart>
      </ResponsiveContainer>
    </PanelShell>
  );
}

/* ---------------- box plot (custom SVG) ----------------
 * digitized: {
 *   kind: "box",
 *   categories: [{
 *     name,
 *     boxes: [{ label, min, q1, med, q3, max, color? }],   // 1..N boxes side by side
 *     box:   { min, q1, med, q3, max },                     // legacy single box (still ok)
 *     points?: [{ label, value, color? }],                  // outlier dot markers
 *   }],
 *   colors?: { <label>: hex }, unit?
 * }
 * Reproduces the original exactly: a category with two colored boxes (e.g.
 * gas vs power) renders two boxes in that slot; purple "average" dots render
 * as point markers on top. Never flattened to bars. */

function BoxPanel({ panel, height = 220 }) {
  const d = panel.digitized || {};
  // normalize: every category carries a boxes[] list (wrap the legacy single box)
  const cats = (d.categories || []).map((c) => ({
    ...c,
    boxes: c.boxes?.length ? c.boxes : (c.box ? [{ label: c.label || "", ...c.box }] : []),
    points: c.points || [],
  }));
  const [hover, setHover] = useState(null);
  if (!cats.length) return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">No box data.</div></PanelShell>;

  // stable label -> color map, first-appearance order (matches grouped bars)
  const labels = [];
  for (const c of cats) { for (const b of c.boxes) if (b.label && !labels.includes(b.label)) labels.push(b.label);
    for (const p of c.points) if (p.label && !labels.includes(p.label)) labels.push(p.label); }
  const colorOf = (lab, fallbackIdx) => d.colors?.[lab] || HUES[(lab ? labels.indexOf(lab) : fallbackIdx) % HUES.length];

  const W = 340, H = height, padL = 44, padR = 12, padT = 10, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  let lo = Infinity, hi = -Infinity;
  for (const c of cats) {
    for (const b of c.boxes) for (const v of [b.min, b.q1, b.med, b.q3, b.max]) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (const p of c.points) if (Number.isFinite(p.value)) { lo = Math.min(lo, p.value); hi = Math.max(hi, p.value); }
  }
  const span = hi - lo || 1; lo -= span * 0.08; hi += span * 0.08;
  const yPix = (v) => padT + plotH * (1 - (v - lo) / (hi - lo));
  const slot = plotW / cats.length;
  const ticks = 5;

  return (
    <PanelShell panel={panel} footer={
      <>
        <Readout idle="hover a box for its five-number summary" hover={hover && (hover.point
          ? <><strong>{hover.name} · {hover.label}</strong> = {fmt(hover.value)}{d.unit || ""}</>
          : <><strong>{hover.name}{hover.label ? ` · ${hover.label}` : ""}</strong> · min {fmt(hover.min)} · Q1 {fmt(hover.q1)} · med {fmt(hover.med)} · Q3 {fmt(hover.q3)} · max {fmt(hover.max)}</>)} />
        <ChipLegend items={labels.map((l) => ({ label: l, color: colorOf(l) }))} />
      </>}>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 260 }}>
          {Array.from({ length: ticks }, (_, i) => { const v = lo + (hi - lo) * (i / (ticks - 1)); const y = yPix(v); return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e1e0d9" strokeWidth="1" />
              <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmt(v, 1)}</text>
            </g>
          ); })}
          {cats.map((c, i) => {
            const x0 = padL + slot * i;
            const nb = Math.max(1, c.boxes.length);
            const innerW = slot * 0.78, off = slot * 0.11;
            const bw = Math.min(34, innerW / nb - 4);
            return (
              <g key={i}>
                {c.boxes.map((b, bi) => {
                  const cx = x0 + off + (innerW / nb) * (bi + 0.5);
                  const col = colorOf(b.label, bi);
                  const hovered = hover && !hover.point && hover.name === c.name && hover.label === b.label;
                  return (
                    <g key={bi} onMouseEnter={() => setHover({ name: c.name, ...b })} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                      <line x1={cx} y1={yPix(b.max)} x2={cx} y2={yPix(b.q3)} stroke={col} strokeWidth="1.2" />
                      <line x1={cx} y1={yPix(b.q1)} x2={cx} y2={yPix(b.min)} stroke={col} strokeWidth="1.2" />
                      <line x1={cx - bw / 3} y1={yPix(b.max)} x2={cx + bw / 3} y2={yPix(b.max)} stroke={col} strokeWidth="1.2" />
                      <line x1={cx - bw / 3} y1={yPix(b.min)} x2={cx + bw / 3} y2={yPix(b.min)} stroke={col} strokeWidth="1.2" />
                      <rect x={cx - bw / 2} y={yPix(b.q3)} width={bw} height={Math.max(1, yPix(b.q1) - yPix(b.q3))}
                        fill={col} fillOpacity={hovered ? 0.34 : 0.2} stroke={col} strokeWidth="1.4" />
                      <line x1={cx - bw / 2} y1={yPix(b.med)} x2={cx + bw / 2} y2={yPix(b.med)} stroke={col} strokeWidth="2" />
                    </g>
                  );
                })}
                {c.points.map((p, pi) => {
                  const cx = x0 + slot * 0.5;
                  const col = colorOf(p.label, pi);
                  return (
                    <circle key={`p${pi}`} cx={cx} cy={yPix(p.value)} r="3.4" fill={col} stroke="#fff" strokeWidth="0.8"
                      onMouseEnter={() => setHover({ name: c.name, label: p.label, value: p.value, point: true })} onMouseLeave={() => setHover(null)}
                      style={{ cursor: "pointer" }} />
                  );
                })}
                <text x={x0 + slot * 0.5} y={H - 8} textAnchor="middle" fontSize="9" fill="#52514e">{c.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </PanelShell>
  );
}

/* ---------------- heat map (custom SVG) ----------------
 * `palette`: array of hex stops, low → high (defaults to a single-hue blue
 * ramp). Reproductions pass the ORIGINAL figure's stops (e.g. red→yellow→green)
 * so the interactive panel reads like the paper's own color bar. NaN cells
 * render as empty (no data). */

const hex2rgbArr = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function makeRamp(stops) {
  const cols = (stops && stops.length >= 2 ? stops : ["#deebfa", "#0d366b"]).map(hex2rgbArr);
  return (u) => {
    const t = Math.max(0, Math.min(1, u)) * (cols.length - 1);
    const i = Math.min(cols.length - 2, Math.floor(t));
    const k = t - i;
    return `rgb(${cols[i].map((c, j) => Math.round(c + (cols[i + 1][j] - c) * k)).join(",")})`;
  };
}

function HeatmapPanel({ panel, height = 240 }) {
  const d = panel.digitized || {};
  const grid = d.grid || [];
  const [hover, setHover] = useState(null);
  if (!grid.length) return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">No heat-map data.</div></PanelShell>;

  const nR = grid.length, nC = grid[0].length;
  const lo = d.min, hi = d.max, span = (hi - lo) || 1;
  const rows = d.rows || d.rowLabels || grid.map((_, i) => `${i + 1}`);
  const cols = d.cols || d.colLabels || grid[0].map((_, i) => `${i + 1}`);
  const ramp = makeRamp(d.palette);
  const cellColor = (v) => (Number.isFinite(v) ? ramp((v - lo) / span) : "#f4f4f2");
  const labW = 46, labT = 18, W = 320, cellH = Math.max(14, Math.min(34, (height - labT) / nR));
  const gridW = W - labW, cellW = gridW / nC, svgH = labT + nR * cellH;

  return (
    <PanelShell panel={panel} footer={
      <Readout idle="hover a cell for its value" hover={hover &&
        <><strong>{hover.row} · {hover.col}</strong> = {Number.isFinite(hover.v) ? fmt(hover.v, 3) : "no data"}</>} />}>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${svgH}`} style={{ minWidth: 260 }}>
          {cols.map((c, ci) => (
            <text key={ci} x={labW + cellW * (ci + 0.5)} y={12} textAnchor="middle" fontSize="8.5" fill="#64748b">{c}</text>
          ))}
          {grid.map((row, ri) => (
            <g key={ri}>
              <text x={labW - 4} y={labT + cellH * (ri + 0.5) + 3} textAnchor="end" fontSize="8.5" fill="#64748b">{rows[ri]}</text>
              {row.map((v, ci) => (
                <rect key={ci} x={labW + cellW * ci} y={labT + cellH * ri} width={cellW - 1} height={cellH - 1}
                  fill={cellColor(v)} onMouseEnter={() => setHover({ row: rows[ri], col: cols[ci], v })} onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }} />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </PanelShell>
  );
}

/* ---------------- violin (custom SVG, mirrored area) ----------------
 * digitized: {
 *   kind: "violin",
 *   categories: [{
 *     name,
 *     violins: [{ label, dist: [{ y, w }], color? }],  // 1..N overlapping violins
 *     dist:    [{ y, w }],                              // legacy single violin (still ok)
 *   }],
 *   colors?: { <label>: hex }, unit?
 * }
 * Two overlapping violins per category (e.g. summer vs winter) render as two
 * translucent mirrored areas sharing the slot's centre — matching figures that
 * overlay distributions. Never flattened to bars. */

function ViolinPanel({ panel, height = 240 }) {
  const d = panel.digitized || {};
  const cats = (d.categories || []).map((c) => ({
    ...c,
    violins: c.violins?.length ? c.violins : (c.dist ? [{ label: c.label || "", dist: c.dist }] : []),
  }));
  const [hover, setHover] = useState(null);
  if (!cats.length) return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">No violin data.</div></PanelShell>;

  const labels = [];
  for (const c of cats) for (const v of c.violins) if (v.label && !labels.includes(v.label)) labels.push(v.label);
  const colorOf = (lab, fallbackIdx) => d.colors?.[lab] || HUES[(lab ? labels.indexOf(lab) : fallbackIdx) % HUES.length];

  const W = 340, H = height, padL = 44, padR = 12, padT = 10, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  let lo = Infinity, hi = -Infinity;
  for (const c of cats) for (const v of c.violins) for (const p of v.dist) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
  const span = hi - lo || 1; lo -= span * 0.05; hi += span * 0.05;
  const yPix = (v) => padT + plotH * (1 - (v - lo) / (hi - lo));
  const slot = plotW / cats.length;
  const halfMax = Math.min(44, slot * 0.4);
  const ticks = 5;

  return (
    <PanelShell panel={panel} footer={
      <>
        <Readout idle="hover a violin — overlaid distributions traced off the figure" hover={hover &&
          <><strong>{hover.name} · {hover.label}</strong> · density outline traced off the figure</>} />
        <ChipLegend items={labels.map((l) => ({ label: l, color: colorOf(l) }))} />
      </>}>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 260 }}>
          {Array.from({ length: ticks }, (_, i) => { const v = lo + (hi - lo) * (i / (ticks - 1)); const y = yPix(v); return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e1e0d9" strokeWidth="1" />
              <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmt(v, 1)}</text>
            </g>
          ); })}
          {cats.map((c, i) => {
            const cx = padL + slot * (i + 0.5);
            return (
              <g key={i}>
                {c.violins.map((v, vi) => {
                  const col = colorOf(v.label, vi);
                  const right = v.dist.map((p) => `${(cx + p.w * halfMax).toFixed(1)},${yPix(p.y).toFixed(1)}`);
                  const left = [...v.dist].reverse().map((p) => `${(cx - p.w * halfMax).toFixed(1)},${yPix(p.y).toFixed(1)}`);
                  const path = `M ${right.join(" L ")} L ${left.join(" L ")} Z`;
                  const hovered = hover && hover.name === c.name && hover.label === v.label;
                  return (
                    <g key={vi} onMouseEnter={() => setHover({ name: c.name, label: v.label })} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                      <path d={path} fill={col} fillOpacity={hovered ? 0.4 : 0.24} stroke={col} strokeWidth="1.4" strokeLinejoin="round" />
                    </g>
                  );
                })}
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="9" fill="#52514e">{c.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </PanelShell>
  );
}

/* ---------------- grouped bars (custom SVG) ----------------
 * digitized: {
 *   kind: "groupedBar",
 *   groups: [{ name, bars: [{ label, value, err?, color? }] }],
 *   refLines?: [{ label, value, color? }],   // dashed baselines (e.g. top-down)
 *   colors?: { <barLabel>: hex },            // fixed per-label colors
 *   yMax?, unit?
 * }
 * Matches the classic "clusters along x, one bar per series" figure exactly:
 * per-label colors are stable across groups, error whiskers optional, dashed
 * reference lines with right-edge labels. */

function GroupedBarPanel({ panel, height = 220 }) {
  const d = panel.digitized || {};
  const groups = d.groups || [];
  const [hover, setHover] = useState(null);
  if (!groups.length) return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">No bar data.</div></PanelShell>;

  // stable label → color map, in first-appearance order (never re-cycled)
  const labels = [];
  for (const g of groups) for (const b of g.bars) if (!labels.includes(b.label)) labels.push(b.label);
  const colorOf = (lab) => d.colors?.[lab] || HUES[labels.indexOf(lab) % HUES.length];

  let hi = d.yMax ?? -Infinity;
  if (!Number.isFinite(hi)) {
    for (const g of groups) for (const b of g.bars) hi = Math.max(hi, b.value + (b.err || 0));
    for (const r of d.refLines || []) hi = Math.max(hi, r.value);
    hi *= 1.08;
  }
  const W = 340, H = height, padL = 44, padR = d.refLines?.length ? 8 : 8, padT = 10, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const yPix = (v) => padT + plotH * (1 - v / hi);
  const slot = plotW / groups.length;
  const ticks = 5;

  return (
    <PanelShell panel={panel} footer={
      <>
        <Readout idle="hover a bar for its exact value" hover={hover &&
          <><strong>{hover.g} · {hover.b.label}</strong> = {fmt(hover.b.value, 2)}{d.unit || ""}{Number.isFinite(hover.b.err) ? <> ± {fmt(hover.b.err, 2)}</> : null}</>} />
        <ChipLegend items={labels.map((l) => ({ label: l, color: colorOf(l) }))} />
      </>}>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 280 }}>
          {Array.from({ length: ticks }, (_, i) => { const v = hi * (i / (ticks - 1)); const y = yPix(v); return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e1e0d9" strokeWidth="1" />
              <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmt(v, hi >= 100 ? 0 : 1)}</text>
            </g>
          ); })}
          {(d.refLines || []).map((r, i) => (
            <g key={`r${i}`}>
              <line x1={padL} y1={yPix(r.value)} x2={W - padR} y2={yPix(r.value)}
                stroke={r.color || "#52514e"} strokeWidth="1.3" strokeDasharray="6 4" />
              <text x={W - padR - 2} y={yPix(r.value) - 3} textAnchor="end" fontSize="8.5" fill={r.color || "#52514e"} fontWeight="600">
                {r.label}: {fmt(r.value, r.value >= 100 ? 0 : 2)}
              </text>
            </g>
          ))}
          {groups.map((g, gi) => {
            const gx = padL + slot * gi;
            const innerW = slot * 0.82, off = slot * 0.09;
            const bw = Math.max(4, innerW / g.bars.length - 2); // 2px surface gap
            return (
              <g key={gi}>
                {g.bars.map((b, bi) => {
                  const x = gx + off + (innerW / g.bars.length) * bi + 1;
                  const y = yPix(Math.max(0, b.value));
                  const col = colorOf(b.label);
                  const hovered = hover && hover.g === g.name && hover.b === b;
                  return (
                    <g key={bi} onMouseEnter={() => setHover({ g: g.name, b })} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                      <rect x={x} y={y} width={bw} height={Math.max(1, H - padB - y)} rx="2"
                        fill={col} opacity={hovered ? 1 : 0.88} />
                      {Number.isFinite(b.err) && b.err > 0 && (
                        <g stroke="#52514e" strokeWidth="1">
                          <line x1={x + bw / 2} y1={yPix(b.value - b.err)} x2={x + bw / 2} y2={yPix(b.value + b.err)} />
                          <line x1={x + bw / 2 - 2.5} y1={yPix(b.value + b.err)} x2={x + bw / 2 + 2.5} y2={yPix(b.value + b.err)} />
                          <line x1={x + bw / 2 - 2.5} y1={yPix(b.value - b.err)} x2={x + bw / 2 + 2.5} y2={yPix(b.value - b.err)} />
                        </g>
                      )}
                    </g>
                  );
                })}
                <text x={gx + slot / 2} y={H - 8} textAnchor="middle" fontSize="8.5" fill="#52514e">{g.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </PanelShell>
  );
}

/* ---------------- horizontal stacked bars (custom SVG) ----------------
 * digitized: {
 *   kind: "stackedBarH",
 *   rows: [{ name, segments: [{ label, value }] }],
 *   colors?: { <segLabel>: hex }, unit?
 * }
 * For figures like "sales per holiday, stacked by category" — kept HORIZONTAL
 * and STACKED exactly like the original, with 2px surface gaps between
 * segments and a per-segment hover readout. */

function StackedBarHPanel({ panel, height = 240 }) {
  const d = panel.digitized || {};
  const rows = d.rows || [];
  const [hover, setHover] = useState(null);
  if (!rows.length) return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">No bar data.</div></PanelShell>;

  const labels = [];
  for (const r of rows) for (const s of r.segments) if (!labels.includes(s.label)) labels.push(s.label);
  const colorOf = (lab) => d.colors?.[lab] || HUES[labels.indexOf(lab) % HUES.length];

  const totals = rows.map((r) => r.segments.reduce((a, s) => a + s.value, 0));
  const hi = Math.max(...totals) * 1.05;
  const W = 340, labW = 78, padR = 10, padT = 6, padB = 20;
  const rowH = Math.max(16, Math.min(30, (height - padT - padB) / rows.length));
  const H = padT + rows.length * rowH + padB;
  const plotW = W - labW - padR;
  const xPix = (v) => labW + plotW * (v / hi);

  return (
    <PanelShell panel={panel} footer={
      <>
        <Readout idle="hover a segment for its exact value" hover={hover &&
          <><strong>{hover.r} · {hover.s.label}</strong> = {fmt(hover.s.value, 0)}{d.unit || ""} of {fmt(hover.total, 0)} total</>} />
        <ChipLegend items={labels.map((l) => ({ label: l, color: colorOf(l) }))} />
      </>}>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 280 }}>
          {Array.from({ length: 5 }, (_, i) => { const v = hi * (i / 4); const x = xPix(v); return (
            <g key={i}>
              <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="#e1e0d9" strokeWidth="1" />
              <text x={x} y={H - 8} textAnchor="middle" fontSize="8.5" fill="#94a3b8">{fmt(v, 0)}</text>
            </g>
          ); })}
          {rows.map((r, ri) => {
            const y = padT + rowH * ri + 2;
            const bh = rowH - 5;
            let acc = 0;
            return (
              <g key={ri}>
                <text x={labW - 5} y={y + bh / 2 + 3} textAnchor="end" fontSize="8.5" fill="#52514e">{r.name}</text>
                {r.segments.map((s, si) => {
                  const x0 = xPix(acc); acc += s.value;
                  const x1 = xPix(acc);
                  const hovered = hover && hover.r === r.name && hover.s === s;
                  return (
                    <rect key={si} x={x0 + (si ? 1 : 0)} y={y} width={Math.max(1, x1 - x0 - (si ? 1 : 0) - 1)} height={bh} rx="1.5"
                      fill={colorOf(s.label)} opacity={hovered ? 1 : 0.88}
                      onMouseEnter={() => setHover({ r: r.name, s, total: totals[ri] })} onMouseLeave={() => setHover(null)}
                      style={{ cursor: "pointer" }} />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </PanelShell>
  );
}

/* ---------------- vertical stacked bars (custom SVG) ----------------
 * digitized: {
 *   kind: "stackedBar",
 *   subPanels?: [{ name, groups: [{ name, segments: [{ label, value }] }], refLines? }],
 *   groups?:    [{ name, segments: [{ label, value }] }],   // single panel form
 *   refLines?:  [{ label, value, color? }],                 // e.g. "2021 Capacity: 30 GW"
 *   colors?: { <segLabel>: hex }, unit?, yMax?
 * }
 * The vertical counterpart to stackedBarH — for capacity/generation/cost stacks
 * where each x category is a scenario and colour segments stack UP. Optional
 * subPanels render side by side (e.g. an 80% and a 95% variant) sharing one y
 * axis and one legend, exactly like the paper's paired panels. */

function StackedBarPanel({ panel, height = 260 }) {
  const d = panel.digitized || {};
  const subPanels = d.subPanels?.length ? d.subPanels : [{ name: "", groups: d.groups || [], refLines: d.refLines }];
  const [hover, setHover] = useState(null);
  if (!subPanels.some((s) => s.groups?.length)) return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">No stacked-bar data.</div></PanelShell>;

  // stable segment label -> color, first-appearance order across ALL subpanels
  const labels = [];
  for (const s of subPanels) for (const g of s.groups || []) for (const seg of g.segments) if (!labels.includes(seg.label)) labels.push(seg.label);
  const colorOf = (lab) => d.colors?.[lab] || HUES[labels.indexOf(lab) % HUES.length];

  // one shared y scale so paired subpanels are directly comparable
  let hi = d.yMax ?? -Infinity;
  if (!Number.isFinite(hi)) {
    for (const s of subPanels) {
      for (const g of s.groups || []) hi = Math.max(hi, g.segments.reduce((a, seg) => a + Math.max(0, seg.value), 0));
      for (const r of s.refLines || []) hi = Math.max(hi, r.value);
    }
    hi *= 1.08;
  }
  const ticks = 5;
  const H = height, padL = 40, padT = 10, padB = 30, gapBetween = 16;
  const plotH = H - padT - padB;
  const yPix = (v) => padT + plotH * (1 - v / hi);
  // width per subpanel scales with its group count so bars stay a sane width
  const subW = subPanels.map((s) => 30 + (s.groups?.length || 1) * 34);
  const W = padL + subW.reduce((a, w) => a + w, 0) + gapBetween * (subPanels.length - 1) + 10;

  return (
    <PanelShell panel={panel} footer={
      <>
        <Readout idle="hover a segment for its exact value" hover={hover &&
          <><strong>{hover.sub ? `${hover.sub} · ` : ""}{hover.g} · {hover.label}</strong> = {fmt(hover.value, hi >= 100 ? 0 : 1)}{d.unit || ""} of {fmt(hover.total, hi >= 100 ? 0 : 1)} total</>} />
        <ChipLegend items={labels.map((l) => ({ label: l, color: colorOf(l) }))} />
      </>}>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(560, W) }}>
          {Array.from({ length: ticks }, (_, i) => { const v = hi * (i / (ticks - 1)); const y = yPix(v); return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - 6} y2={y} stroke="#eceae4" strokeWidth="1" />
              <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmt(v, hi >= 100 ? 0 : 1)}</text>
            </g>
          ); })}
          {subPanels.map((s, si) => {
            const xBase = padL + subW.slice(0, si).reduce((a, w) => a + w, 0) + gapBetween * si;
            const groups = s.groups || [];
            const slot = subW[si] / Math.max(1, groups.length);
            const bw = Math.min(30, slot * 0.66);
            return (
              <g key={si}>
                {(s.refLines || []).map((r, ri) => (
                  <g key={`r${ri}`}>
                    <line x1={xBase} y1={yPix(r.value)} x2={xBase + subW[si]} y2={yPix(r.value)}
                      stroke={r.color || "#e11d48"} strokeWidth="1.3" strokeDasharray="5 3" />
                    <text x={xBase + 3} y={yPix(r.value) - 3} fontSize="7.5" fill={r.color || "#e11d48"} fontWeight="600">{r.label}</text>
                  </g>
                ))}
                {groups.map((g, gi) => {
                  const cx = xBase + slot * (gi + 0.5);
                  const total = g.segments.reduce((a, seg) => a + Math.max(0, seg.value), 0);
                  let acc = 0;
                  return (
                    <g key={gi}>
                      {g.segments.map((seg, sgi) => {
                        const y0 = yPix(acc); acc += Math.max(0, seg.value);
                        const y1 = yPix(acc);
                        const hovered = hover && hover.g === g.name && hover.label === seg.label && hover.sub === s.name;
                        return (
                          <rect key={sgi} x={cx - bw / 2} y={y1} width={bw} height={Math.max(0.5, y0 - y1)}
                            fill={colorOf(seg.label)} opacity={hovered ? 1 : 0.9} stroke="#fff" strokeWidth="0.4"
                            onMouseEnter={() => setHover({ sub: s.name, g: g.name, label: seg.label, value: seg.value, total })}
                            onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }} />
                        );
                      })}
                      <text x={cx} y={H - 18} textAnchor="middle" fontSize="8.5" fill="#52514e">{g.name}</text>
                    </g>
                  );
                })}
                {s.name && <text x={xBase + subW[si] / 2} y={H - 5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#334155">{s.name}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </PanelShell>
  );
}

/* ---------------- scatter cloud (custom SVG) ----------------
 * digitized: {
 *   kind: "scatter",
 *   series: [{ label, color?, marker? ("dot"|"x"|"diamond"), points: [[x,y],…] }],
 *   xLabel?, yLabel?
 * }
 * For PCA / t-SNE embeddings and other point clouds. Marker shape doubles the
 * color so clusters stay tellable under CVD. Hover names the series. */

function ScatterPanel({ panel, height = 240 }) {
  const d = panel.digitized || {};
  const series = (d.series || []).filter((s) => s.points?.length);
  const [hover, setHover] = useState(null);
  if (!series.length) return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">No scatter data.</div></PanelShell>;

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of series) for (const [x, y] of s.points) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const sx = (x1 - x0) || 1, sy = (y1 - y0) || 1;
  x0 -= sx * 0.06; x1 += sx * 0.06; y0 -= sy * 0.06; y1 += sy * 0.06;
  const W = 320, H = height, padL = 36, padR = 8, padT = 8, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const px = (x) => padL + plotW * ((x - x0) / (x1 - x0));
  const py = (y) => padT + plotH * (1 - (y - y0) / (y1 - y0));

  const mark = (m, x, y, col, dim) => {
    const o = dim ? 0.25 : 0.75;
    if (m === "x") return <path d={`M${x - 2.6} ${y - 2.6} L${x + 2.6} ${y + 2.6} M${x - 2.6} ${y + 2.6} L${x + 2.6} ${y - 2.6}`} stroke={col} strokeWidth="1.4" opacity={o} />;
    if (m === "diamond") return <path d={`M${x} ${y - 3.2} L${x + 3.2} ${y} L${x} ${y + 3.2} L${x - 3.2} ${y} Z`} fill={col} opacity={o} />;
    return <circle cx={x} cy={y} r="2.6" fill={col} opacity={o} />;
  };

  return (
    <PanelShell panel={panel} footer={
      <>
        <Readout idle="hover a cluster to isolate it" hover={hover &&
          <><strong>{hover.label}</strong> · {hover.n} points</>} />
        <ChipLegend items={series.map((s, i) => ({ label: s.label, color: s.color || HUES[i % HUES.length] }))} />
      </>}>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 260 }}>
          {[0.25, 0.5, 0.75].map((t, i) => (
            <g key={i} stroke="#eceae4" strokeWidth="1">
              <line x1={padL + plotW * t} y1={padT} x2={padL + plotW * t} y2={H - padB} />
              <line x1={padL} y1={padT + plotH * t} x2={W - padR} y2={padT + plotH * t} />
            </g>
          ))}
          <text x={padL + plotW / 2} y={H - 6} textAnchor="middle" fontSize="8.5" fill="#94a3b8">{d.xLabel || panel.xLabel || ""}</text>
          {series.map((s, si) => {
            const col = s.color || HUES[si % HUES.length];
            const dim = hover && hover.label !== s.label;
            return (
              <g key={si} onMouseEnter={() => setHover({ label: s.label, n: s.points.length })} onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}>
                {s.points.map(([x, y], i) => <g key={i}>{mark(s.marker, px(x), py(y), col, dim)}</g>)}
              </g>
            );
          })}
        </svg>
      </div>
    </PanelShell>
  );
}

/* ---------------- radial / polar grouped bars (custom SVG) ----------------
 * digitized: {
 *   kind: "radialBar",
 *   groups: [{ name, bars: [{ label, value, err?, hatch? }] }],
 *   max, unit?, colors?: { <groupName>: hex }
 * }
 * For circular "sector" figures (bars radiating from a ring). Each GROUP gets
 * one hue (matching how the original colors by gait/family); bars within a
 * group are its members. `hatch` renders the low-speed variant like the
 * original's hatched bars. */

/* Multi-sector wheel (e.g. Science Robotics Fig 4: one circle, three metric
 * sectors, gaits as groups inside each sector, per-sector normalization).
 * digitized: { kind: "radialBar", sectors: [{ name, max, unit?, groups }], colors? } */
function SectoredRadialPanel({ panel, height = 340 }) {
  const d = panel.digitized || {};
  const sectors = d.sectors || [];
  const [hover, setHover] = useState(null);
  if (!sectors.length) return null;

  const W = 420, H = Math.max(height, 360);
  const cx = W / 2, cy = H / 2 + 2;
  const r0 = 42, r1 = Math.min(W, H) / 2 - 34;
  const sectorGap = 0.16, groupGap = 0.045;
  const secA = (2 * Math.PI - sectorGap * sectors.length) / sectors.length;

  const groupHue = (name, gi) => d.colors?.[name] || HUES[gi % HUES.length];
  const arcPath = (aa0, aa1, rr0, rr1) => {
    const large = aa1 - aa0 > Math.PI ? 1 : 0;
    const p = (ang, r) => `${(cx + r * Math.cos(ang)).toFixed(1)} ${(cy + r * Math.sin(ang)).toFixed(1)}`;
    return `M ${p(aa0, rr0)} L ${p(aa0, rr1)} A ${rr1} ${rr1} 0 ${large} 1 ${p(aa1, rr1)} L ${p(aa1, rr0)} A ${rr0} ${rr0} 0 ${large} 0 ${p(aa0, rr0)} Z`;
  };
  const arcOnly = (aa0, aa1, r) => {
    const large = aa1 - aa0 > Math.PI ? 1 : 0;
    const p = (ang, rr) => `${(cx + rr * Math.cos(ang)).toFixed(1)} ${(cy + rr * Math.sin(ang)).toFixed(1)}`;
    return `M ${p(aa0, r)} A ${r} ${r} 0 ${large} 1 ${p(aa1, r)}`;
  };

  const wedges = [], groupArcs = [], sectorMeta = [];
  let a = -Math.PI / 2;
  for (const sec of sectors) {
    const a0 = a;
    const nBars = sec.groups.reduce((acc, g) => acc + g.bars.length, 0);
    const usable = secA - groupGap * (sec.groups.length - 1);
    const barA = usable / nBars;
    let ag = a0;
    sec.groups.forEach((g, gi) => {
      const col = groupHue(g.name, gi);
      const gStart = ag;
      let sum = 0;
      for (const b of g.bars) {
        const frac = Math.max(0, Math.min(1, b.value / sec.max));
        wedges.push({ sec: sec.name, unit: sec.unit || "", g: g.name, b, col,
          hatch: !!b.hatch, a0: ag + barA * 0.14, a1: ag + barA * 0.86, r: r0 + (r1 - r0) * frac });
        sum += b.value;
        ag += barA;
      }
      // the original's per-gait "average line" arc
      const avg = sum / g.bars.length;
      const rAvg = r0 + (r1 - r0) * Math.max(0, Math.min(1, avg / sec.max));
      groupArcs.push({ path: arcOnly(gStart + 0.01, ag - 0.01, rAvg), col,
        labA: (gStart + ag) / 2, name: g.name });
      ag += groupGap;
    });
    sectorMeta.push({ name: sec.name, a0, a1: a0 + secA, max: sec.max, unit: sec.unit || "" });
    a = a0 + secA + sectorGap;
  }

  return (
    <PanelShell panel={panel} footer={
      <>
        <Readout idle="hover a bar — hatched = low speed, solid = high speed; the thin arc is each gait's average" hover={hover &&
          <><strong>{hover.sec} · {hover.g} · {hover.b.label}</strong> = {fmt(hover.b.value, 2)}{hover.unit}{Number.isFinite(hover.b.err) ? <> ± {fmt(hover.b.err, 2)}</> : null}</>} />
        <ChipLegend items={(sectors[0]?.groups || []).map((g, gi) => ({ label: g.name, color: groupHue(g.name, gi) }))} />
      </>}>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 320 }}>
          <defs>
            {(sectors[0]?.groups || []).map((g, gi) => {
              const col = groupHue(g.name, gi);
              return (
                <pattern key={gi} id={`srh${gi}`} width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <rect width="4" height="4" fill="white" />
                  <rect width="2.2" height="4" fill={col} />
                </pattern>
              );
            })}
          </defs>
          {[0.25, 0.5, 0.75, 1].map((t, i) => (
            <circle key={i} cx={cx} cy={cy} r={r0 + (r1 - r0) * t} fill="none" stroke="#eceae4" strokeWidth="1" />
          ))}
          <circle cx={cx} cy={cy} r={r0} fill="none" stroke="#d5d3cb" strokeWidth="1" />
          {sectorMeta.map((s, i) => {
            const mid = (s.a0 + s.a1) / 2;
            const lx = cx + (r1 + 22) * Math.cos(mid), ly = cy + (r1 + 22) * Math.sin(mid);
            return (
              <g key={i}>
                <path d={arcOnly(s.a0, s.a1, r1 + 10)} fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
                <text x={lx} y={ly + 3} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#334155">{s.name}</text>
                <text x={lx} y={ly + 13} textAnchor="middle" fontSize="7.5" fill="#94a3b8">0 – {fmt(s.max, s.max >= 10 ? 0 : 2)}{s.unit}</text>
              </g>
            );
          })}
          {wedges.map((wd, i) => {
            const gi = (sectors[0]?.groups || []).findIndex((g) => g.name === wd.g);
            const hovered = hover && hover.b === wd.b && hover.sec === wd.sec;
            return (
              <path key={i} d={arcPath(wd.a0, wd.a1, r0, wd.r)}
                fill={wd.hatch ? `url(#srh${gi})` : wd.col}
                stroke={wd.col} strokeWidth="0.7" opacity={hovered ? 1 : 0.9}
                onMouseEnter={() => setHover(wd)} onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }} />
            );
          })}
          {groupArcs.map((ga, i) => (
            <g key={i}>
              <path d={ga.path} fill="none" stroke={ga.col} strokeWidth="1.8" opacity="0.85" />
              <text x={cx + (r0 - 9) * Math.cos(ga.labA)} y={cy + (r0 - 9) * Math.sin(ga.labA) + 2.5}
                textAnchor="middle" fontSize="6.5" fontWeight="600" fill={ga.col}>{ga.name.slice(0, 2)}</text>
            </g>
          ))}
        </svg>
      </div>
    </PanelShell>
  );
}

function RadialBarPanel({ panel, height = 260 }) {
  const d = panel.digitized || {};
  const groups = d.groups || [];
  const [hover, setHover] = useState(null);
  if (d.sectors?.length) return <SectoredRadialPanel panel={panel} height={height} />;
  if (!groups.length) return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">No radial data.</div></PanelShell>;

  const W = 320, H = height;
  const cx = W / 2, cy = H / 2 + 4;
  const r0 = 34, r1 = Math.min(W, H) / 2 - 26;
  const max = d.max || Math.max(...groups.flatMap((g) => g.bars.map((b) => b.value))) * 1.05;
  const nBars = groups.reduce((a, g) => a + g.bars.length, 0);
  const gapA = 0.10; // radians between groups
  const totalA = 2 * Math.PI - gapA * groups.length;
  const barA = totalA / nBars;
  const rOf = (v) => r0 + (r1 - r0) * Math.max(0, Math.min(1, v / max));

  let a = -Math.PI / 2; // start at 12 o'clock
  const wedges = [];
  groups.forEach((g, gi) => {
    const col = d.colors?.[g.name] || HUES[gi % HUES.length];
    const groupStart = a;
    g.bars.forEach((b) => {
      wedges.push({ g: g.name, b, col, a0: a + barA * 0.12, a1: a + barA * 0.88 });
      a += barA;
    });
    wedges.push({ groupLabel: g.name, mid: (groupStart + a) / 2, col });
    a += gapA;
  });

  const arcPath = (aa0, aa1, rr0, rr1) => {
    const large = aa1 - aa0 > Math.PI ? 1 : 0;
    const p = (ang, r) => `${cx + r * Math.cos(ang)} ${cy + r * Math.sin(ang)}`;
    return `M ${p(aa0, rr0)} L ${p(aa0, rr1)} A ${rr1} ${rr1} 0 ${large} 1 ${p(aa1, rr1)} L ${p(aa1, rr0)} A ${rr0} ${rr0} 0 ${large} 0 ${p(aa0, rr0)} Z`;
  };

  return (
    <PanelShell panel={panel} footer={
      <>
        <Readout idle="hover a bar — hatched = low speed, solid = high speed" hover={hover &&
          <><strong>{hover.g} · {hover.b.label}</strong> = {fmt(hover.b.value, 2)}{d.unit || ""}{Number.isFinite(hover.b.err) ? <> ± {fmt(hover.b.err, 2)}</> : null}</>} />
        <ChipLegend items={groups.map((g, i) => ({ label: g.name, color: d.colors?.[g.name] || HUES[i % HUES.length] }))} />
      </>}>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 260 }}>
          <defs>
            {groups.map((g, gi) => {
              const col = d.colors?.[g.name] || HUES[gi % HUES.length];
              return (
                <pattern key={gi} id={`rbh${gi}`} width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <rect width="4" height="4" fill="white" />
                  <rect width="2.2" height="4" fill={col} />
                </pattern>
              );
            })}
          </defs>
          {[0.25, 0.5, 0.75, 1].map((t, i) => (
            <circle key={i} cx={cx} cy={cy} r={r0 + (r1 - r0) * t} fill="none" stroke="#eceae4" strokeWidth="1" />
          ))}
          <circle cx={cx} cy={cy} r={r0} fill="none" stroke="#d5d3cb" strokeWidth="1" />
          <text x={cx} y={cy + 3} textAnchor="middle" fontSize="8.5" fill="#94a3b8">{d.unit ? `0–${fmt(max, 0)}${d.unit}` : `0–${fmt(max, 1)}`}</text>
          {wedges.map((w, i) => {
            if (w.groupLabel) {
              const lr = r1 + 12;
              const lx = cx + lr * Math.cos(w.mid), ly = cy + lr * Math.sin(w.mid);
              return <text key={i} x={lx} y={ly + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill={w.col}>{w.groupLabel}</text>;
            }
            const gi = groups.findIndex((g) => g.name === w.g);
            const hovered = hover && hover.g === w.g && hover.b === w.b;
            return (
              <path key={i} d={arcPath(w.a0, w.a1, r0, rOf(w.b.value))}
                fill={w.b.hatch ? `url(#rbh${gi})` : w.col}
                stroke={w.col} strokeWidth="0.8" opacity={hovered ? 1 : 0.9}
                onMouseEnter={() => setHover({ g: w.g, b: w.b })} onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }} />
            );
          })}
        </svg>
      </div>
    </PanelShell>
  );
}

/* ---------------- Kaplan–Meier survival (custom SVG) ----------------
 * digitized: {
 *   kind: "kaplanMeier",
 *   km: {
 *     yAsPercent?, pValue?, timeUnit?,
 *     groups: [{ label, color?, steps: [[t, S], …], censors?: [t], ci?: [[t,lo,hi]], median? }],
 *     risk?: { times: [t], rows: [{ label, counts: [n] }] },
 *   }
 * }
 * Draws each arm as a step-DOWN staircase (survival never rises), places the
 * censor ticks on the curve, shades any CI band, and prints the numbers-at-risk
 * table beneath — the four things a clinician reads on a survival plot. Never a
 * smooth line. */

function KaplanMeierPanel({ panel, height = 250 }) {
  const km = panel.digitized?.km || {};
  const groups = (km.groups || []).filter((g) => Array.isArray(g.steps) && g.steps.length >= 2);
  const [hover, setHover] = useState(null);
  if (!groups.length) return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">No survival data.</div></PanelShell>;

  const pct = !!km.yAsPercent;
  const yTop = pct ? 100 : 1;
  const unit = km.timeUnit ? ` ${km.timeUnit}` : "";
  const labels = groups.map((g) => g.label || "");
  const colorOf = (g, i) => g.color || HUES[i % HUES.length];

  // x range from steps + censors + risk times
  let xMax = 0;
  for (const g of groups) {
    for (const [t] of g.steps) if (Number.isFinite(t)) xMax = Math.max(xMax, t);
    for (const t of g.censors || []) if (Number.isFinite(t)) xMax = Math.max(xMax, t);
  }
  for (const t of km.risk?.times || []) if (Number.isFinite(t)) xMax = Math.max(xMax, t);
  xMax = xMax || 1;

  const riskRows = km.risk?.rows?.length ? km.risk.rows : null;
  const riskTimes = km.risk?.times || [];
  const riskH = riskRows ? 16 + riskRows.length * 14 : 0;

  const W = 360, H = height + riskH, padL = 44, padR = 12, padT = 10;
  const padB = 30 + riskH;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xPix = (t) => padL + plotW * (Math.max(0, Math.min(xMax, t)) / xMax);
  const yPix = (s) => padT + plotH * (1 - Math.max(0, Math.min(yTop, s)) / yTop);
  const yTicks = pct ? [0, 25, 50, 75, 100] : [0, 0.25, 0.5, 0.75, 1];

  // step-after staircase: hold previous survival across the interval, then drop
  const stepPath = (steps) => {
    const p = [...steps].sort((a, b) => a[0] - b[0]);
    let d = `M ${xPix(p[0][0]).toFixed(1)} ${yPix(p[0][1]).toFixed(1)}`;
    for (let i = 1; i < p.length; i++) {
      d += ` L ${xPix(p[i][0]).toFixed(1)} ${yPix(p[i - 1][1]).toFixed(1)}`;
      d += ` L ${xPix(p[i][0]).toFixed(1)} ${yPix(p[i][1]).toFixed(1)}`;
    }
    return d;
  };
  // CI as a step-after ribbon between lower and upper
  const ribbonPath = (ci) => {
    const c = [...ci].filter((r) => r.length >= 3).sort((a, b) => a[0] - b[0]);
    if (c.length < 2) return "";
    let d = `M ${xPix(c[0][0]).toFixed(1)} ${yPix(c[0][2]).toFixed(1)}`;
    for (let i = 1; i < c.length; i++) d += ` L ${xPix(c[i][0]).toFixed(1)} ${yPix(c[i - 1][2]).toFixed(1)} L ${xPix(c[i][0]).toFixed(1)} ${yPix(c[i][2]).toFixed(1)}`;
    for (let i = c.length - 1; i > 0; i--) d += ` L ${xPix(c[i][0]).toFixed(1)} ${yPix(c[i][1]).toFixed(1)} L ${xPix(c[i - 1][0]).toFixed(1)} ${yPix(c[i][1]).toFixed(1)}`;
    d += ` L ${xPix(c[0][0]).toFixed(1)} ${yPix(c[0][1]).toFixed(1)} Z`;
    return d;
  };
  const survAt = (steps, tc) => {
    let s = steps[0][1];
    for (const [t, v] of [...steps].sort((a, b) => a[0] - b[0])) { if (t <= tc) s = v; else break; }
    return s;
  };

  return (
    <PanelShell panel={panel} footer={
      <>
        <Readout idle={km.pValue ? km.pValue : "hover a curve — a survival staircase, traced off the figure"} hover={hover &&
          <><strong>{hover.label || "survival"}</strong>{Number.isFinite(hover.median) ? <> · median {fmt(hover.median, 1)}{unit}</> : null}{km.pValue ? ` · ${km.pValue}` : ""}</>} />
        <ChipLegend items={groups.map((g, i) => ({ label: g.label || `arm ${i + 1}`, color: colorOf(g, i) }))} />
      </>}>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 300 }}>
          {yTicks.map((v, i) => { const y = yPix(v); return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={v === (pct ? 50 : 0.5) ? "#cbd5e1" : "#e1e0d9"} strokeWidth="1" strokeDasharray={v === (pct ? 50 : 0.5) ? "3 3" : ""} />
              <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{pct ? v : v.toFixed(2)}</text>
            </g>
          ); })}
          {/* x ticks */}
          {Array.from({ length: 5 }, (_, i) => { const t = (xMax * i) / 4; const x = xPix(t); return (
            <g key={`x${i}`}>
              <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="#f1f0ec" strokeWidth="1" />
              <text x={x} y={padT + plotH + 12} textAnchor="middle" fontSize="8.5" fill="#94a3b8">{fmt(t, xMax >= 10 ? 0 : 1)}</text>
            </g>
          ); })}
          {/* CI ribbons first (under the curves) */}
          {groups.map((g, i) => g.ci?.length >= 2 ? (
            <path key={`ci${i}`} d={ribbonPath(g.ci)} fill={colorOf(g, i)} fillOpacity="0.12" stroke="none" />
          ) : null)}
          {/* survival staircases */}
          {groups.map((g, i) => {
            const col = colorOf(g, i);
            const dim = hover && hover.label !== (g.label || "");
            return (
              <g key={i} onMouseEnter={() => setHover({ label: g.label || "", median: g.median })} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                <path d={stepPath(g.steps)} fill="none" stroke={col} strokeWidth={dim ? 1.3 : 2.1} opacity={dim ? 0.5 : 1} strokeLinejoin="round" />
                {(g.censors || []).map((tc, ci) => { const sy = yPix(survAt(g.steps, tc)); const cx = xPix(tc); return (
                  <line key={ci} x1={cx} y1={sy - 3.4} x2={cx} y2={sy + 3.4} stroke={col} strokeWidth="1.3" opacity={dim ? 0.5 : 0.95} />
                ); })}
              </g>
            );
          })}
          <text x={padL + plotW / 2} y={padT + plotH + 24} textAnchor="middle" fontSize="8.5" fill="#94a3b8">{panel.xLabel || (km.timeUnit ? `time (${km.timeUnit})` : "time")}</text>
          {/* numbers-at-risk table */}
          {riskRows && (
            <g>
              <text x={padL} y={padT + plotH + 40} fontSize="8" fontWeight="700" fill="#64748b">No. at risk</text>
              {riskRows.map((r, ri) => {
                const gi = labels.indexOf(r.label);
                const col = gi >= 0 ? colorOf(groups[gi], gi) : "#64748b";
                const y = padT + plotH + 52 + ri * 14;
                return (
                  <g key={ri}>
                    <rect x={6} y={y - 7} width="6" height="6" rx="1" fill={col} />
                    {riskTimes.map((t, ti) => (
                      <text key={ti} x={xPix(t)} y={y} textAnchor="middle" fontSize="8" fill="#52514e" style={{ fontVariantNumeric: "tabular-nums" }}>{r.counts?.[ti] ?? ""}</text>
                    ))}
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>
    </PanelShell>
  );
}

/* ---------------- dispatcher ---------------- */

export const SPECIAL_DIGITIZED_KINDS = [
  "radar", "box", "heatmap", "violin", "groupedBar", "stackedBar", "stackedBarH", "scatter", "radialBar", "kaplanMeier",
];

/** Picks the renderer for a non-line digitized kind. Returns null for kinds
 *  that should go through the normal x–y PanelChart path (line/scatter/bar). */
export function DigitizedPanel({ panel, height }) {
  switch (panel.digitized?.kind) {
    case "radar": return <RadarPanel panel={panel} height={height} />;
    case "box": return <BoxPanel panel={panel} height={height} />;
    case "heatmap": return <HeatmapPanel panel={panel} height={height} />;
    case "violin": return <ViolinPanel panel={panel} height={height} />;
    case "groupedBar": return <GroupedBarPanel panel={panel} height={height} />;
    case "stackedBar": return <StackedBarPanel panel={panel} height={height} />;
    case "stackedBarH": return <StackedBarHPanel panel={panel} height={height} />;
    case "scatter": return <ScatterPanel panel={panel} height={height} />;
    case "radialBar": return <RadialBarPanel panel={panel} height={height} />;
    case "kaplanMeier": return <KaplanMeierPanel panel={panel} height={height} />;
    default: return null;
  }
}

/** True when this panel needs one of the special (non x–y) renderers. */
export function isSpecialDigitized(panel) {
  return SPECIAL_DIGITIZED_KINDS.includes(panel?.digitized?.kind);
}
