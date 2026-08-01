/**
 * Cross-references inside the paper's own text.
 *
 * Reading a paper on a screen, the most tedious manual job is chasing a
 * pointer: "[12]" means scrolling to the bibliography and back; "Fig. 3" means
 * hunting three pages forward and losing your place; "Eq. (2)" means the same.
 * This module finds those pointers in the real text and resolves each one to
 * something that can be shown WHERE IT IS MENTIONED, so the reader never
 * leaves the sentence they were on.
 *
 * Everything here is derived from the document itself (the index built by
 * pdfAnchors) plus the analysis spec. There is no model call and nothing is
 * invented: a citation card shows the paper's OWN citing sentence and its OWN
 * bibliography entry, and a figure card shows the crop we already took from
 * the page. When a pointer can't be resolved, it is dropped rather than
 * rendered as a dead or guessed link.
 */

import { rectsForSpan, tokenize } from "./pdfAnchors.js";

/* ---------------- what a pointer looks like in running text ----------------
 * Numeric citation styles only ("[12]", "[3, 5]", "[7–9]"). Author-year styles
 * ("(Smith et al., 2020)") are deliberately NOT matched: resolving them needs
 * name matching against the bibliography, which mis-fires on shared surnames,
 * and a wrong citation card is worse than none.
 */
const CITE_RE = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*(?:\s*[–—-]\s*\d{1,3})?)\]/g;

/* Superscript citations ("…decarbonized grid.14,15") carry no brackets at all,
 * so they are found by TYPOGRAPHY instead: a digit run set in noticeably
 * smaller type than the line it sits on. Nature, Science and Cell all use this
 * style, so skipping it would leave citation cards working on only about half
 * of real papers. */
const SUP_RUN_RE = /\d{1,3}(?:\s*[,;–—-]\s*\d{1,3})*/g;
const SUP_MAX_HEIGHT_RATIO = 0.8;
const FIG_RE = /\bFigs?\.?\s*(\d{1,2}[a-dA-D]?)\b|\bFigures?\s+(\d{1,2}[a-dA-D]?)\b/g;
const EQ_RE = /\bEqs?\.?\s*\(?(\d{1,2})\)?|\bEquations?\s+\(?(\d{1,2})\)?/g;

/** "3, 5" / "7–9" → [3,5] / [7,8,9]. Ranges are capped so a typo can't explode. */
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

/* ---------------- the paper's own bibliography ----------------
 * `spec.references` is the ANALYSIS's pick of up to a dozen important
 * references, in its own order — so `references[11]` is emphatically NOT
 * reference [12]. Mapping a citation number onto that array would attach
 * confident, wrong text to a card. The numbered entries are read out of the
 * document instead, which is the only source that actually knows what [12] is.
 */
function readBibliography(index) {
  const entries = new Map(); // number -> citation string
  if (!index?.pages?.length) return entries;

  // One string for the whole tail of the document, from wherever the
  // bibliography begins.
  const from = Number.isFinite(index.refsAt) ? index.refsAt : Infinity;
  let tail = "";
  for (const p of index.pages) {
    if (p.base + p.text.length < from) continue;
    tail += p.text + "\n";
  }
  if (!tail) return entries;

  /* Two numbering conventions, matching the two citation styles:
   *   "[12] A. Author, Title, Journal, 2021."   (bracketed, IEEE-ish)
   *   "12. Author, A. (2021). Title. Journal."  (line-numbered, Cell/Nature)
   * The second is only accepted at the start of a line, otherwise every "3."
   * in running prose would open a reference. */
  const patterns = [
    /\[(\d{1,3})\]\s*([\s\S]*?)(?=\n?\s*\[\d{1,3}\]|$)/g,
    /(?:^|\n)\s*(\d{1,3})\.\s+([\s\S]*?)(?=\n\s*\d{1,3}\.\s+|$)/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(tail))) {
      const n = +m[1];
      const text = m[2].replace(/\s+/g, " ").trim();
      // A plausible entry has an author and a title; a stray "[3]" inside a
      // formula, or "3." starting a numbered list, does not.
      if (text.length < 20 || text.length > 600) continue;
      if (!entries.has(n)) entries.set(n, text);
    }
    // The first convention that yields a real bibliography wins — running both
    // over the same text would let list numbering pollute real entries.
    if (entries.size >= 3) break;
  }
  return entries;
}

/* ---------------- resolving a pointer to something showable ---------------- */

/** Pull the figure number out of a label the analyzer wrote ("Fig. 6", "Fig. 1 — …"). */
function labelNum(s) {
  const m = String(s || "").match(/(\d{1,2})/);
  return m ? +m[1] : null;
}

/** Every figure we hold an image for, keyed by the paper's own figure number. */
function figureIndex(spec) {
  const byNum = new Map();
  const add = (num, fig) => {
    if (num == null || byNum.has(num)) return;
    byNum.set(num, fig);
  };
  for (const f of spec?.resultFigures || []) {
    add(labelNum(f.figureLabel), {
      label: f.figureLabel || `Fig. ${labelNum(f.figureLabel)}`,
      title: f.title, explanation: f.explanation, image: f.image, page: f.page,
    });
  }
  for (const f of spec?.conceptFigures || []) {
    add(labelNum(f.title), {
      label: (String(f.title).split(/[—–-]/)[0] || "").trim() || `Fig. ${labelNum(f.title)}`,
      title: f.title, explanation: f.explanation, image: f.image, page: f.page,
    });
  }
  return byNum;
}

/**
 * The governing equations, keyed by their EQUATION number — and only when the
 * analysis actually recorded one.
 *
 * `source` is free text ("Eq. (3), Sec. II.A", but also "JPoNG objective,
 * Methods / Fig. 5D"). Taking the first number in it would key that second
 * example as equation 5, so an in-text "Eq. 5" would confidently open the
 * wrong equation. Many papers number no equations at all; those simply get no
 * equation cards, which is the correct outcome.
 */
const EQ_SOURCE_RE = /\bEq(?:uation)?s?\.?\s*\(?\s*(\d{1,2})/i;

function equationIndex(spec) {
  const byNum = new Map();
  for (const e of spec?.model?.equations || []) {
    const m = EQ_SOURCE_RE.exec(e.source || "");
    if (!m) continue;
    const n = +m[1];
    if (byNum.has(n)) continue;
    byNum.set(n, e);
  }
  return byNum;
}

/* ---------------- locating text in the document ---------------- */

/**
 * Where a quoted passage sits in the document, as an absolute char offset.
 *
 * The DOM's selection string and the index's page text are built by different
 * code paths and disagree about whitespace, so both sides are compared with
 * ALL whitespace removed and the hit is mapped back to a real offset.
 * Returns null when the quote can't be found — the caller must degrade rather
 * than assume a position.
 */
export function locateQuote(index, pageNo, quote) {
  const p = index?.pages?.find((pg) => pg.page === pageNo);
  if (!p || !quote) return null;

  const map = [];           // stripped index -> original index
  let stripped = "";
  for (let i = 0; i < p.text.length; i++) {
    if (/\s/.test(p.text[i])) continue;
    map.push(i);
    stripped += p.text[i];
  }
  const needle = String(quote).replace(/\s+/g, "");
  if (needle.length < 4) return null;
  const at = stripped.indexOf(needle);
  if (at === -1) return null;
  return p.base + map[at];
}

/**
 * Which of the paper's own sections an absolute offset falls in
 * ("introduction" | "method" | "results" | "conclusion" | …), or null.
 *
 * Uses the same front-matter rule as the outline: a journal's first page is
 * full of heading-shaped labels (graphical abstract, "In brief", Highlights),
 * so nothing but the abstract counts before the Introduction.
 */
export function sectionKeyAt(index, absPos) {
  const heads = index?.headings || [];
  if (!heads.length || absPos == null) return null;
  const introAt = heads.find((h) => h.key === "introduction")?.pos ?? -Infinity;
  let key = null;
  for (const h of heads) {
    if (h.pos > absPos) break;
    if (h.key !== "abstract" && h.key !== "introduction" && h.pos < introAt) continue;
    key = h.key;
  }
  return key;
}

/**
 * Is the character range [start,end) on this page set as superscript?
 *
 * True when every glyph run backing it is meaningfully shorter than its own
 * line's height. Runs with no recorded height are treated as not-superscript,
 * so a missing measurement can never invent a citation.
 */
function isSuperscript(page, start, end) {
  let saw = false;
  for (let i = start; i < end && i < page.owner.length; i++) {
    // Only the DIGITS have to be raised. The separators in "14,15" are often
    // set in the body font, or belong to a different glyph run entirely, and
    // judging them too threw away most real multi-reference markers.
    if (!/\d/.test(page.text[i])) continue;
    const fi = page.owner[i];
    if (fi < 0) continue;                       // inserted whitespace
    const it = page.flat[fi];
    if (!it || !(it.ih > 0) || !(it.h > 0)) return false;
    if (it.ih > it.h * SUP_MAX_HEIGHT_RATIO) return false;
    saw = true;
  }
  return saw;
}

/**
 * Superscript digit runs that are plausibly citations.
 *
 * The dangerous confusion is maths: exponents and units are superscript too.
 * Two filters keep those out — the run must FOLLOW a word or sentence
 * punctuation rather than a bare symbol, and (in the caller) every number must
 * resolve to a real bibliography entry. `x²` fails the first test because a
 * single-letter word is not a word; "10⁻³" fails because a digit precedes it.
 */
function superscriptCites(page) {
  const out = [];
  SUP_RUN_RE.lastIndex = 0;
  let m;
  while ((m = SUP_RUN_RE.exec(page.text))) {
    const start = m.index, end = m.index + m[0].length;
    if (!isSuperscript(page, start, end)) continue;

    // What comes immediately before decides whether this reads as a citation.
    // One space may separate them: the index inserts a space wherever glyph
    // boxes leave a gap, and a raised marker often clears its neighbour by
    // enough to trigger that — requiring strict adjacency dropped most real
    // superscript citations.
    const before = page.text.slice(Math.max(0, start - 4), start).replace(/[ \t]$/, "");
    const prev = before.slice(-1);
    if (!prev || !/[A-Za-z.,;:)\]]/.test(prev)) continue;
    // A single-letter "word" before the run means it's almost certainly an
    // exponent or a variable's index, not a reference marker.
    if (/[A-Za-z]/.test(prev) && !/[A-Za-z]{2}$/.test(before)) continue;

    out.push({ start, end, raw: m[0] });
  }
  return out;
}

/* ---------------- claim → evidence ----------------
 * Highlight a sentence in the Results prose and ask which figure actually
 * backs it. Scored by term overlap against each result figure's own title and
 * explanation — no model call, so it is fast and free, and it can only ever
 * point at a figure the paper really has.
 *
 * The honesty rule matters more than the ranking: a weak best match is NOT a
 * match. Pointing confidently at the wrong figure is exactly the failure this
 * feature is supposed to prevent, so a thin winner returns null and the UI
 * says it couldn't tie the sentence to a figure.
 */
export function matchEvidence(spec, quote) {
  const figs = spec?.resultFigures || [];
  if (!figs.length || !quote) return null;

  const q = new Set(tokenize(quote));
  if (q.size < 3) return null;

  let best = null, runnerUp = 0;
  for (const f of figs) {
    const hay = new Set(tokenize(`${f.figureLabel || ""} ${f.title || ""} ${f.explanation || ""}`));
    let hits = 0;
    for (const t of q) if (hay.has(t)) hits++;
    const score = hits / q.size;
    if (!best || score > best.score) { runnerUp = best?.score || 0; best = { fig: f, score }; }
    else if (score > runnerUp) runnerUp = score;
  }

  // Needs real overlap AND a clear lead over the next figure; otherwise the
  // "evidence" is just the figure that happens to share common words.
  if (!best || best.score < 0.18 || best.score - runnerUp < 0.05) return null;
  return best;
}

/* ---------------- the scan ---------------- */

/**
 * Find every resolvable pointer in the document.
 *
 * Returns { byPage: Map<pageNumber, hotspot[]>, bibliography: Map<num,string> }
 * where a hotspot is { id, kind, page, rects, label, payload }. `rects` are
 * page fractions, ready to draw over the page exactly like a highlight.
 *
 * Unresolvable pointers are dropped: a "Fig. 9" we hold no crop for, an
 * equation the analysis never extracted, a citation with no bibliography
 * entry. A link that opens an empty card is worse than plain text.
 */
export function buildInlineRefs(index, spec) {
  const byPage = new Map();
  const bibliography = readBibliography(index);
  if (!index?.pages?.length) return { byPage, bibliography };

  const figs = figureIndex(spec);
  const eqs = equationIndex(spec);
  const refsAt = Number.isFinite(index.refsAt) ? index.refsAt : Infinity;

  /** The paper's own sentence containing this offset — the "why it's cited here". */
  const sentenceAt = (absPos) =>
    index.sentences.find((s) => absPos >= s.pos && absPos < s.pos + (s.end - s.start))?.text || null;

  let seq = 0;
  for (let pageIdx = 0; pageIdx < index.pages.length; pageIdx++) {
    const p = index.pages[pageIdx];
    const spots = [];

    const push = (start, end, kind, label, payload) => {
      const rects = rectsForSpan(index, pageIdx, start, end);
      if (!rects.length) return;
      spots.push({ id: `r${seq++}`, kind, page: p.page, rects, label, payload });
    };

    const scan = (re, handle) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(p.text))) {
        const abs = p.base + m.index;
        // Inside the bibliography these are entry numbers, not references to
        // follow, and every figure/equation word is part of a title.
        if (abs >= refsAt) break;
        handle(m, abs);
      }
    };

    /** Shared by both citation styles: resolve, or drop the marker entirely. */
    const pushCite = (start, end, raw, inner) => {
      const nums = expandNums(inner).filter((n) => bibliography.has(n));
      if (!nums.length) return;
      push(start, end, "citation", raw, {
        nums,
        entries: nums.map((n) => ({ n, text: bibliography.get(n) })),
        citing: sentenceAt(p.base + start),
      });
    };

    scan(CITE_RE, (m) => pushCite(m.index, m.index + m[0].length, m[0], m[1]));

    // Superscript style, for the many papers that use no brackets at all.
    if (p.base < refsAt) {
      for (const s of superscriptCites(p)) {
        if (p.base + s.start >= refsAt) break;
        pushCite(s.start, s.end, s.raw, s.raw);
      }
    }

    scan(FIG_RE, (m, abs) => {
      const n = labelNum(m[1] || m[2]);
      const fig = n == null ? null : figs.get(n);
      if (!fig?.image) return;   // no crop to show — leave it as plain text
      push(m.index, m.index + m[0].length, "figure", m[0], { ...fig, citing: sentenceAt(abs) });
    });

    scan(EQ_RE, (m, abs) => {
      const n = labelNum(m[1] || m[2]);
      const eq = n == null ? null : eqs.get(n);
      if (!eq) return;
      push(m.index, m.index + m[0].length, "equation", m[0], { ...eq, citing: sentenceAt(abs) });
    });

    if (spots.length) byPage.set(p.page, spots);
  }

  return { byPage, bibliography };
}
