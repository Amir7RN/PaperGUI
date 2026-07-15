/**
 * Renderers for digitized result panels whose data isn't an x–y curve:
 * radar, box, heatmap, violin. Each takes a panel whose `digitized.kind`
 * selects the renderer and carries the traced real values. These render the
 * paper's OWN numbers (read off the figure with the digitizer) interactively —
 * no live-model overlay, because these chart types have no slider-driven model
 * to chase; the traced data IS the panel.
 */

import React, { useState } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";

const HUES = ["#2a78d6", "#1baf7a", "#eda100", "#e34948", "#4a3aa7", "#e87ba4"];
const fmt = (v, d = 2) => (v === undefined || v === null || Number.isNaN(+v) ? "–" : (+v).toFixed(d));

/** Shared card chrome + "traced from figure" badge. */
function PanelShell({ panel, children, footer }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-2">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          {panel.subplotLabel}
          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700"
            title={panel.digitized?.source || "traced off the real figure"}>
            traced from figure
          </span>
        </span>
        {panel.xLabel && <span className="text-[10px] text-slate-400">{panel.xLabel}{panel.yLabel ? ` · ${panel.yLabel}` : ""}</span>}
      </div>
      {children}
      {footer}
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
            <Radar key={k} name={s.label} dataKey={`s${k}`} stroke={HUES[k % HUES.length]}
              fill={HUES[k % HUES.length]} fillOpacity={0.14} strokeWidth={2} isAnimationActive={false} />
          ))}
          <Tooltip formatter={(v) => fmt(v, 2)} contentStyle={{ fontSize: 11 }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        </RadarChart>
      </ResponsiveContainer>
    </PanelShell>
  );
}

/* ---------------- box plot (custom SVG) ---------------- */

function BoxPanel({ panel, height = 220 }) {
  const d = panel.digitized || {};
  const cats = d.categories || [];
  const [hover, setHover] = useState(null);
  if (!cats.length) return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">No box data.</div></PanelShell>;

  const W = 320, H = height, padL = 44, padR = 12, padT = 10, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  let lo = Infinity, hi = -Infinity;
  for (const c of cats) for (const v of Object.values(c.box)) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const span = hi - lo || 1; lo -= span * 0.08; hi += span * 0.08;
  const yPix = (v) => padT + plotH * (1 - (v - lo) / (hi - lo));
  const bw = Math.min(46, (plotW / cats.length) * 0.55);
  const ticks = 5;

  return (
    <PanelShell panel={panel} footer={
      <div className={`mt-1 rounded-md px-2 py-1 text-[11px] tabular-nums ${hover ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-400"}`}>
        {hover ? <><strong>{hover.name}</strong> · min {fmt(hover.box.min)} · Q1 {fmt(hover.box.q1)} · med {fmt(hover.box.med)} · Q3 {fmt(hover.box.q3)} · max {fmt(hover.box.max)}</>
          : "hover a box for its five-number summary"}
      </div>}>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 260 }}>
          {Array.from({ length: ticks }, (_, i) => { const v = lo + (hi - lo) * (i / (ticks - 1)); const y = yPix(v); return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e1e0d9" strokeWidth="1" />
              <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmt(v, 1)}</text>
            </g>
          ); })}
          {cats.map((c, i) => {
            const cx = padL + plotW * ((i + 0.5) / cats.length);
            const col = HUES[i % HUES.length];
            const b = c.box;
            return (
              <g key={i} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                {/* whiskers */}
                <line x1={cx} y1={yPix(b.max)} x2={cx} y2={yPix(b.q3)} stroke={col} strokeWidth="1.2" />
                <line x1={cx} y1={yPix(b.q1)} x2={cx} y2={yPix(b.min)} stroke={col} strokeWidth="1.2" />
                <line x1={cx - bw / 3} y1={yPix(b.max)} x2={cx + bw / 3} y2={yPix(b.max)} stroke={col} strokeWidth="1.2" />
                <line x1={cx - bw / 3} y1={yPix(b.min)} x2={cx + bw / 3} y2={yPix(b.min)} stroke={col} strokeWidth="1.2" />
                {/* box */}
                <rect x={cx - bw / 2} y={yPix(b.q3)} width={bw} height={Math.max(1, yPix(b.q1) - yPix(b.q3))} fill={col} fillOpacity="0.18" stroke={col} strokeWidth="1.4" />
                <line x1={cx - bw / 2} y1={yPix(b.med)} x2={cx + bw / 2} y2={yPix(b.med)} stroke={col} strokeWidth="2" />
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="9" fill="#52514e">{c.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </PanelShell>
  );
}

/* ---------------- heat map (custom SVG) ---------------- */

function HeatmapPanel({ panel, height = 240 }) {
  const d = panel.digitized || {};
  const grid = d.grid || [];
  const [hover, setHover] = useState(null);
  if (!grid.length) return <PanelShell panel={panel}><div className="p-4 text-[11px] text-slate-400">No heat-map data.</div></PanelShell>;

  const nR = grid.length, nC = grid[0].length;
  const lo = d.min, hi = d.max, span = (hi - lo) || 1;
  const rows = d.rows || grid.map((_, i) => `${i + 1}`);
  const cols = d.cols || grid[0].map((_, i) => `${i + 1}`);
  // sequential blue ramp (light → dark) — same family as the frames demo
  const cellColor = (v) => {
    if (!Number.isFinite(v)) return "#f1f5f9";
    const u = (v - lo) / span;
    const light = [222, 235, 250], dark = [13, 54, 107];
    return `rgb(${light.map((l, i) => Math.round(l + (dark[i] - l) * u)).join(",")})`;
  };
  const labW = 46, labT = 18, W = 320, cellH = Math.max(14, Math.min(34, (height - labT) / nR));
  const gridW = W - labW, cellW = gridW / nC, svgH = labT + nR * cellH;

  return (
    <PanelShell panel={panel} footer={
      <div className={`mt-1 rounded-md px-2 py-1 text-[11px] tabular-nums ${hover ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-400"}`}>
        {hover ? <><strong>{hover.row} · {hover.col}</strong> = {fmt(hover.v, 3)}</> : "hover a cell for its value"}
      </div>}>
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

/* ---------------- dispatcher ---------------- */

/** Picks the renderer for a non-line digitized kind. Returns null for kinds
 *  that should go through the normal x–y PanelChart path (line/scatter/bar). */
export function DigitizedPanel({ panel, height }) {
  switch (panel.digitized?.kind) {
    case "radar": return <RadarPanel panel={panel} height={height} />;
    case "box": return <BoxPanel panel={panel} height={height} />;
    case "heatmap": return <HeatmapPanel panel={panel} height={height} />;
    default: return null;
  }
}

/** True when this panel needs one of the special (non x–y) renderers. */
export function isSpecialDigitized(panel) {
  return ["radar", "box", "heatmap", "violin"].includes(panel?.digitized?.kind);
}
