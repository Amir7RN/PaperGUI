/**
 * The paper as TEXT — its own sections, in order, as things you can select.
 *
 * The rendered pages remain the primary reading surface: they are the real
 * document, with the real typography and the real figures. This is the peer
 * surface where the CONTENT is structure rather than pixels, and it exists
 * because three things are impossible on a page image and easy here:
 *
 *   - A table is a table. Rows, cells, a header — selectable, copyable, and
 *     hand-able to the panel builder as the paper's own numbers rather than as
 *     a JPEG for a model to squint at.
 *   - An algorithm keeps its steps and its indentation, in a <pre>, instead of
 *     being a picture of pseudocode.
 *   - A citation is a real button. On the page image the best that can be done
 *     is a chip drawn over the glyphs; here "[12]" is an actual control, with
 *     a focus ring and a cursor, which is what "obviously clickable" means.
 *
 * Everything rendered is the document's own text, extracted locally and free
 * (see paperText.js). Nothing here is generated, summarised or paraphrased, so
 * nothing here can disagree with the PDF.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles, SlidersHorizontal, MessageCircle, Copy, Check, NotebookPen,
  Table2, Braces, FileText, ChevronRight,
} from "lucide-react";
import { HEAD_LABEL } from "./pdfAnchors.js";

/* Citation markers in running text. Numeric styles only, exactly as
 * paperRefs.js does it for the page overlay — author-year styles need name
 * matching against the bibliography and a wrong citation card is worse than
 * none. */
const CITE_RE = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*(?:\s*[–—-]\s*\d{1,3})?)\]/g;

function expandNums(s) {
  const out = [];
  for (const part of String(s).split(/\s*[,;]\s*/)) {
    const range = part.match(/^(\d{1,3})\s*[–—-]\s*(\d{1,3})$/);
    if (range) {
      const a = +range[1], b = +range[2];
      if (b >= a && b - a <= 30) for (let n = a; n <= b; n++) out.push(n);
      continue;
    }
    const n = +part;
    if (Number.isInteger(n) && n > 0) out.push(n);
  }
  return out;
}

/**
 * A paragraph with its citations turned into real buttons.
 *
 * A marker only becomes a button when the bibliography actually has the entry
 * — an unresolvable "[9]" stays plain text rather than becoming a control that
 * opens an empty card.
 */
function Prose({ text, cites, bibliography, onCite }) {
  const parts = useMemo(() => {
    /* Two citation styles, one pass.
     *
     * "[12]" is found in the text. Superscript styles ("…grid.14,15") carry no
     * brackets at all and cannot be found in a string — they were identified
     * upstream by TYPOGRAPHY and arrive as character offsets. Nature, Science
     * and Cell all use the second one, so handling only the first would leave
     * references unclickable in about half of real papers. */
    const marks = [];
    CITE_RE.lastIndex = 0;
    let m;
    while ((m = CITE_RE.exec(text))) {
      const nums = expandNums(m[1]).filter((n) => bibliography?.has?.(n));
      if (nums.length) marks.push({ at: m.index, end: m.index + m[0].length, nums, label: m[0] });
    }
    for (const c of cites || []) {
      const nums = expandNums(c.raw).filter((n) => bibliography?.has?.(n));
      if (!nums.length) continue;
      if (marks.some((k) => c.at < k.end && c.end > k.at)) continue;  // overlaps a bracketed one
      marks.push({ at: c.at, end: c.end, nums, label: text.slice(c.at, c.end) || c.raw, sup: true });
    }
    marks.sort((a, b) => a.at - b.at);

    const out = [];
    let at = 0;
    for (const k of marks) {
      if (k.at < at) continue;
      if (k.at > at) out.push({ t: text.slice(at, k.at) });
      out.push({ cite: k.label, nums: k.nums, sup: k.sup });
      at = k.end;
    }
    if (at < text.length) out.push({ t: text.slice(at) });
    return out.length ? out : [{ t: text }];
  }, [text, cites, bibliography]);

  return (
    <p className="pp-prose">
      {parts.map((p, i) =>
        p.cite ? (
          <button
            key={i}
            type="button"
            className={p.sup ? "pp-cite pp-cite-sup" : "pp-cite"}
            title={`Reference ${p.cite} — look it up`}
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onCite?.({
                nums: p.nums,
                label: p.cite,
                at: { x: r.left + r.width / 2, y: r.top },
                // The sentence this marker sits in — the "why is it cited
                // HERE" half of the answer comes from it.
                citing: sentenceAround(text, i, parts),
              });
            }}
          >
            {p.cite}
          </button>
        ) : (
          <React.Fragment key={i}>{p.t}</React.Fragment>
        ),
      )}
    </p>
  );
}

/** The sentence a marker sits in, reassembled from the split parts. */
function sentenceAround(text, idx, parts) {
  const before = parts.slice(0, idx).map((p) => p.t || p.cite || "").join("");
  const start = Math.max(0, before.lastIndexOf(". ") + 1);
  const rest = text.slice(before.length);
  const stop = rest.search(/\.\s|$/);
  return text.slice(start, before.length + (stop < 0 ? rest.length : stop + 1)).trim();
}

/** The paper's own table, as a table. */
function TableBlock({ block }) {
  if (!block.rows) {
    /* We found the caption and the lines but could not resolve a grid. Saying
     * so beats rendering a one-column table that looks like a successful
     * extraction — and the lines themselves are still real, selectable text. */
    return (
      <figure className="pp-block">
        <figcaption className="pp-block-cap"><Table2 size={13} /> {block.caption}</figcaption>
        <pre className="pp-pre">{block.text}</pre>
        <p className="pp-block-note">
          The columns of this one couldn’t be reconstructed reliably, so it is shown as its lines.
          The page itself has it laid out properly.
        </p>
      </figure>
    );
  }
  const [head, ...body] = block.head ? [block.rows[0], ...block.rows.slice(1)] : [null, ...block.rows];
  return (
    <figure className="pp-block">
      {block.caption && <figcaption className="pp-block-cap"><Table2 size={13} /> {block.caption}</figcaption>}
      <div className="pp-table-wrap">
        <table className="pp-table">
          {head && (
            <thead>
              <tr>{head.map((c, i) => <th key={i}>{c}</th>)}</tr>
            </thead>
          )}
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Some of this paper's own glyphs had no Unicode mapping in its fonts —
          most often a minus sign. They are dropped rather than guessed at,
          because guessing turns −12.7 into 12.7 inside the paper's own
          numbers, silently. */}
      {block.glyphNote && (
        <p className="pp-block-note">
          A few characters in this table had no readable mapping in the paper’s fonts (usually a
          minus sign) and were left out rather than guessed. Check the signs against page {block.page}.
        </p>
      )}
    </figure>
  );
}

/** The paper's own algorithm, with its indentation intact. */
function AlgorithmBlock({ block }) {
  return (
    <figure className="pp-block">
      {block.caption && <figcaption className="pp-block-cap"><Braces size={13} /> {block.caption}</figcaption>}
      <pre className="pp-pre">{block.text}</pre>
    </figure>
  );
}

/* ---------------- the selection bar ---------------- */

const ACTIONS = [
  { key: "explain", label: "Explain", icon: Sparkles, primary: true },
  { key: "panel", label: "Build me a panel", icon: SlidersHorizontal },
  { key: "keep", label: "Keep this", icon: NotebookPen },
  { key: "chat", label: "Ask…", icon: MessageCircle },
];

/**
 * The paper's own text, section by section.
 *
 * @param paperText  { sections, bibliography } from buildPaperText
 * @param onBuildPanel/onAsk/onKeep  the same handlers the page reader uses, so
 *        a passage selected here and one selected there behave identically
 * @param onCite     opens the reference card for a clicked marker
 * @param estimate   a formatted price for one panel, shown ON the button —
 *        the reader should never have to guess what a click costs
 */
export default function SectionsView({
  paperText, onBuildPanel, onAsk, onKeep, onCite, onGoToPage, estimate,
}) {
  const rootRef = useRef(null);
  const [sel, setSel] = useState(null);
  const [copied, setCopied] = useState(false);
  const [openId, setOpenId] = useState(null);

  const sections = paperText?.sections || [];

  useEffect(() => {
    if (!openId && sections.length) setOpenId(sections[0].key || `s0`);
  }, [sections, openId]);

  /* Selection → the same assist bar the page reader shows. Deliberately the
   * same gestures and the same handlers: which surface a reader happened to be
   * on must not change what they can do with a sentence. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onUp = () => {
      setTimeout(() => {
        const s = window.getSelection();
        const text = s && String(s).replace(/\s+/g, " ").trim();
        if (!text || text.length < 3 || !s.rangeCount) { setSel(null); return; }
        const node = s.anchorNode?.nodeType === 1 ? s.anchorNode : s.anchorNode?.parentNode;
        if (!node || !root.contains(node)) { setSel(null); return; }
        const r = s.getRangeAt(0).getBoundingClientRect();
        if (!r.width && !r.height) { setSel(null); return; }
        setCopied(false);
        // Which block the selection started in — a table or an algorithm is
        // handed over as its own text, not as prose.
        const holder = node.closest?.("[data-block]");
        setSel({
          x: Math.min(window.innerWidth - 200, Math.max(200, r.left + r.width / 2)),
          y: r.top - 10,
          text,
          kind: holder?.dataset?.block || "para",
          page: +(holder?.dataset?.page || 0) || null,
          sectionKey: holder?.dataset?.section || null,
        });
      }, 10);
    };
    const onDown = (e) => { if (!e.target.closest?.("[data-sv-assist]")) setSel(null); };
    root.addEventListener("mouseup", onUp);
    document.addEventListener("mousedown", onDown);
    return () => { root.removeEventListener("mouseup", onUp); document.removeEventListener("mousedown", onDown); };
    /* Re-attach when the text lands.
     *
     * While the paper is still being read this component returns a placeholder
     * and `rootRef` is never attached to the real element — so a listener bound
     * once on mount is bound to nothing, and selecting text silently did
     * nothing at all. The text arriving is what creates the element to listen
     * on, so it is what this has to depend on. */
  }, [sections.length]);

  const run = useCallback((key) => {
    if (!sel) return;
    const done = () => { setSel(null); window.getSelection()?.removeAllRanges(); };
    const label = HEAD_LABEL[sel.sectionKey] || "the paper";

    /* A table or a listing goes through RAW and long.
     *
     * The hyphen-healing that turns "informa- tion" back into "information"
     * also welds "Loafers- 5.4" into "Loafers5.4", and the clip that is plenty
     * for a sentence cuts a table off mid-row. Both would silently corrupt the
     * one input that is genuinely exact. */
    const tabular = sel.kind === "table" || sel.kind === "algorithm";
    const clean = tabular ? sel.text : sel.text.replace(/(\w)-\s+(\w)/g, "$1$2");
    const limit = tabular ? 1800 : 900;
    const quote = clean.length > limit ? `${clean.slice(0, limit)}…` : clean;

    if (key === "keep") { onKeep?.({ quote, page: sel.page, sectionLabel: label }); done(); return; }

    if (key === "panel") {
      onBuildPanel?.({
        quote,
        page: sel.page,
        sectionLabel: tabular
          ? `a ${sel.kind === "table" ? "table" : "algorithm listing"} from ${label}` +
            ". These are the paper's OWN numbers or its OWN steps, extracted as text — build the panel " +
            "on them directly rather than inventing a model, and keep the paper's units and row labels."
          : label,
        sectionId: sel.sectionKey === "results" ? "results" : "model",
      });
      done();
      return;
    }

    if (key === "explain") {
      onAsk?.({
        sectionId: "story", title: "The paper",
        initialAsk:
          `Explain this passage from the paper${sel.page ? ` (page ${sel.page})` : ""} in plain language — ` +
          `assume I'm smart but new to this field. Lead with the everyday version, define any term you ` +
          `have to use, and add one concrete analogy if it helps: “${quote}”`,
      });
      done();
      return;
    }

    if (key === "chat") {
      onAsk?.({
        sectionId: "story", title: "The paper",
        initialDraft: `About this passage${sel.page ? ` on page ${sel.page}` : ""}: “${quote}”\n\nMy question: `,
      });
      done();
    }
  }, [sel, onAsk, onBuildPanel, onKeep]);

  if (!paperText) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-6 text-center text-[13px] text-slate-500">
        Reading the paper’s text…
      </div>
    );
  }
  if (!sections.length) {
    /* Heading detection genuinely fails on papers with unusual typography.
     * Admitting that beats rendering an empty structure as though we found
     * one — the page view has every word either way. */
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4 text-[13px] leading-relaxed text-amber-800">
        This paper’s section headings couldn’t be detected from its text layer, so there is no
        text outline to show. The page view has the whole document, and selecting text there works
        exactly the same way.
      </div>
    );
  }

  const open = sections.find((s, i) => (s.key || `s${i}`) === openId) || sections[0];

  return (
    <div ref={rootRef} className="pp-sections" data-paper-reader="">
      {/* The paper's own contents. Each entry is a section we actually found,
          never a structure we assumed. */}
      <nav className="mb-4 flex flex-wrap gap-1.5">
        {sections.map((s, i) => {
          const id = s.key || `s${i}`;
          const on = id === (open.key || `s${sections.indexOf(open)}`);
          return (
            <button key={id} type="button" onClick={() => setOpenId(id)}
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${
                on ? "border-transparent bg-slate-800 text-white shadow-sm"
                   : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}>
              {s.label}
              <span className={`ml-1.5 text-[10px] ${on ? "text-white/60" : "text-slate-400"}`}>
                p{s.page}
              </span>
            </button>
          );
        })}
      </nav>

      <article className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <header className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
            <FileText size={15} className="text-slate-400" /> {open.label}
          </h3>
          {onGoToPage && Number.isInteger(open.page) && (
            <button onClick={() => onGoToPage(open.page)}
              className="flex items-center gap-1 text-[11.5px] font-semibold text-indigo-600 transition hover:text-indigo-500">
              See it on page {open.page} <ChevronRight size={12} />
            </button>
          )}
        </header>

        {open.blocks.map((b, i) => (
          <div key={i} data-block={b.kind} data-page={b.page} data-section={open.key || ""}>
            {b.kind === "table" ? <TableBlock block={b} />
              : b.kind === "algorithm" ? <AlgorithmBlock block={b} />
                : b.kind === "figcaption" ? (
                  <p className="pp-figcap">{b.text}</p>
                ) : (
                  <Prose text={b.text} cites={b.cites} bibliography={paperText.bibliography} onCite={onCite} />
                )}
          </div>
        ))}

        {!open.blocks.length && (
          <p className="text-[13px] text-slate-500">
            No text was extracted for this section — it may be typeset as images.
          </p>
        )}
      </article>

      {/* The same assist bar, portalled for the same reason it is in the page
          reader: fixed positioning must be measured against the viewport, and
          an animated ancestor would otherwise become the containing block. */}
      {sel && createPortal(
        <div
          data-sv-assist=""
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={{ position: "fixed", left: sel.x, top: Math.max(56, sel.y), transform: "translate(-50%, -100%)", zIndex: 75 }}
        >
          <div className="pp-rise flex max-w-[92vw] flex-wrap items-center justify-center gap-0.5 rounded-xl border border-indigo-300/60 bg-slate-900/95 p-1 shadow-2xl backdrop-blur">
            {ACTIONS.map((a) => {
              if (a.key === "panel" && !onBuildPanel) return null;
              if (a.key === "keep" && !onKeep) return null;
              if ((a.key === "explain" || a.key === "chat") && !onAsk) return null;
              const Icon = a.icon;
              return (
                <button key={a.key} onClick={() => run(a.key)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
                    a.primary ? "bg-indigo-600 text-white hover:bg-indigo-500"
                              : "text-slate-200 hover:bg-white/10 hover:text-white"
                  }`}>
                  <Icon size={13} /> {a.label}
                  {/* The price rides on the one button that spends. */}
                  {a.key === "panel" && estimate && (
                    <span className="rounded bg-white/10 px-1 py-px text-[10px] font-bold text-indigo-200">
                      {estimate}
                    </span>
                  )}
                </button>
              );
            })}
            <span className="mx-0.5 h-5 w-px bg-white/15" />
            <button
              onClick={() => {
                const t = sel.kind === "table" || sel.kind === "algorithm" ? sel.text : sel.text;
                navigator.clipboard?.writeText(t).then(() => setCopied(true)).catch(() => {});
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** The whole bibliography, as chips. Free — it is the document's own list. */
export function ReferenceList({ bibliography, onCite }) {
  const entries = useMemo(
    () => [...(bibliography?.entries?.() || [])].sort((a, b) => a[0] - b[0]),
    [bibliography],
  );
  if (!entries.length) {
    return (
      <p className="text-[13px] text-slate-500">
        No numbered bibliography was detected in this paper’s text layer.
      </p>
    );
  }
  return (
    <ol className="space-y-1.5">
      {entries.map(([n, text]) => (
        <li key={n} className="flex gap-2">
          <button
            type="button"
            className="pp-cite mt-px shrink-0"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onCite?.({ nums: [n], label: `[${n}]`, at: { x: r.left + r.width / 2, y: r.top }, citing: null });
            }}
          >
            [{n}]
          </button>
          <span className="text-[12.5px] leading-snug text-slate-600">{text}</span>
        </li>
      ))}
    </ol>
  );
}
