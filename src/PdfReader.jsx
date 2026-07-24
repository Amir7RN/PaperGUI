/**
 * Fancy in-app PDF reader — opens the paper's *real* PDF beside the interactive
 * analysis, rendered as a book you can page through.
 *
 * Pages are rasterized with pdf.js (already a dependency) and cached by
 * (pageNo, scale). The center stage shows one page at a time with a 3-D
 * page-turn on next/prev; a thumbnail rail lets you jump anywhere. Zoom, page
 * counter, keyboard arrows, and a download link round it out.
 *
 * Driven entirely by a served URL (`spec.paperPdf`), so any sample — and any
 * future paper that ships its PDF in public/papers — lights this up for free.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, Loader2,
  BookOpen, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { loadPdfDoc, renderPdfPage } from "./pdf.js";

/* Render scale for the main stage (times a zoom multiplier) and the rail. */
const BASE_SCALE = 1.6;
const THUMB_SCALE = 0.28;

export default function PdfReader({ url, title, open, onClose }) {
  const [doc, setDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);          // 1-indexed
  const [zoom, setZoom] = useState(1);
  const [loadErr, setLoadErr] = useState(null);
  const [railOpen, setRailOpen] = useState(true);
  const [flip, setFlip] = useState(null);       // null | { dir, from, to }

  // Rendered-page caches: full pages keyed by `${p}@${scaleBucket}`, thumbs by p.
  const pageCache = useRef(new Map());
  const thumbCache = useRef(new Map());
  const [, force] = useState(0);                // bump to re-read caches
  const rerender = useCallback(() => force((n) => n + 1), []);
  const railRef = useRef(null);

  /* ---- load the document when opened ---- */
  useEffect(() => {
    if (!open || !url) return;
    let alive = true;
    setDoc(null); setLoadErr(null); setNumPages(0); setPage(1); setZoom(1);
    pageCache.current = new Map();
    thumbCache.current = new Map();
    loadPdfDoc(url).then((d) => {
      if (!alive) return;
      setDoc(d); setNumPages(d.numPages);
    }).catch((e) => { if (alive) setLoadErr(e?.message || "Could not open the PDF."); });
    return () => { alive = false; };
  }, [open, url]);

  const scaleBucket = useMemo(() => +(BASE_SCALE * zoom).toFixed(2), [zoom]);

  /* ---- render one full page (cached), then repaint ---- */
  const ensurePage = useCallback((p) => {
    if (!doc || p < 1 || p > numPages) return;
    const key = `${p}@${scaleBucket}`;
    if (pageCache.current.has(key)) return;
    pageCache.current.set(key, { loading: true });
    renderPdfPage(doc, p, scaleBucket)
      .then((r) => { pageCache.current.set(key, r); rerender(); })
      .catch(() => { pageCache.current.delete(key); });
  }, [doc, numPages, scaleBucket, rerender]);

  const ensureThumb = useCallback((p) => {
    if (!doc || p < 1 || p > numPages || thumbCache.current.has(p)) return;
    thumbCache.current.set(p, { loading: true });
    renderPdfPage(doc, p, THUMB_SCALE)
      .then((r) => { thumbCache.current.set(p, r); rerender(); })
      .catch(() => { thumbCache.current.delete(p); });
  }, [doc, numPages, rerender]);

  // Keep current ± neighbours warm on the main stage.
  useEffect(() => {
    if (!doc) return;
    [page, page + 1, page - 1].forEach(ensurePage);
  }, [doc, page, scaleBucket, ensurePage]);

  // Thumbnails render progressively (cheap), a few per idle tick.
  useEffect(() => {
    if (!doc || !railOpen) return;
    let p = 1;
    const id = setInterval(() => {
      let n = 0;
      while (p <= numPages && n < 2) { ensureThumb(p); p++; n++; }
      if (p > numPages) clearInterval(id);
    }, 120);
    return () => clearInterval(id);
  }, [doc, numPages, railOpen, ensureThumb]);

  // Scroll the rail so the active thumb stays visible.
  useEffect(() => {
    if (!railOpen) return;
    railRef.current?.querySelector('[data-active="1"]')?.scrollIntoView({ block: "nearest" });
  }, [page, railOpen]);

  /* ---- paging, with the flip animation ---- */
  const go = useCallback((to, dir) => {
    if (!doc || to < 1 || to > numPages || flip) return;
    ensurePage(to);
    setFlip({ dir, from: page, to });
    setPage(to);
    // let the outgoing page paint one frame before it starts turning
    window.setTimeout(() => setFlip(null), 620);
  }, [doc, numPages, flip, page, ensurePage]);

  const next = useCallback(() => go(page + 1, "next"), [go, page]);
  const prev = useCallback(() => go(page - 1, "prev"), [go, page]);

  /* ---- keyboard ---- */
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(2)));
      else if (e.key === "-") setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, onClose]);

  if (!open) return null;

  const cur = pageCache.current.get(`${page}@${scaleBucket}`);
  const outgoing = flip ? pageCache.current.get(`${flip.from}@${scaleBucket}`) : null;

  const PageImg = ({ data, className = "", style }) =>
    data && data.dataUrl ? (
      <img src={data.dataUrl} alt={`Page ${page}`} draggable={false}
        className={`block h-auto max-h-full w-auto max-w-full select-none ${className}`} style={style} />
    ) : (
      <div className="grid h-[70vh] w-[52vh] max-w-full place-items-center rounded bg-white/5">
        <Loader2 size={26} className="animate-spin text-slate-400" />
      </div>
    );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950/92 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label={`Full paper — ${title || "PDF"}`}>
      {/* ---- top bar ---- */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-slate-900/80 px-3 py-2.5 sm:px-4">
        <button onClick={() => setRailOpen((r) => !r)} title={railOpen ? "Hide pages" : "Show pages"}
          className="hidden rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white sm:block">
          {railOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-white">
          <BookOpen size={15} className="shrink-0 text-cyan-300" />
          <span className="truncate">{title || "The full paper"}</span>
        </span>

        <div className="ml-auto flex items-center gap-1">
          <div className="mr-1 flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1 py-0.5">
            <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))} title="Zoom out"
              className="rounded p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"><ZoomOut size={15} /></button>
            <span className="w-10 text-center text-[11px] font-medium tabular-nums text-slate-300">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(2)))} title="Zoom in"
              className="rounded p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"><ZoomIn size={15} /></button>
          </div>
          <a href={url} download title="Download the PDF"
            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"><Download size={16} /></a>
          <button onClick={onClose} title="Close (Esc)"
            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>
      </div>

      {/* ---- body: rail + stage ---- */}
      <div className="flex min-h-0 flex-1">
        {/* thumbnail rail */}
        {railOpen && (
          <div ref={railRef} className="hidden w-[132px] shrink-0 overflow-y-auto border-r border-white/10 bg-slate-900/50 px-2 py-3 sm:block">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => {
              const t = thumbCache.current.get(p);
              const active = p === page;
              return (
                <button key={p} data-active={active ? "1" : "0"} onClick={() => go(p, p > page ? "next" : "prev")}
                  className={`mb-2 block w-full rounded-lg border p-1 transition ${
                    active ? "border-cyan-400 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.4)]" : "border-white/10 hover:border-white/30"
                  }`}>
                  <div className="overflow-hidden rounded bg-white">
                    {t?.dataUrl
                      ? <img src={t.dataUrl} alt={`Page ${p}`} className="block w-full" draggable={false} />
                      : <div className="grid aspect-[3/4] place-items-center bg-white/5"><Loader2 size={14} className="animate-spin text-slate-400" /></div>}
                  </div>
                  <div className={`mt-1 text-center text-[10px] font-semibold tabular-nums ${active ? "text-cyan-300" : "text-slate-400"}`}>{p}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* stage */}
        <div className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-8">
          {loadErr ? (
            <div className="max-w-sm rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-center text-sm text-red-200">
              {loadErr}
            </div>
          ) : !doc ? (
            <div className="flex flex-col items-center gap-3 text-slate-300">
              <Loader2 size={30} className="animate-spin text-cyan-300" />
              <span className="text-[13px]">Opening the paper…</span>
            </div>
          ) : (
            <div className="pdfr-perspective relative flex max-h-full items-center justify-center">
              {/* current page (revealed base) */}
              <div className="pdfr-shadow relative">
                <PageImg data={cur} />
              </div>

              {/* flipping leaf (outgoing page turning away / incoming page turning in) */}
              {flip && outgoing && (
                <div className={`pdfr-leaf pdfr-shadow absolute inset-0 ${flip.dir === "next" ? "pdfr-leaf--next" : "pdfr-leaf--prev"}`}>
                  <PageImg data={flip.dir === "next" ? outgoing : cur} />
                  <span className="pdfr-gloss" aria-hidden="true" />
                </div>
              )}
            </div>
          )}

          {/* page arrows */}
          {doc && !loadErr && (
            <>
              <button onClick={prev} disabled={page <= 1 || !!flip} aria-label="Previous page"
                className="group absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-slate-900/70 p-2.5 text-slate-200 shadow-lg backdrop-blur transition hover:bg-slate-800 disabled:opacity-25 sm:left-5">
                <ChevronLeft size={22} className="transition-transform group-hover:-translate-x-0.5" />
              </button>
              <button onClick={next} disabled={page >= numPages || !!flip} aria-label="Next page"
                className="group absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-slate-900/70 p-2.5 text-slate-200 shadow-lg backdrop-blur transition hover:bg-slate-800 disabled:opacity-25 sm:right-5">
                <ChevronRight size={22} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ---- bottom page counter ---- */}
      {doc && !loadErr && (
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 bg-slate-900/80 px-4 py-2">
          <button onClick={prev} disabled={page <= 1 || !!flip}
            className="rounded-lg px-2 py-1 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span className="text-[12px] font-medium tabular-nums text-slate-300">
            Page <span className="text-white">{page}</span> of {numPages}
          </span>
          <button onClick={next} disabled={page >= numPages || !!flip}
            className="rounded-lg px-2 py-1 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
