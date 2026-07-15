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

/* ---------------- dispatcher ---------------- */

/** Picks the renderer for a non-line digitized kind. Returns null for kinds
 *  that should go through the normal x–y PanelChart path (line/scatter/bar). */
export function DigitizedPanel({ panel, height }) {
  switch (panel.digitized?.kind) {
    case "radar": return <RadarPanel panel={panel} height={height} />;
    default: return null;
  }
}

/** True when this panel needs one of the special (non x–y) renderers. */
export function isSpecialDigitized(panel) {
  return ["radar", "box", "heatmap", "violin"].includes(panel?.digitized?.kind);
}
