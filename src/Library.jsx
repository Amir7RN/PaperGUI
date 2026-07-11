/**
 * "My papers" modal — the signed-in user's saved-analysis library.
 *
 * Every paper analyzed while signed in is stored server-side (see supabase.js
 * saveAnalysis / the `analyses` migration). Reopening one from here loads the
 * stored spec for free — no credit is spent re-analyzing a paper you've already
 * paid to analyze.
 */

import React, { useEffect, useState } from "react";
import { Loader2, X, FileText, Trash2, BookMarked } from "lucide-react";
import { listAnalyses, getAnalysis, deleteAnalysis } from "./supabase.js";

export default function Library({ onClose, onOpen }) {
  const [rows, setRows] = useState(null); // null = loading
  const [opening, setOpening] = useState(null); // id being opened
  const [busyDelete, setBusyDelete] = useState(null);

  const load = () => { setRows(null); listAnalyses().then(setRows); };
  useEffect(() => { load(); }, []);

  const open = async (id) => {
    setOpening(id);
    const spec = await getAnalysis(id);
    setOpening(null);
    if (spec) onOpen(spec);
    else load();
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    setBusyDelete(id);
    await deleteAnalysis(id);
    setRows((r) => (r || []).filter((x) => x.id !== id));
    setBusyDelete(null);
  };

  const fmtDate = (s) => {
    try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
    catch { return ""; }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-10 backdrop-blur-sm"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}
      onClick={onClose}
    >
      <div
        className="relative mt-8 w-full max-w-lg rounded-2xl border border-white/40 bg-white/95 p-6 shadow-2xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={16} />
        </button>

        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
            <BookMarked size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">My papers</h2>
            <p className="text-xs text-slate-500">Reopen an analyzed paper — no credit is spent.</p>
          </div>
        </div>

        {rows === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Loading your library…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            No saved papers yet. Analyze a PDF and it will appear here for free
            reopening later.
          </div>
        ) : (
          <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => open(r.id)}
                  disabled={opening === r.id}
                  className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-blue-300 hover:shadow-sm disabled:opacity-60"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    {opening === r.id ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{r.title}</span>
                    {r.authors && (
                      <span className="block truncate text-xs text-slate-500">{r.authors}</span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-slate-400">Analyzed {fmtDate(r.created_at)}</span>
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => remove(r.id, e)}
                    aria-label="Delete"
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500"
                  >
                    {busyDelete === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
