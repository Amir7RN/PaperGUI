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
import { createPortal } from "react-dom";
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, Loader2,
  BookOpen, PanelLeftClose, PanelLeftOpen, Highlighter, Sparkles,
  MessageCircle, Copy, Check, Crosshair, HelpCircle,
  MousePointerClick, ArrowLeftRight, LineChart, ShieldQuestion,
  Undo2, GitCompare, Target, Gauge, Quote, Sigma, BookMarked, SlidersHorizontal,
  NotebookPen, Ruler, Trash2, Scan, ScanLine, Image as ImageIcon, Table2,
} from "lucide-react";
import { TextLayer } from "pdfjs-dist";
import { loadPdfDoc, renderPdfPage, extractPageItems } from "./pdf.js";
import { buildPaperIndex, findSectionAnchor, paperOutline, HEAD_LABEL } from "./pdfAnchors.js";
import { buildInlineRefs, locateQuote, matchEvidence, sectionKeyAt, quoteRects, parseBibEntry } from "./paperRefs.js";
import { scanRobustness } from "./robustness.js";
import { askSectionAssistant, buildSectionContext } from "./sectionChat.js";
import { HL_COLORS, colorOf } from "./highlights.js";

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

/* "You've seen the how-to-read-this card" flag. */
const GUIDE_KEY = "pp-pdfr-guide-v1";

/* ---------------- one live page: canvas + real text layer + highlights ------ */

function PdfPageView({ doc, pageNo, scale, marks, activeMark, tone, turnKey, hotspots, onHotspot, userMarks }) {
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

  /* Clicking a cross-reference is HIT-TESTED, not overlaid.
   *
   * A clickable overlay sitting above the text layer would swallow the
   * pointer wherever a marker is, so dragging a selection across a sentence
   * containing "[12]" would break mid-sentence. Instead the markers are drawn
   * purely decoratively (pointer-events: none) and the click is resolved
   * against their boxes here — selection behaviour is untouched. */
  const onPageClick = useCallback((e) => {
    if (!onHotspot) return;
    // A click that ends a drag-selection is not a click on a link.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    // Cross-references win over the reader's own highlights: a marker is a
    // few characters wide and a highlight often runs under it, so testing the
    // highlight first would make "[12]" unclickable once it had been marked.
    const layers = [hotspots || [], userMarks || []];
    for (const layer of layers) {
      for (const h of layer) {
        for (const r of h.rects) {
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            // Stop here, or this very click keeps bubbling to the document and
            // trips the card's own click-outside handler — opening and closing
            // it in one gesture.
            e.stopPropagation();
            onHotspot(h, { x: e.clientX, y: box.top + r.y * box.height });
            return;
          }
        }
      }
    }
  }, [hotspots, userMarks, onHotspot]);

  return (
    <div key={turnKey} className="pdfr-page pdfr-shadow relative bg-white"
      style={{ width: dims?.w, height: dims?.h }} onClick={onPageClick}>
      <canvas ref={canvasRef} className="block" />

      {/* cross-reference markers — decorative only; see onPageClick */}
      {hotspots?.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[2]" aria-hidden="true">
          {hotspots.map((h) =>
            h.rects.map((r, j) => (
              <span
                key={`${h.id}-${j}`}
                className="pdfr-xref"
                style={{
                  left: `${r.x * 100}%`, top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`, height: `${r.h * 100}%`,
                }}
              />
            ))
          )}
        </div>
      )}

      {/* the reader's OWN highlighter — same translucent wash, their colour */}
      {userMarks?.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
          {userMarks.map((m) =>
            m.rects.map((r, j) => (
              <span
                key={`${m.id}-${j}`}
                className="pdfr-hl"
                style={{
                  left: `${r.x * 100}%`, top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`, height: `${r.h * 100}%`,
                  background: colorOf(m.color).css,
                }}
              />
            ))
          )}
        </div>
      )}

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

/* ---------------- the reader ----------------
 *
 * One component, two shells. `variant` decides whether this is the fullscreen
 * modal it has always been, or the page's own primary reading surface:
 *
 *   "modal"  — fixed inset-0 overlay, Esc closes, close button, page arrows
 *              pinned to the viewport. Every pre-existing call site.
 *   "inline" — sits in the document flow as the reading spine. No dialog role,
 *              no close affordance, Esc left alone (the workspace owns it), and
 *              the page arrows anchor to the stage instead of the viewport.
 *
 * Two extra hooks exist for the inline case, both no-ops when unused:
 *   onOutline(outline) — the paper's own detected sections, once the text index
 *                        is built, so the workspace can drive a rail from them.
 *   gotoPage           — a page number the owner wants shown; changing it
 *                        navigates. Null means "don't interfere".
 */

/* ---------------- what selecting text offers, per paper section ------------
 * The useful question changes with where you are in a paper. In the intro you
 * want orientation; in the results you want to know which figure backs the
 * sentence; in the discussion — where papers hedge, overclaim and gesture at
 * future work — you want the claim pressure-tested. Offering one generic
 * "explain" everywhere wastes the one thing we know for free: the section.
 *
 * `ask` builds a tutor prompt. `kind` marks the two actions that are not
 * prompts: opening an analysis pin, and the local evidence matcher.
 */
const Q = (s) => `“${s}”`;
const ACTIONS = {
  /* One explanation action, not two.
   *
   * "Explain" and "Simplify" were the same request at two temperatures, and a
   * reader who has to choose between them before reading either answer is
   * being asked a question they cannot answer yet. The prompt now does what
   * "Simplify" was for — plain language first, jargon only once it has been
   * defined — and the depth control lives where it belongs: in the chat that
   * opens, one tap away ("Explain simpler" / "Go deeper").
   *
   * "Ask…" is NOT redundant with it: Explain answers the question we wrote,
   * Ask opens the same chat with the passage already loaded so the reader
   * types their own. One is a preset, the other is a blank line. */
  explain:  { label: "Explain", icon: Sparkles, primary: true,
    ask: (q, page) => `Explain this passage from the paper (page ${page}) in plain language — assume I'm smart but new to this field. Lead with the everyday version, define any term you have to use, and add one concrete analogy if it helps: ${Q(q)}` },
  evidence: { label: "Show the evidence", icon: LineChart, kind: "evidence" },
  // Selecting a caption ("Fig. 4 — MAE by horizon…") is the same gesture as
  // clicking the in-text "Fig. 4", so it opens the same card: the crop, what
  // it shows, and the option to make it live.
  figure:   { label: "This figure", icon: ImageIcon, kind: "figure" },
  /* Tables and pseudocode listings ARE real text in the PDF — the analyzer
   * crops them as pictures, but the reader's text layer has every cell and
   * every line of the algorithm. So selecting one is the honest way to hand
   * it to the panel builder: the model gets the numbers and the steps, not a
   * JPEG it has to squint at. Offered wherever a selection looks like one. */
  table:    { label: "Build from this table", icon: Table2, kind: "panel-table" },
  // The one action that costs money and generates code — see panelGen.js.
  panel:    { label: "Build me a panel", icon: SlidersHorizontal, kind: "panel" },
  highlight:{ label: "Highlight", icon: Highlighter, kind: "highlight" },
  keep:     { label: "Keep this", icon: NotebookPen, kind: "keep" },
  steelman: { label: "Steelman it", icon: ShieldQuestion,
    ask: (q) => `The authors state this limitation or caveat: ${Q(q)}\n\nSteelman it: spell out what it actually means for someone relying on this work, including the part the authors may be underplaying. Use only what this paper says.` },
  overturn: { label: "What'd change it", icon: Undo2,
    ask: (q) => `This is a claim from the paper's discussion: ${Q(q)}\n\nWhat would the evidence have to look like for this claim NOT to hold? Be concrete about the measurement or result that would overturn it.` },
  compare:  { label: "vs. related work", icon: GitCompare,
    ask: (q) => `This is a conclusion from the paper: ${Q(q)}\n\nHow does it sit against the related work THIS paper itself cites? Where does it agree, and where does it push back? Only use what this paper reports about that prior work.` },
  takeaway: { label: "So what do I do", icon: Target,
    ask: (q) => `From this passage: ${Q(q)}\n\nGive the actionable takeaway for someone who wants to BUILD ON this work — what they should actually do differently. Keep it to a few concrete points, grounded in the paper.` },
  // Statistical significance and practical significance are different
  // questions, and papers report the first while readers need the second.
  magnitude: { label: "How big a deal?", icon: Ruler,
    ask: (q) => `This passage reports a statistical result: ${Q(q)}\n\nTranslate it into PRACTICAL significance, not statistical significance. What does the effect size, interval or R² mean for someone acting on it — is the difference big enough to matter in the real setting the paper is about? If the paper only shows the result is unlikely to be chance, and says nothing about whether it is large enough to matter, say that plainly.` },
  hedging:  { label: "How firm is this?", icon: Gauge,
    ask: (q) => `Assess how firmly this is stated: ${Q(q)}\n\nQuote the hedging words ("may", "suggests", "preliminary") or the firm ones, say whether the paper's own evidence supports that strength, and flag it if the language is more confident than the evidence.` },
};

/** Section key (from the paper's own headings) → which actions to offer.
 *
 * `panel` lives on the method-ish sections on purpose. It is where a reader
 * most often hits something they cannot picture, and it is the one action that
 * spends money — offering it beside every sentence in the paper would invite
 * clicking it out of curiosity rather than need. */
const SECTION_ACTIONS = {
  abstract:     ["explain"],
  introduction: ["explain"],
  related:      ["explain"],
  method:       ["explain", "panel"],
  experiment:   ["explain", "panel"],
  results:      ["explain", "evidence", "magnitude", "hedging"],
  conclusion:   ["explain", "steelman", "overturn", "compare", "takeaway"],
};
const DEFAULT_ACTIONS = ["explain"];

export function PaperReader({
  url, title, open, onClose, spec, section, onAsk, onBuildPanel, onKeep,
  variant = "modal", onOutline, onEvidence, gotoPage,
  highlights, onHighlight, onUnhighlight,
}) {
  const [doc, setDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  /* Fit mode, not a zoom percentage, is the default.
   *
   * A fixed 150% render makes a full page taller than any stage it is put in,
   * so the reader inherits a SECOND vertical scrollbar inside the page on top
   * of whatever the surrounding shell already scrolls — and paging then means
   * scrolling to the bottom of one page before the next one is reachable.
   * Fitting the page to the stage removes that scrollbar entirely: one page,
   * whole, and ← → to turn it. */
  const [fit, setFit] = useState("height");   // "height" | "width" | null
  const [pageSize, setPageSize] = useState(null); // unscaled page, in CSS px
  const [stageBox, setStageBox] = useState(null); // live stage size
  const [loadErr, setLoadErr] = useState(null);
  // Thumbnails are the third scroll surface on the screen and duplicate the
  // pager and the outline rail, so they start closed and stay a deliberate
  // choice rather than the default.
  const [railOpen, setRailOpen] = useState(false);
  const [dir, setDir] = useState("next");

  const [index, setIndex] = useState(null);       // text index for this url
  const [indexing, setIndexing] = useState(false);
  const [anchor, setAnchor] = useState(null);     // { page, headLabel, matches }
  const [anchorMiss, setAnchorMiss] = useState(false);
  const [hlOn, setHlOn] = useState(true);
  const [markIdx, setMarkIdx] = useState(0);
  const [sel, setSel] = useState(null);           // { x, y, text, head }
  const [copied, setCopied] = useState(false);
  // A cross-reference card: { at:{x,y}, kind, label, payload } — the resolved
  // "[12]" / "Fig. 3" / "Eq. 2" shown where it was mentioned.
  const [card, setCard] = useState(null);
  // First-time orientation: what the colour means and what you can do here.
  // Dismissed for good once, reopenable from the ? button.
  const [guide, setGuide] = useState(false);

  const thumbCache = useRef(new Map());
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const railRef = useRef(null);
  const stageRef = useRef(null);

  const sectionId = section?.id || null;
  const tone = section?.tone || "amber";
  const inline = variant === "inline";

  /* ---- open the document ---- */
  useEffect(() => {
    if (!open || !url) return undefined;
    let alive = true;
    setDoc(null); setLoadErr(null); setNumPages(0); setZoom(1); setFit("height");
    setAnchor(null); setAnchorMiss(false); setSel(null); setPageSize(null);
    thumbCache.current = new Map();
    setGuide(localStorage.getItem(GUIDE_KEY) !== "1");
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

  /* ---- resolvable cross-references, once the text index exists ---- */
  const refs = useMemo(() => buildInlineRefs(index, spec), [index, spec]);
  const pageSpots = useMemo(() => refs.byPage.get(page) || [], [refs, page]);

  /* Every figure we hold a crop for, by the paper's own figure number — so a
   * selected CAPTION resolves to the same card an in-text "Fig. 4" opens. */
  const figByNum = useMemo(() => {
    const m = new Map();
    const numOf = (s) => { const x = String(s || "").match(/(\d{1,2})/); return x ? +x[1] : null; };
    const add = (n, f) => { if (n != null && f?.image && !m.has(n)) m.set(n, f); };
    for (const f of spec?.resultFigures || []) {
      add(numOf(f.figureLabel), {
        label: f.figureLabel, title: f.title, explanation: f.explanation, image: f.image, page: f.page });
    }
    for (const f of spec?.conceptFigures || []) {
      add(numOf(f.title), {
        label: (String(f.title).split(/[—–-]/)[0] || "").trim() || `Fig. ${numOf(f.title)}`,
        title: f.title, explanation: f.explanation, image: f.image, page: f.page });
    }
    return m;
  }, [spec]);

  /* ---- hand the paper's own outline to whoever owns the rail ---- */
  useEffect(() => {
    if (!index || !onOutline) return;
    onOutline(paperOutline(index));
  }, [index, onOutline]);

  /* ---- and the evidence scan, which needs the same text index ---- */
  useEffect(() => {
    if (!index || !onEvidence) return;
    onEvidence(scanRobustness(index));
  }, [index, onEvidence]);

  /* ---- an owner-driven page jump (inline rail clicks) ----
   * `gotoPage` is an OBJECT ({ page }), not a bare number, so its identity
   * changes on every request. A number would silently do nothing the second
   * time the same rail entry is clicked — page away from Method, click
   * "Method" again, and the value would be unchanged and the effect wouldn't
   * fire. */
  const jumpPage = gotoPage?.page;
  useEffect(() => {
    if (!doc || !Number.isInteger(jumpPage)) return;
    if (jumpPage < 1 || jumpPage > numPages) return;
    setDir((d) => (jumpPage > page ? "next" : jumpPage < page ? "prev" : d));
    setPage(jumpPage);
    setSel(null);
    stageRef.current?.scrollTo({ top: 0 });
    // `page` is deliberately not a dependency: re-running on every page change
    // would yank the reader back to the rail's page as soon as they paged away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, gotoPage, numPages]);

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

  /* ---- what scale actually shows a whole page ---- */

  // The page's own unscaled size. Read per page because papers mix portrait
  // body pages with landscape figure pages, and a fit computed off page 1
  // would overflow the first one of those.
  useEffect(() => {
    if (!doc) return undefined;
    let dead = false;
    doc.getPage(page)
      .then((p) => {
        if (dead) return;
        const v = p.getViewport({ scale: 1 });
        setPageSize({ w: v.width, h: v.height });
      })
      .catch(() => { /* superseded */ });
    return () => { dead = true; };
  }, [doc, page]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setStageBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, doc, loadErr]);

  const fitScale = useMemo(() => {
    if (!stageBox || !pageSize?.h || !pageSize?.w) return null;
    // The stage's own padding is already excluded (contentRect), but a page
    // sitting flush against the edges reads as broken, so keep a hair of air.
    const availW = stageBox.w - 8, availH = stageBox.h - 8;
    if (availW <= 40 || availH <= 40) return null;
    return { height: availH / pageSize.h, width: availW / pageSize.w };
  }, [stageBox, pageSize]);

  const scale = useMemo(() => {
    if (fit && fitScale) return +Math.max(0.15, Math.min(4, fitScale[fit])).toFixed(3);
    return +(BASE_SCALE * zoom).toFixed(2);
  }, [fit, fitScale, zoom]);

  /* Leaving fit mode must not jump the page's size: the manual zoom picks up
   * exactly where the fitted one left off. */
  const stepZoom = useCallback((delta) => {
    setZoom((z) => {
      const from = fit && fitScale ? fitScale[fit] / BASE_SCALE : z;
      return Math.max(0.4, Math.min(3, +(from + delta).toFixed(2)));
    });
    setFit(null);
  }, [fit, fitScale]);

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

  /* The reader's own highlights, re-located against the text index at the
   * current page. Stored as quotes, so they survive zoom, fit mode and a
   * reload; one that no longer matches the page is simply not drawn rather
   * than drawn in the wrong place. */
  const userMarks = useMemo(() => {
    if (!index || !highlights?.length) return [];
    return highlights
      .filter((h) => h.page === page)
      .map((h) => ({ ...h, kind: "highlight", rects: quoteRects(index, page, h.quote) }))
      .filter((h) => h.rects.length);
  }, [index, highlights, page]);
  const hlPages = useMemo(() => new Set((highlights || []).map((h) => h.page)), [highlights]);

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
      // Inline, there is nothing to close and the workspace owns Escape.
      if (e.key === "Escape") { if (!inline) onClose?.(); }
      else if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
      else if (e.key === "+" || e.key === "=") stepZoom(0.2);
      else if (e.key === "-") stepZoom(-0.2);
      else if (e.key === "0") { e.preventDefault(); setFit("height"); }
      else if (e.key === "n" && marks.length) { e.preventDefault(); gotoMark(markIdx + 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, onClose, marks.length, markIdx, gotoMark, inline, stepZoom]);

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
        setCard(null);
        // Which of the paper's own sections this selection sits in decides
        // what we offer to do with it. Unlocatable text falls back to the
        // generic menu rather than guessing a section.
        const at = locateQuote(index, page, text);
        // Is a figure CAPTION in this selection?
        //
        // Not "does it start with one": pdf.js emits the text layer in the
        // PDF's own drawing order, which on a real page puts a caption after
        // the table below it — so the caption is very often not at the front
        // of the selection string even when it is the first thing on screen.
        // A caption is recognised by SHAPE instead: "Fig. 6." followed by the
        // start of a sentence. A bare mention ("…as in Fig. 6, which…") is
        // followed by lowercase or punctuation and doesn't match — and it is
        // already clickable where it sits.
        const capM = text.slice(0, 400)
          .match(/\bFigs?\.?\s*(\d{1,2})[a-d]?\s*[.:—–-]\s+[A-Z]|\bFigures?\s+(\d{1,2})[a-d]?\s*[.:—–-]\s+[A-Z]/);

        // Does this selection look like a table or an algorithm listing?
        //
        // Either it says so (a caption or heading is in the selection), or it
        // reads like one: a wall of numbers, or the control-flow keywords a
        // pseudocode block is built from. This is deliberately generous — the
        // cost of a false positive is one extra button, and the thing it
        // unlocks (handing the paper's own numbers or its own steps to the
        // panel builder as TEXT rather than as a cropped picture) is the whole
        // point of the reader having a real text layer.
        const head = text.slice(0, 400);
        const numerals = (text.match(/-?\d+(?:[.,]\d+)?/g) || []).length;
        const tabular =
          /\b(?:Table|Algorithm|Procedure|Pseudo-?code|Listing)\s*\d/i.test(head) ||
          /\b(?:Require|Ensure|Input|Output)\s*:/i.test(head) ||
          /\bend\s+(?:for|while|if|procedure|function)\b/i.test(text) ||
          (numerals >= 12 && numerals / Math.max(1, text.split(/\s+/).length) > 0.35);
        setSel({
          x: Math.min(window.innerWidth - 220, Math.max(220, r.left + r.width / 2)),
          y: r.top - 10,
          text,
          head: at == null ? null : sectionKeyAt(index, at),
          figNum: capM ? +(capM[1] || capM[2]) : null,
          tabular,
        });
      }, 10);
    };
    const onDown = (e) => { if (!e.target.closest?.("[data-pdfr-assist]")) setSel(null); };
    stage.addEventListener("mouseup", onUp);
    document.addEventListener("mousedown", onDown);
    return () => { stage.removeEventListener("mouseup", onUp); document.removeEventListener("mousedown", onDown); };
  }, [open, doc, index, page]);

  /* Which actions this selection offers — driven by the paper's own section.
   * `chat` and `copy` are always last; they work anywhere. */
  const selActions = useMemo(() => {
    const base = (SECTION_ACTIONS[sel?.head] || DEFAULT_ACTIONS).filter((k) => {
      if (k === "evidence") return (spec?.resultFigures || []).length > 0;
      if (k === "panel") return !!onBuildPanel;
      return true;
    });
    // Selecting a caption puts the figure first: it is what the reader was
    // looking at, and the generic "explain this passage" is the weaker answer.
    const capFig = sel?.figNum != null && figByNum.has(sel.figNum);
    if (capFig) return ["figure", ...base.filter((k) => k !== "panel")];
    // A table or an algorithm listing is the most panel-able thing in a paper
    // — it is already the numbers or already the steps — so it gets the offer
    // wherever it appears, not only in the sections that carry `panel`.
    if (sel?.tabular && onBuildPanel) return ["table", ...base.filter((k) => k !== "panel")];
    return base;
  }, [sel?.head, sel?.figNum, sel?.tabular, spec, onBuildPanel, figByNum]);

  /* Highlighting and clipping are offered everywhere, after the
   * section-specific actions: neither is something one part of a paper needs
   * more than another, and neither costs anything. */
  const alwaysActions = [onHighlight ? "highlight" : null, onKeep ? "keep" : null].filter(Boolean);

  const runAction = useCallback((key) => {
    if (!sel) return;
    // PDF lines break words with a hyphen; heal them so the model sees prose
    const clean = sel.text.replace(/(\w)-\s+(\w)/g, "$1$2");
    const quote = clean.length > 900 ? `${clean.slice(0, 900)}…` : clean;
    const done = () => { setSel(null); window.getSelection()?.removeAllRanges(); };

    // Mark it, on the page, in the reader's own colour. Stored as the raw
    // selection (not the hyphen-healed quote) because it has to be matched
    // back against the document's text to be drawn.
    if (key === "highlight") {
      onHighlight?.({
        quote: sel.text, page,
        sectionLabel: HEAD_LABEL[sel.head] || "the paper",
      });
      done();
      return;
    }

    // The one action that spends real credit. The workspace owns the cap, the
    // confirmation and the notebook; the reader just hands over the passage
    // and where in the paper it came from.
    if (key === "panel") {
      onBuildPanel?.({ quote, page, sectionLabel: HEAD_LABEL[sel.head] || "this part of the paper" });
      done();
      return;
    }

    /* Same builder, different handling of the text.
     *
     * Two things would corrupt a table or a listing on the way through the
     * generic path. The hyphen-healing that turns "informa- tion" back into
     * "information" also turns "Loafers- 5.4" into "Loafers5.4", welding a
     * label onto a number; and the 900-character clip that is plenty for a
     * sentence cuts a table off mid-row. So this branch sends the raw
     * selection, at the server's own 2,000-character limit. */
    if (key === "panel-table") {
      const raw = sel.text.length > 1800 ? `${sel.text.slice(0, 1800)}…` : sel.text;
      onBuildPanel?.({
        quote: raw,
        page,
        sectionLabel:
          `a table or algorithm listing on page ${page}` +
          (sel.head ? ` (${HEAD_LABEL[sel.head] || "the paper"})` : "") +
          ". These are the paper's OWN numbers or its OWN steps — build the panel on them directly " +
          "rather than inventing a model, and keep the paper's units and row labels.",
      });
      done();
      return;
    }

    if (key === "keep") {
      onKeep?.({ quote, page, sectionLabel: HEAD_LABEL[sel.head] || "the paper" });
      done();
      return;
    }

    // A selected caption opens the figure's own card — the same one the
    // in-text "Fig. 4" opens, so there is one place a figure ever lives.
    if (key === "figure") {
      const fig = figByNum.get(sel.figNum);
      if (fig) {
        setCard({ at: { x: sel.x, y: sel.y }, kind: "figure", label: fig.label, payload: { ...fig, citing: quote } });
      }
      done();
      return;
    }

    // Claim → evidence, resolved locally against the paper's own figures. If
    // no figure matches convincingly, say so instead of pointing anywhere.
    if (key === "evidence") {
      const hit = matchEvidence(spec, quote);
      setCard({
        at: { x: sel.x, y: sel.y },
        kind: hit ? "figure" : "no-evidence",
        label: hit ? (hit.fig.figureLabel || "Evidence") : "No figure matched",
        payload: hit
          ? { label: hit.fig.figureLabel, title: hit.fig.title, explanation: hit.fig.explanation,
              image: hit.fig.image, page: hit.fig.page, citing: quote }
          : { citing: quote },
      });
      done();
      return;
    }

    if (!onAsk) return;
    const payload = { sectionId: sectionId || "story", title: section?.title || "The paper" };
    if (key === "chat") payload.initialDraft = `About this passage on page ${page}: “${quote}”\n\nMy question: `;
    else payload.initialAsk = ACTIONS[key]?.ask?.(quote, page);
    if (!payload.initialAsk && !payload.initialDraft) return;
    onAsk(payload);
    done();
  }, [sel, onAsk, onBuildPanel, onKeep, onHighlight, spec, page, sectionId, section?.title, figByNum]);

  if (!open) return null;

  const c = toneOf(tone);
  const activeMark = marks[markIdx]?.page === page ? marks[markIdx].key : -1;

  return (
    <div
      /* Inline, the reader fills whatever height its owner gives it (the
         workspace makes the paper view a fixed-height app shell) rather than
         guessing at `100vh − chrome`, which was always either short — leaving
         a page-level scrollbar under it — or too tall. */
      className={inline
        ? "relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl"
        : "fixed inset-0 z-[60] flex flex-col bg-slate-950/94 backdrop-blur-sm"}
      // Marks the reader's whole subtree so the workspace's own selection chip
      // stands down inside it — the reader has a richer assist bar for the same
      // gesture, and two popups fighting over one selection is not a feature.
      data-paper-reader=""
      {...(inline
        ? { "aria-label": `The paper — ${title || "PDF"}` }
        : { role: "dialog", "aria-modal": true, "aria-label": `Full paper — ${title || "PDF"}` })}
    >

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
          {/* Fit is the primary control and zoom is the escape hatch, not the
              other way round: the reason to touch this at all is "show me the
              whole page", and that is one button, not a hunt for the right
              percentage. */}
          <div className="mr-1 flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 px-1 py-0.5">
            <button onClick={() => setFit("height")} title="Fit the whole page (0)"
              className={`rounded p-1 transition hover:bg-white/10 ${fit === "height" ? "bg-white/10 text-cyan-300" : "text-slate-300 hover:text-white"}`}>
              <Scan size={15} />
            </button>
            <button onClick={() => setFit("width")} title="Fit the page width"
              className={`rounded p-1 transition hover:bg-white/10 ${fit === "width" ? "bg-white/10 text-cyan-300" : "text-slate-300 hover:text-white"}`}>
              <ScanLine size={15} />
            </button>
            <span className="mx-0.5 h-4 w-px bg-white/10" />
            <button onClick={() => stepZoom(-0.2)} title="Zoom out (−)"
              className="rounded p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"><ZoomOut size={15} /></button>
            <span className="w-10 text-center text-[11px] font-medium tabular-nums text-slate-300">
              {Math.round((scale / BASE_SCALE) * 100)}%
            </span>
            <button onClick={() => stepZoom(0.2)} title="Zoom in (+)"
              className="rounded p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"><ZoomIn size={15} /></button>
          </div>
          <button onClick={() => setGuide((g) => !g)} title="How to read this"
            className={`rounded-lg p-1.5 transition hover:bg-white/10 hover:text-white ${guide ? "text-cyan-300" : "text-slate-300"}`}>
            <HelpCircle size={16} />
          </button>
          <a href={url} download title="Download the PDF"
            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"><Download size={16} /></a>
          {/* Inline there is no overlay to dismiss — the paper IS the page. */}
          {!inline && (
            <button onClick={onClose} title="Close (Esc)"
              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"><X size={18} /></button>
          )}
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
                  {hlPages.has(p) && (
                    <span className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-300 ring-2 ring-slate-900"
                      title="You highlighted something on this page" />
                  )}
                  <div className={`mt-1 text-center text-[10px] font-semibold tabular-nums ${active ? "text-cyan-300" : "text-slate-400"}`}>{p}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* stage — `overflow-auto` still applies, but in fit mode there is
            nothing to scroll: the page is sized to what's here. */}
        <div ref={stageRef} className="relative flex min-w-0 flex-1 justify-center overflow-auto p-2 sm:p-3">
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
                hotspots={pageSpots}
                userMarks={userMarks}
                onHotspot={(h, at) => {
                  setSel(null);
                  setCard(h.kind === "highlight"
                    ? { at, kind: "highlight", label: "Highlight", payload: h }
                    : { at, kind: h.kind, label: h.label, payload: h.payload });
                }}
              />
            </div>
          )}

          {/* Floating page arrows are `fixed`, i.e. positioned against the
              VIEWPORT — correct for a fullscreen overlay, wrong for an inline
              pane, where they would hover over unrelated page content. Inline
              readers page with the bottom bar's pager or the ← → keys. */}
          {doc && !loadErr && !inline && (
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

      {/* ---- how to read this: three lines, once ---- */}
      {guide && doc && !loadErr && (
        /* Bottom LEFT: the workspace parks its floating pins bottom-right, and
           two stacks of chrome in one corner read as one broken panel. */
        <div className="pp-rise absolute bottom-14 left-4 z-[3] w-[268px] rounded-xl border border-white/15 bg-slate-900/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center gap-1.5">
            <HelpCircle size={13} className="text-cyan-300" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Reading this paper</span>
            <button onClick={() => { setGuide(false); localStorage.setItem(GUIDE_KEY, "1"); }}
              aria-label="Dismiss" className="ml-auto rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-white">
              <X size={13} />
            </button>
          </div>
          <ul className="space-y-1.5 text-[11.5px] leading-snug text-slate-300">
            {marks.length > 0 && (
              <li className="flex gap-2">
                <span className="mt-1 h-2.5 w-4 shrink-0 rounded-sm" style={{ background: c.soft, outline: `1px solid ${c.ring}66` }} />
                <span>Coloured text = the passages “{section?.title || "this section"}” was built from.</span>
              </li>
            )}
            <li className="flex gap-2">
              <MousePointerClick size={13} className="mt-0.5 shrink-0 text-indigo-300" />
              <span>Select any words — what’s offered depends on the section you’re in.</span>
            </li>
            <li className="flex gap-2">
              <Highlighter size={13} className="mt-0.5 shrink-0 text-amber-300" />
              <span>Select → <strong className="text-white">Highlight</strong> marks the page and stays there. Click a mark to recolour or remove it.</span>
            </li>
            {pageSpots.length > 0 && (
              <li className="flex gap-2">
                <span className="mt-1 h-2.5 w-4 shrink-0 rounded-sm" style={{ background: "rgba(99,102,241,0.35)", boxShadow: "inset 0 -1.5px 0 rgba(129,140,248,0.9)" }} />
                <span>Tinted <strong className="text-white">[refs]</strong>, <strong className="text-white">Fig.</strong> and <strong className="text-white">Eq.</strong> mentions open where you are — no scrolling away.</span>
              </li>
            )}
            <li className="flex gap-2">
              <ArrowLeftRight size={13} className="mt-0.5 shrink-0 text-slate-400" />
              <span>← → turn pages, <strong className="text-white">0</strong> fits the whole page{marks.length > 0 ? <>, <strong className="text-white">n</strong> jumps to the next passage</> : null}{inline ? "." : " · Esc closes."}</span>
            </li>
          </ul>
          <button onClick={() => { setGuide(false); localStorage.setItem(GUIDE_KEY, "1"); }}
            className="mt-2.5 w-full rounded-lg bg-white/10 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/20">
            Got it
          </button>
        </div>
      )}

      {/* ---- selection assist bar ----
       * PORTALLED to <body>. Its coordinates come from getBoundingClientRect,
       * i.e. the viewport — but `position: fixed` only means "the viewport"
       * while no ancestor creates a containing block, and inline the reader
       * lives inside an animated, overflow-hidden section that does. Rendered
       * in place it was in the DOM and simply never visible. A portal makes
       * the positioning independent of wherever the reader is mounted. */}
      {sel && onAsk && createPortal(
        <div
          data-pdfr-assist=""
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={{ position: "fixed", left: sel.x, top: Math.max(56, sel.y), transform: "translate(-50%, -100%)", zIndex: 75 }}
        >
          <div className="pp-rise flex max-w-[92vw] flex-wrap items-center justify-center gap-0.5 rounded-xl border border-indigo-300/60 bg-slate-900/95 p-1 shadow-2xl backdrop-blur">
            {[...selActions, ...alwaysActions].map((k) => {
              const a = ACTIONS[k];
              return <AssistBtn key={k} icon={a.icon} label={a.label} primary={a.primary} onClick={() => runAction(k)} />;
            })}
            <AssistBtn icon={MessageCircle} label="Ask…" onClick={() => runAction("chat")} />
            <span className="mx-0.5 h-5 w-px bg-white/15" />
            <AssistBtn
              icon={copied ? Check : Copy}
              label={copied ? "Copied" : "Copy"}
              onClick={() => { navigator.clipboard?.writeText(sel.text).then(() => setCopied(true)).catch(() => {}); }}
            />
          </div>
        </div>,
        document.body
      )}

      {/* ---- cross-reference card ---- */}
      {card && createPortal(
        <XrefCard
          card={card}
          paperTitle={spec?.meta?.title}
          spec={spec}
          onClose={() => setCard(null)}
          onAsk={onAsk ? (ask) => {
            onAsk({ sectionId: sectionId || "story", title: section?.title || "The paper", initialAsk: ask });
            setCard(null);
          } : null}
          onGoToPage={(p) => { setCard(null); go(p); }}
          onBuildPanel={onBuildPanel ? (req) => { setCard(null); onBuildPanel({ ...req, page }); } : null}
          onRecolor={onHighlight ? (h, color) => onHighlight({ quote: h.quote, page: h.page, sectionLabel: h.sectionLabel, color }) : null}
          onRemoveHighlight={onUnhighlight ? (h) => { setCard(null); onUnhighlight(h.id); } : null}
        />,
        document.body
      )}

      {/* ---- bottom bar: page counter + what the highlight means ---- */}
      {doc && !loadErr && (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-white/10 bg-slate-900/85 px-4 py-2">
          {/* Typing the page number is how you get to page 15 without a second
              scrolling surface — the thumbnail rail is now opt-in. */}
          <span className="flex items-center gap-1">
            <button onClick={prev} disabled={page <= 1}
              className="rounded-lg px-2 py-1 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <span className="flex items-center gap-1.5 text-[12px] font-medium tabular-nums text-slate-400">
              <input
                type="number" min={1} max={numPages} value={page}
                onChange={(e) => { const n = +e.target.value; if (Number.isInteger(n)) go(n); }}
                aria-label={`Page number, 1 to ${numPages}`}
                className="w-12 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-center text-[12px] font-semibold tabular-nums text-white outline-none transition focus:border-cyan-400/60"
              />
              of {numPages}
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

/**
 * The original fullscreen reader, unchanged for every existing call site: a
 * thin wrapper that pins PaperReader into its overlay shell.
 */
export default function PdfReader(props) {
  return <PaperReader {...props} variant="modal" />;
}

/* ---------------- the cross-reference card ----------------
 * Shown where the pointer was mentioned, so following "[12]" or "Fig. 3"
 * costs no scrolling and no lost place. Every field is the paper's own: the
 * citing sentence and bibliography entry are read out of the document, the
 * figure is the crop already taken from its page, the equation is what the
 * analysis extracted from the methods. Nothing here is generated on the fly —
 * the one model call is the optional "why here?" button, which the reader asks
 * for explicitly.
 */
/**
 * One short, cached, plain-language answer to "why is this cited HERE?".
 *
 * Fired the moment a citation card opens rather than behind a button: it is
 * the question the click was asking, and making it a second click meant most
 * readers never got the answer. It runs on the free Haiku tutor endpoint, is
 * capped to a couple of sentences, and is memoised per (reference numbers +
 * citing sentence) so re-opening the same marker costs nothing at all.
 */
const WHY_CACHE = new Map();

function useWhyCited({ entries, citing, paperTitle, spec, enabled }) {
  const key = enabled && citing && entries?.length
    ? `${entries.map((e) => e.n).join(",")}|${citing.slice(0, 120)}`
    : null;
  const [state, setState] = useState(() => (key && WHY_CACHE.has(key) ? { text: WHY_CACHE.get(key) } : {}));

  useEffect(() => {
    if (!key) { setState({}); return undefined; }
    if (WHY_CACHE.has(key)) { setState({ text: WHY_CACHE.get(key) }); return undefined; }
    let dead = false;
    setState({ loading: true });
    askSectionAssistant({
      paperTitle: paperTitle || "this paper",
      sectionTitle: "References",
      context: buildSectionContext(spec, "story"),
      messages: [{
        role: "user",
        content:
          `In the paper, this sentence:\n“${citing}”\n\ncites:\n` +
          entries.map((e) => `[${e.n}] ${e.text}`).join("\n") +
          `\n\nIn AT MOST two sentences, say what that cited work contributes at exactly this ` +
          `point — what it is being leaned on FOR. No preamble, no restating the sentence, ` +
          `no bullet points. If the citing sentence doesn't make the reason clear, say so in one line.`,
      }],
    })
      .then((text) => {
        if (dead) return;
        WHY_CACHE.set(key, text.trim());
        setState({ text: text.trim() });
      })
      .catch((e) => {
        // Not signed in is not a failure to report as one — the card is still
        // complete without it, because the paper's own citing sentence is
        // right below and that is the primary source anyway.
        if (!dead) setState({ error: e?.code === "auth" ? "auth" : "failed" });
      });
    return () => { dead = true; };
  }, [key, citing, entries, paperTitle, spec]);

  return state;
}

function XrefCard({
  card, onClose, onAsk, onGoToPage, onBuildPanel, onRecolor, onRemoveHighlight,
  paperTitle, spec,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onDown = (e) => { if (!e.target.closest?.("[data-xref-card]")) onClose(); };
    window.addEventListener("keydown", onKey);
    // `click`, not `mousedown`: the page click that OPENED this card is still
    // travelling, and closing on mousedown would shut it in the same gesture.
    document.addEventListener("click", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("click", onDown); };
  }, [onClose]);

  const p = card.payload || {};
  const W = 380;
  const bib = useMemo(
    () => (card.kind === "citation" ? (p.entries || []).map((e) => ({ ...e, parsed: parseBibEntry(e.text) })) : []),
    [card.kind, p.entries]
  );
  const why = useWhyCited({
    entries: p.entries, citing: p.citing, paperTitle, spec,
    enabled: card.kind === "citation",
  });
  // Keep the card on screen: clamp horizontally, and flip below the reference
  // when there isn't room above it.
  const left = Math.min(Math.max(W / 2 + 8, card.at.x), window.innerWidth - W / 2 - 8);
  const above = card.at.y > 320;

  const Head = ({ icon: Icon, children }) => (
    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-300">
      <Icon size={12} /> {children}
      <button onClick={onClose} aria-label="Close"
        className="ml-auto rounded p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white">
        <X size={13} />
      </button>
    </div>
  );

  return (
    <div
      data-xref-card=""
      style={{
        position: "fixed", left, top: above ? card.at.y - 10 : card.at.y + 26,
        transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
        width: W, zIndex: 80,
      }}
    >
      <div className="pp-rise max-h-[62vh] overflow-y-auto rounded-xl border border-indigo-300/50 bg-slate-900/97 p-3 text-slate-200 shadow-2xl backdrop-blur">
        {/* Everything a reader wanted from clicking "[1]", in one card and with
            no second click: WHICH paper (title), WHO wrote it (short form), and
            WHY it is here. The raw entry is kept only when the split into
            fields wasn't confident — a mis-cut title is worse than a dense one. */}
        {card.kind === "citation" && (
          <>
            <Head icon={BookMarked}>Reference {card.label}</Head>
            <ul className="space-y-2">
              {bib.map(({ n, text, parsed }) => (
                <li key={n} className="flex gap-1.5">
                  <span className="mt-px shrink-0 text-[11px] font-bold text-indigo-300">[{n}]</span>
                  {parsed.ok ? (
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold leading-snug text-white">{parsed.title}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {parsed.authorsShort}
                        {parsed.venue ? <> · <span className="italic">{parsed.venue}</span></> : null}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11.5px] leading-snug text-slate-300">{text}</span>
                  )}
                </li>
              ))}
            </ul>

            {p.citing && (
              <div className="mt-2.5 border-t border-white/10 pt-2">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Why it’s cited here
                </div>
                {why.text ? (
                  <p className="text-[11.5px] leading-snug text-slate-200">{why.text}</p>
                ) : why.error ? (
                  <p className="text-[11.5px] leading-snug text-slate-500">
                    {why.error === "auth"
                      ? "Sign in (free) for the one-line version. Until then, the paper’s own words:"
                      : "Couldn’t summarise this one. The paper’s own words:"}
                  </p>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
                    <Loader2 size={12} className="animate-spin text-indigo-300" /> Reading the sentence…
                  </div>
                )}
                <p className="mt-1.5 border-l-2 border-indigo-400/40 pl-2 text-[10.5px] italic leading-snug text-slate-500">
                  {p.citing}
                </p>
              </div>
            )}
          </>
        )}

        {/* The reader's own mark: recolour it or take it off. Nothing else
            belongs here — a highlight is a gesture, not a document. */}
        {card.kind === "highlight" && (
          <>
            <Head icon={Highlighter}>Your highlight</Head>
            <p className="mb-2.5 text-[11.5px] leading-snug text-slate-300">
              {p.quote?.length > 260 ? `${p.quote.slice(0, 260)}…` : p.quote}
            </p>
            <div className="flex items-center gap-1.5">
              {onRecolor && HL_COLORS.map((c) => (
                <button key={c.key} onClick={() => onRecolor(p, c.key)} title={c.label}
                  aria-label={`Recolour ${c.label}`}
                  className={`h-6 w-6 rounded-full border-2 transition hover:scale-110 ${
                    p.color === c.key ? "border-white" : "border-white/20"
                  }`}
                  style={{ background: c.dot }} />
              ))}
              {onRemoveHighlight && (
                <button onClick={() => onRemoveHighlight(p)}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-300 transition hover:border-red-400/50 hover:text-red-300">
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
          </>
        )}

        {card.kind === "figure" && (
          <>
            <Head icon={Quote}>{p.label || card.label}</Head>
            {p.image && (
              <img src={p.image} alt={p.title || card.label}
                className="mb-2 w-full rounded-lg border border-white/10 bg-white" />
            )}
            {p.title && <div className="mb-1 text-[12.5px] font-semibold text-white">{p.title}</div>}
            {p.explanation && (
              <p className="text-[11.5px] leading-snug text-slate-300">
                {p.explanation.length > 420 ? `${p.explanation.slice(0, 420)}…` : p.explanation}
              </p>
            )}
            {/* A figure is where a reader most often wants to stop reading and
                start turning dials — so the live version is offered HERE,
                against this figure, instead of living in a section they have to
                go and find. It is generated on demand and it costs, so it says
                so on the button. */}
            <div className="mt-2.5 flex flex-col gap-1.5">
              {onAsk && (
                <button
                  onClick={() => onAsk(
                    `Explain ${p.label || "this figure"} from the paper${p.title ? ` (“${p.title}”)` : ""} in plain language: ` +
                    `what is on each axis, what the reader is supposed to SEE in it, and what it proves. ` +
                    (p.explanation ? `The analysis says: “${p.explanation}”.` : "")
                  )}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-indigo-500">
                  <Sparkles size={13} /> Explain this figure
                </button>
              )}
              {onBuildPanel && (
                <button
                  onClick={() => onBuildPanel({
                    quote:
                      `${p.label || "Figure"}${p.title ? ` — ${p.title}` : ""}\n` +
                      (p.explanation || "") +
                      (p.citing ? `\nThe paper says about it: “${p.citing}”` : ""),
                    sectionLabel: `${p.label || "a figure"} — the paper's own result figure`,
                  })}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-300/50 bg-indigo-500/10 py-1.5 text-[11.5px] font-semibold text-indigo-200 transition hover:bg-indigo-500/20 hover:text-white">
                  <SlidersHorizontal size={13} /> Make it live (uses credit)
                </button>
              )}
              {Number.isInteger(p.page) && (
                <button onClick={() => onGoToPage(p.page)}
                  className="w-full rounded-lg border border-white/15 bg-white/5 py-1.5 text-[11.5px] font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white">
                  Go to page {p.page}
                </button>
              )}
            </div>
          </>
        )}

        {card.kind === "equation" && (
          <>
            <Head icon={Sigma}>{card.label}</Head>
            <div className="mb-2 rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-2 text-center text-[13px] text-cyan-200">
              {p.eq}
            </div>
            {p.name && <div className="mb-1 text-[12.5px] font-semibold text-white">{p.name}</div>}
            {p.plain && <p className="text-[11.5px] leading-snug text-slate-300">{p.plain}</p>}
            {(p.terms || []).length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {p.terms.map((t, i) => (
                  <li key={i} className="text-[11px] text-slate-400">
                    <span className="mr-1 font-semibold text-cyan-300">{t.sym}</span>{t.meaning}
                  </li>
                ))}
              </ul>
            )}
            {/* An equation the paper states is the most honest possible thing
                to put on sliders: it is the paper's own model with the paper's
                own coefficients, not a simulation of its experiment. */}
            {onBuildPanel && (
              <button
                onClick={() => onBuildPanel({
                  quote:
                    `${p.name || card.label}: ${p.eq}\n` +
                    (p.plain ? `${p.plain}\n` : "") +
                    ((p.terms || []).map((t) => `${t.sym} = ${t.meaning}`).join("; ")),
                  sectionLabel: `${card.label} — the paper's own equation`,
                })}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-indigo-500">
                <SlidersHorizontal size={13} /> Try it with your own numbers
              </button>
            )}
          </>
        )}

        {card.kind === "no-evidence" && (
          <>
            <Head icon={LineChart}>No figure matched</Head>
            {/* Honest degrade: pointing at the least-bad figure would be worse
                than admitting the sentence couldn't be tied to one. */}
            <p className="text-[11.5px] leading-snug text-slate-300">
              This sentence doesn’t line up clearly with any of the paper’s result figures, so
              nothing is being claimed as its evidence. It may be a general statement, or its
              support may live in a table rather than a figure.
            </p>
            {onAsk && (
              <button
                onClick={() => onAsk(`Which of this paper's own results — figure, table or reported number — actually supports this sentence: “${p.citing}”? If nothing in the paper directly supports it, say so plainly.`)}
                className="mt-2.5 w-full rounded-lg bg-indigo-600 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-indigo-500">
                Ask the tutor to look
              </button>
            )}
          </>
        )}
      </div>
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
