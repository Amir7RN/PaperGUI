/**
 * Layout Editor — a slide-out inspector that edits the workspace "master
 * slide" live (box sizes, font sizes, section titles, chart heights), like
 * arranging a PowerPoint. Changes apply instantly and persist per-browser.
 *
 * "Copy layout config" exports the current layout as JSON; paste it to the
 * maintainer to bake it in as the default for every paper (DEFAULT_LAYOUT).
 */

import React, { useState, useMemo } from "react";
import { X, RotateCcw, ClipboardCopy, Check, Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import { NUMERIC_DEFS, saveLayout, resetLayout } from "./layout.js";

export default function LayoutEditor({ open, layout, onChange, onClose }) {
  const [copied, setCopied] = useState(false);

  const groups = useMemo(() => {
    const g = {};
    for (const d of NUMERIC_DEFS) (g[d.group] ||= []).push(d);
    return g;
  }, []);

  const setNum = (key, value) => {
    const next = { ...layout, numeric: { ...layout.numeric, [key]: value } };
    onChange(next); saveLayout(next);
  };
  const setSection = (i, patch) => {
    const sections = layout.sections.map((s, k) => (k === i ? { ...s, ...patch } : s));
    const next = { ...layout, sections };
    onChange(next); saveLayout(next);
  };

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(layout, null, 2));
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={onClose} />}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[22rem] max-w-[92vw] transform flex-col bg-white shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <SlidersHorizontal size={15} /> Layout editor
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close layout editor">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-[11px] leading-relaxed text-slate-500">
            Adjust every box and font below — changes apply instantly and are saved in this browser.
            When it looks right, <strong>Copy layout config</strong> and send it to make it the default
            for every paper.
          </p>

          {/* sections */}
          <div className="mb-5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Sections (chapters)
            </div>
            <div className="space-y-3">
              {layout.sections.map((s, i) => (
                <div key={s.key} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-600">Section {i + 1}</span>
                    <button
                      onClick={() => setSection(i, { on: !s.on })}
                      className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${s.on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
                    >
                      {s.on ? <Eye size={11} /> : <EyeOff size={11} />}
                      {s.on ? "shown" : "hidden"}
                    </button>
                  </div>
                  <input
                    value={s.title}
                    onChange={(e) => setSection(i, { title: e.target.value })}
                    placeholder="Section title"
                    className="mb-1.5 w-full rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-800 focus:border-blue-400 focus:outline-none"
                  />
                  <textarea
                    value={s.sub}
                    onChange={(e) => setSection(i, { sub: e.target.value })}
                    rows={2}
                    placeholder="Section description"
                    className="w-full resize-y rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* numeric groups */}
          {Object.entries(groups).map(([group, defs]) => (
            <div key={group} className="mb-5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</div>
              <div className="space-y-2.5">
                {defs.map((d) => (
                  <div key={d.key}>
                    <div className="flex items-baseline justify-between text-[11px]">
                      <span className="text-slate-600">{d.label}</span>
                      <span className="flex items-center gap-1">
                        <input
                          type="number"
                          value={layout.numeric[d.key]}
                          min={d.min} max={d.max} step={d.step}
                          onChange={(e) => setNum(d.key, +e.target.value)}
                          className="w-14 rounded border border-slate-200 px-1 py-0.5 text-right text-[11px] tabular-nums text-slate-700 focus:border-blue-400 focus:outline-none"
                        />
                        <span className="w-4 text-[10px] text-slate-400">{d.unit}</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      value={layout.numeric[d.key]}
                      min={d.min} max={d.max} step={d.step}
                      onChange={(e) => setNum(d.key, +e.target.value)}
                      className="mt-0.5 w-full accent-blue-600"
                      aria-label={d.label}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3">
          <button
            onClick={() => onChange(resetLayout())}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw size={13} /> Reset
          </button>
          <button
            onClick={copyConfig}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700"
          >
            {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}
            {copied ? "Copied to clipboard" : "Copy layout config"}
          </button>
        </div>
      </aside>
    </>
  );
}
