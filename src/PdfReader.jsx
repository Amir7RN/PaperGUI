/**
 * In-app PDF reader — the paper's *real* document, as a document.
 *
 * Pages are rendered the way a PDF viewer renders them: a canvas for the
 * graphics with pdf.js's own text layer sitting invisibly on top, so every word
 * is real selectable text you can click, drag across and copy — not a picture
 * of a word.
 *
 * Two things make it part of the analysis rather than a plain viewer:
 *
 *  1. It opens where the section you were reading came from. The section's
 *     digest is matched against the document's own sentences (pdfAnchors.js),
 *     so opening the reader from Story lands on the Introduction with the exact
 *     sentences the story was built from washed in a translucent marker — the
 *     text underneath stays fully readable (the highlight multiplies, it
 *     doesn't cover). Nothing matched well? It says so and opens at page 1
 *     instead of pretending.
 *
 *  2. Select any line or paragraph and an AI assist bar appears over the
 *     selection: explain it, simplify it, or open the chat with that quote
 *     already loaded.
 *
 * The whole text index is built once per document and cached, so paging,
 * zooming and re-opening from another section are instant.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, Loader2,
  BookOpen, PanelLeftClose, PanelLeftOpen, Highlighter, Sparkles,
  MessageCircle, Copy, Check, Crosshair, GraduationCap,
} from "lucide-react";
import { TextLayer } from "pdfjs-dist";
import { loadPdfDoc, renderPdfPage, extractPageItems } from "./pdf.js";
import { buildPaperIndex, findSectionAnchor } from "./pdfAnchors.js";
import { buildSectionContext } from "./sectionChat.js";

const BASE_SCALE = 1.5;
const THUMB_SCALE = 0.26;

/* Highlight colour follows the section's identity colour in the analysis, so
 * "this yellow-green wash is the Story section" is learnable at a glance. */
const TONE_HL = {
  rose:    { soft: "rgba(244, 63, 94, 0.26)",  hot: "rgba(244, 63, 94, 0.40)",  ring: "#fb7185", chip: "border-rose-400/40 bg-rose-400/10 text-rose-200" },
  violet:  { soft: "rgba(139, 92, 246, 0.24)", hot: "rgba(139, 92, 246, 0.38)", ring: "#a78bfa", chip: "border-violet-400/40 bg-violet-400/10 text-violet-200" },
  blue:    { soft: "rgba(56, 189, 248, 0.28)", hot: "rgba(14, 165, 233, 0.42)", ring: "#38bdf8", chip: "border-sky-400/40 bg-sky-400/10 text-sky-200" },
  amber:   { soft: "rgba(251, 191, 36, 0.34)", hot: "rgba(245, 158, 11, 0.48)", ring: "#fbbf24", chip: "border-amber-400/40 bg-amber-400/10 text-amber-200" },
  emerald: { soft: "rgba(16, 185, 129, 0.26)", hot: "rgba(5, 150, 105, 0.40)",  ring: "#34d399", chip: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" },
  fuchsia: { soft: "rgba(217, 70, 239, 0.24)", hot: "rgba(192, 38, 211, 0.38)", ring: "#e879f9", chip: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200" },
};
const toneOf = (t) => TONE_HL[t] || TONE_HL.amber;

/* One text index per document URL — surviving close/reopen and section swaps. */
const INDEX_CACHE = new Map();

/* ---------------- one live page: canvas + real text layer + highlights ------ */

function PdfPageView({ doc, pageNo, scale, marks, activeMark, tone, turnKey }) {
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const activeRef = useRef(null);
  const [dims, setDims] = useState(null);

  /* graphics */
  useEffect(() => {
    if (!doc) return undefined;
    let dead = false, task = null;
    (async () => {
      const page = await doc.getPage(pageNo);
      if (dead) return;
      const viewport = page.getViewport({ scale });
      const w = Math.floor(viewport.width), h = Math.floor(viewport.height);
      setDims({ w, h });

      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      task = page.render({
        canvasContext: canvas.getContext("2d", { alpha: false }),
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      });
      await task.promise;
    })().catch(() => { /* cancelled by a page/zoom change */ });
    return () => { dead = true; try { task?.cancel(); } catch { /* done */ } };
  }, [doc, pageNo, scale]);

  /* selectable words — pdf.js's own text layer, deliberately independent of
   * the canvas render so a cancelled repaint can never leave the page
   * unselectable. */
  useEffect(() => {
    if (!doc) return undefined;
    let dead = false, layer = null;
    (async () => {
      const page = await doc.getPage(pageNo);
      const source = await page.getTextContent();
      const container = textRef.current;
      if (dead || !container) return;
      const viewport = page.getViewport({ scale });
      container.replaceChildren();
      container.style.setProperty("--scale-factor", String(scale));
      container.style.width = `${Math.floor(viewport.width)}px`;
      container.style.height = `${Math.floor(viewport.height)}px`;
      layer = new TextLayer({ textContentSource: source, container, viewport });
      await layer.render();
    })().catch(() => { /* superseded */ });
    return () => { dead = true; try { layer?.cancel(); } catch { /* done */ } };
  }, [doc, pageNo, scale]);

  // Keep the passage we jumped to in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeMark, pageNo, dims]);

  const c = toneOf(tone);

  return (
    <div key={turnKey} className="pdfr-page pdfr-shadow relative bg-white"
      style={{ width: dims?.w, height: dims?.h }}>
      <canvas ref={canvasRef} className="block" />

      {/* provenance highlights — translucent marker, text stays readable */}
      <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
        {marks.map((m, i) =>
          m.rects.map((r, j) => {
            const hot = m.key === activeMark;
            return (
              <span
                key={`${i}-${j}`}
                ref={hot && j === 0 ? activeRef : null}
                className="pdfr-hl"
                style={{
                  left: `${r.x * 100}%`, top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`, height: `${r.h * 100}%`,
                  background: hot ? c.hot : c.soft,
                  boxShadow: hot ? `0 0 0 1.5px ${c.ring}` : "none",
                }}
              />
            );
          })
        )}
      </div>

      {/* pdf.js text layer (selectable words) */}
      <div
        ref={textRef}
        className="pdfr-textlayer"
        onPointerDown={(e) => e.currentTarget.classList.add("selecting")}
        onPointerUp={(e) => e.currentTarget.classList.remove("selecting")}
      />
    </div>
  );
}

/* ---------------- the reader ---------------- */

export default function PdfReader({ url, title, open, onClose, spec, section, onAsk }) {
  const [doc, setDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loadErr, setLoadErr] = useState(null);
  const [railOpen, setRailOpen] = useState(true);
  const [dir, setDir] = useState("next");

  const [index, setIndex] = useState(null);       // text index for this url
  const [indexing, setIndexing] = useState(false);
  const [anchor, setAnchor] = useState(null);     // { page, headLabel, matches }
  const [anchorMiss, setAnchorMiss] = useState(false);
  const [hlOn, setHlOn] = useState(true);
  const [markIdx, setMarkIdx] = useState(0);
  const [sel, setSel] = useState(null);           // { x, y, text }
  const [copied, setCopied] = useState(false);

  const thumbCache = useRef(new Map());
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const railRef = useRef(null);
  const stageRef = useRef(null);

  const sectionId = section?.id || null;
  const tone = section?.tone || "amber";

  /* ---- open the document ---- */
  useEffect(() => {
    if (!open || !url) return undefined;
    let alive = true;
    setDoc(null); setLoadErr(null); setNumPages(0); setZoom(1);
    setAnchor(null); setAnchorMiss(false); setSel(null);
    thumbCache.current = new Map();
    loadPdfDoc(url)
      .then((d) => { if (alive) { setDoc(d); setNumPages(d.numPages); } })
      .catch((e) => { if (alive) setLoadErr(e?.message || "Could not open the PDF."); });
    return () => { alive = false; };
  }, [open, url]);

  /* ---- build (or reuse) the text index, page by page so the UI stays live ---- */
  useEffect(() => {
    if (!doc || !url) return undefined;
    const cached = INDEX_CACHE.get(url);
    if (cached) { setIndex(cached); return undefined; }
    let alive = true;
    setIndex(null); setIndexing(true);
    (async () => {
      // let the first page paint before we start walking the whole document
      await new Promise((r) => setTimeout(r, 250));
      const pages = [];
      for (let p = 1; p <= doc.numPages; p++) {
        if (!alive) return;
        try { pages.push(await extractPageItems(doc, p)); } catch { /* skip page */ }
      }
      if (!alive) return;
      const built = buildPaperIndex(pages);
      INDEX_CACHE.set(url, built);
      setIndex(built); setIndexing(false);
    })();
    return () => { alive = false; setIndexing(false); };
  }, [doc, url]);

  /* ---- resolve where this section came from ---- */
  useEffect(() => {
    if (!open) return;
    if (!index || !spec || !sectionId) { setAnchor(null); setAnchorMiss(false); return; }
    const digest = buildSectionContext(spec, sectionId);
    const found = findSectionAnchor(index, sectionId, digest);
    setAnchor(found);
    setAnchorMiss(!found);
    setMarkIdx(found?.bestIdx || 0);   // start on the strongest passage
    setPage(found ? found.page : 1);
    setDir("next");
  }, [open, index, spec, sectionId]);

  // With no section context at all (or before the index lands), start at page 1.
  useEffect(() => { if (open && !anchor) setPage((p) => (p >= 1 ? p : 1)); }, [open, anchor]);

  const scale = useMemo(() => +(BASE_SCALE * zoom).toFixed(2), [zoom]);

  /* ---- thumbnails (cheap raster; the stage is the live one) ---- */
  const ensureThumb = useCallback((p) => {
    if (!doc || p < 1 || p > numPages || thumbCache.current.has(p)) return;
    thumbCache.current.set(p, { loading: true });
    renderPdfPage(doc, p, THUMB_SCALE)
      .then((r) => { thumbCache.current.set(p, r); rerender(); })
      .catch(() => { thumbCache.current.delete(p); });
  }, [doc, numPages, rerender]);

  useEffect(() => {
    if (!doc || !railOpen) return undefined;
    let p = 1;
    const id = setInterval(() => {
      let n = 0;
      while (p <= numPages && n < 2) { ensureThumb(p); p++; n++; }
      if (p > numPages) clearInterval(id);
    }, 120);
    return () => clearInterval(id);
  }, [doc, numPages, railOpen, ensureThumb]);

  useEffect(() => {
    if (!railOpen) return;
    railRef.current?.querySelector('[data-active="1"]')?.scrollIntoView({ block: "nearest" });
  }, [page, railOpen]);

  /* ---- paging ---- */
  const go = useCallback((to) => {
    if (!doc || to < 1 || to > numPages || to === page) return;
    setDir(to > page ? "next" : "prev");
    setPage(to);
    setSel(null);
    stageRef.current?.scrollTo({ top: 0 });
  }, [doc, numPages, page]);

  const next = useCallback(() => go(page + 1), [go, page]);
  const prev = useCallback(() => go(page - 1), [go, page]);

  /* ---- highlight navigation ---- */
  const marks = useMemo(() => {
    if (!anchor?.matches) return [];
    return anchor.matches.map((m, i) => ({ ...m, key: i }));
  }, [anchor]);
  const pageMarks = useMemo(
    () => (hlOn ? marks.filter((m) => m.page === page) : []),
    [marks, page, hlOn]
  );
  const markPages = useMemo(() => new Set(marks.map((m) => m.page)), [marks]);

  const gotoMark = useCallback((i) => {
    if (!marks.length) return;
    const n = ((i % marks.length) + marks.length) % marks.length;
    const m = marks[n];
    setHlOn(true);
    setMarkIdx(n);
    if (m.page !== page) { setDir(m.page > page ? "next" : "prev"); setPage(m.page); }
  }, [marks, page]);

  /* ---- keyboard ---- */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(2.6, +(z + 0.2).toFixed(2)));
      else if (e.key === "-") setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)));
      else if (e.key === "n" && marks.length) { e.preventDefault(); gotoMark(markIdx + 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, onClose, marks.length, markIdx, gotoMark]);

  /* ---- selection -> AI assist bar ---- */
  useEffect(() => {
    if (!open) return undefined;
    const stage = stageRef.current;
    if (!stage) return undefined;
    const onUp = () => {
      setTimeout(() => {
        const s = window.getSelection();
        const text = s && String(s).replace(/\s+/g, " ").trim();
        if (!text || text.length < 3 || !s.rangeCount) { setSel(null); return; }
        const node = s.anchorNode?.nodeType === 1 ? s.anchorNode : s.anchorNode?.parentNode;
        if (!node || !stage.contains(node)) { setSel(null); return; }
        const r = s.getRangeAt(0).getBoundingClientRect();
        if (!r.width && !r.height) { setSel(null); return; }
        setCopied(false);
        setSel({ x: Math.min(window.innerWidth - 180, Math.max(180, r.left + r.width / 2)), y: r.top - 10, text });
      }, 10);
    };
    const onDown = (e) => { if (!e.target.closest?.("[data-pdfr-assist]")) setSel(null); };
    stage.addEventListener("mouseup", onUp);
    document.addEventListener("mousedown", onDown);
    return () => { stage.removeEventListener("mouseup", onUp); document.removeEventListener("mousedown", onDown); };
  }, [open, doc]);

  const askAbout = useCallback((kind) => {
    if (!sel || !onAsk) return;
    // PDF lines break words with a hyphen; heal them so the model sees prose
    const clean = sel.text.replace(/(\w)-\s+(\w)/g, "$1$2");
    const quote = clean.length > 900 ? `${clean.slice(0, 900)}…` : clean;
    const prompts = {
      explain: `Explain this passage from the paper (page ${page}), in plain language: “${quote}”`,
      simplify: `Re-explain this passage from the paper as simply as possible, no jargon, one everyday analogy: “${quote}”`,
    };
    const payload = { sectionId: sectionId || "story", title: section?.title || "The paper" };
    if (kind === "chat") payload.initialDraft = `About this passage on page ${page}: “${quote}”\n\nMy question: `;
    else payload.initialAsk = prompts[kind];
    onAsk(payload);
    setSel(null);
    window.getSelection()?.removeAllRanges();
  }, [sel, onAsk, page, sectionId, section?.title]);

  if (!open) return null;

  const c = toneOf(tone);
  const activeMark = marks[markIdx]?.page === page ? marks[markIdx].key : -1;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950/94 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label={`Full paper — ${title || "PDF"}`}>

      {/* ---- top bar ---- */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-slate-900/85 px-3 py-2.5 sm:px-4">
        <button onClick={() => setRailOpen((r) => !r)} title={railOpen ? "Hide pages" : "Show pages"}
          className="hidden rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white sm:block">
          {railOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-white">
          <BookOpen size={15} className="shrink-0 text-cyan-300" />
          <span className="max-w-[36ch] truncate">{title || "The full paper"}</span>
        </span>

        {/* provenance chip: which section we're tracing, and its passages */}
        {section && (
          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${c.chip}`}>
            <Crosshair size={12} />
            {indexing || (!index && !loadErr)
              ? "Finding this section in the paper…"
              : anchor
                ? <>Source of “{section.title}”{anchor.headLabel ? ` · ${anchor.headLabel}` : ""}</>
                : anchorMiss ? "Couldn't pin this section to a passage" : `Source of “${section.title}”`}
          </span>
        )}

        {marks.length > 0 && (
          <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 px-1 py-0.5">
            <button onClick={() => setHlOn((h) => !h)} title={hlOn ? "Hide highlights" : "Show highlights"}
              className={`rounded p-1 transition hover:bg-white/10 ${hlOn ? "text-amber-300" : "text-slate-400"}`}>
              <Highlighter size={15} />
            </button>
            <button onClick={() => gotoMark(markIdx - 1)} title="Previous passage"
              className="rounded p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"><ChevronLeft size={14} /></button>
            <span className="px-1 text-[11px] font-semibold tabular-nums text-slate-300">
              {markIdx + 1}<span className="text-slate-500">/{marks.length}</span>
            </span>
            <button onClick={() => gotoMark(markIdx + 1)} title="Next passage (n)"
              className="rounded p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"><ChevronRight size={14} /></button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <div className="mr-1 flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1 py-0.5">
            <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))} title="Zoom out"
              className="rounded p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"><ZoomOut size={15} /></button>
            <span className="w-10 text-center text-[11px] font-medium tabular-nums text-slate-300">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.6, +(z + 0.2).toFixed(2)))} title="Zoom in"
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
        {railOpen && (
          <div ref={railRef} className="hidden w-[132px] shrink-0 overflow-y-auto border-r border-white/10 bg-slate-900/50 px-2 py-3 sm:block">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => {
              const t = thumbCache.current.get(p);
              const active = p === page;
              const marked = markPages.has(p);
              return (
                <button key={p} data-active={active ? "1" : "0"} onClick={() => go(p)}
                  className={`relative mb-2 block w-full rounded-lg border p-1 transition ${
                    active ? "border-cyan-400 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.4)]" : "border-white/10 hover:border-white/30"
                  }`}>
                  <div className="overflow-hidden rounded bg-white">
                    {t?.dataUrl
                      ? <img src={t.dataUrl} alt={`Page ${p}`} className="block w-full" draggable={false} />
                      : <div className="grid aspect-[3/4] place-items-center bg-white/5"><Loader2 size={14} className="animate-spin text-slate-400" /></div>}
                  </div>
                  {marked && hlOn && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-slate-900"
                      style={{ background: c.ring }} title="This page holds a source passage" />
                  )}
                  <div className={`mt-1 text-center text-[10px] font-semibold tabular-nums ${active ? "text-cyan-300" : "text-slate-400"}`}>{p}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* stage */}
        <div ref={stageRef} className="relative flex min-w-0 flex-1 justify-center overflow-auto p-4 sm:p-8">
          {loadErr ? (
            <div className="m-auto max-w-sm rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-center text-sm text-red-200">
              {loadErr}
            </div>
          ) : !doc ? (
            <div className="m-auto flex flex-col items-center gap-3 text-slate-300">
              <Loader2 size={30} className="animate-spin text-cyan-300" />
              <span className="text-[13px]">Opening the paper…</span>
            </div>
          ) : (
            <div className="pdfr-perspective my-auto">
              <PdfPageView
                doc={doc} pageNo={page} scale={scale} marks={pageMarks}
                activeMark={activeMark} tone={tone} turnKey={`${page}-${dir}`}
              />
            </div>
          )}

          {doc && !loadErr && (
            <>
              <button onClick={prev} disabled={page <= 1} aria-label="Previous page"
                className="group fixed left-2 top-1/2 z-[2] -translate-y-1/2 rounded-full border border-white/15 bg-slate-900/70 p-2.5 text-slate-200 shadow-lg backdrop-blur transition hover:bg-slate-800 disabled:opacity-25 sm:left-5">
                <ChevronLeft size={22} className="transition-transform group-hover:-translate-x-0.5" />
              </button>
              <button onClick={next} disabled={page >= numPages} aria-label="Next page"
                className="group fixed right-2 top-1/2 z-[2] -translate-y-1/2 rounded-full border border-white/15 bg-slate-900/70 p-2.5 text-slate-200 shadow-lg backdrop-blur transition hover:bg-slate-800 disabled:opacity-25 sm:right-5">
                <ChevronRight size={22} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ---- selection assist bar ---- */}
      {sel && onAsk && (
        // the animation owns `transform`, so positioning lives on the wrapper
        <div
          data-pdfr-assist=""
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={{ position: "fixed", left: sel.x, top: Math.max(56, sel.y), transform: "translate(-50%, -100%)", zIndex: 75 }}
        >
          <div className="pp-rise flex items-center gap-0.5 rounded-xl border border-indigo-300/60 bg-slate-900/95 p-1 shadow-2xl backdrop-blur">
            <AssistBtn icon={Sparkles} label="Explain" onClick={() => askAbout("explain")} primary />
            <AssistBtn icon={GraduationCap} label="Simplify" onClick={() => askAbout("simplify")} />
            <AssistBtn icon={MessageCircle} label="Ask…" onClick={() => askAbout("chat")} />
            <span className="mx-0.5 h-5 w-px bg-white/15" />
            <AssistBtn
              icon={copied ? Check : Copy}
              label={copied ? "Copied" : "Copy"}
              onClick={() => { navigator.clipboard?.writeText(sel.text).then(() => setCopied(true)).catch(() => {}); }}
            />
          </div>
        </div>
      )}

      {/* ---- bottom bar: page counter + what the highlight means ---- */}
      {doc && !loadErr && (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-white/10 bg-slate-900/85 px-4 py-2">
          <span className="flex items-center gap-1">
            <button onClick={prev} disabled={page <= 1}
              className="rounded-lg px-2 py-1 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <span className="text-[12px] font-medium tabular-nums text-slate-300">
              Page <span className="text-white">{page}</span> of {numPages}
            </span>
            <button onClick={next} disabled={page >= numPages}
              className="rounded-lg px-2 py-1 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"><ChevronRight size={16} /></button>
          </span>
          <span className="text-[11px] text-slate-500">
            {marks.length > 0 && hlOn ? (
              <>
                <span className="mr-1 inline-block h-2 w-4 translate-y-px rounded-sm" style={{ background: c.soft, outline: `1px solid ${c.ring}55` }} />
                {marks.length} passage{marks.length === 1 ? "" : "s"} this section was built from
                {" · "}
              </>
            ) : anchorMiss ? "No passage matched this section closely enough to mark · " : null}
            select any text for AI help
          </span>
        </div>
      )}
    </div>
  );
}

function AssistBtn({ icon: Icon, label, onClick, primary }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
        primary ? "bg-indigo-600 text-white hover:bg-indigo-500" : "text-slate-200 hover:bg-white/10 hover:text-white"
      }`}>
      <Icon size={13} /> {label}
    </button>
  );
}
