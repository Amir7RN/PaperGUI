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
/** Does this read like a printed reference rather than a stray numbered line? */
const CITATION_SHAPED = /\b(?:19|20)\d{2}\b|\bet\s+al\b|\bdoi[:\s]|arxiv|\bpp?\.\s*\d|\bvol\.?\s*\d|[A-Z][\p{L}'’-]+,\s*[A-Z]\./iu;

function readBibliography(index) {
  const entries = new Map(); // number -> citation string
  if (!index?.pages?.length) return entries;

  /* One string for the tail of the document, cut at the exact offset the
   * bibliography starts.
   *
   * Cutting per PAGE rather than per character used to leave the end of the
   * conclusion in front of the reference list — and every in-text "[3]" in it
   * matched the entry pattern first. Because the first match for a number
   * wins, a citation marker in a sentence could take the slot belonging to the
   * real entry [3], which is how entries went missing while the count looked
   * plausible. */
  const from = Number.isFinite(index.refsAt) ? index.refsAt : Infinity;
  let tail = "";
  for (const p of index.pages) {
    const end = p.base + p.text.length;
    if (end < from) continue;
    tail += (from > p.base ? p.text.slice(from - p.base) : p.text) + "\n";
  }
  if (!tail) return entries;

  /* Two numbering conventions, matching the two citation styles:
   *   "[12] A. Author, Title, Journal, 2021."   (bracketed, IEEE-ish)
   *   "12. Author, A. (2021). Title. Journal."  (line-numbered, Cell/Nature)
   * The second is only accepted at the start of a line, otherwise every "3."
   * in running prose would open a reference.
   *
   * Whitespace is allowed INSIDE the brackets. pdf.js splits a line wherever
   * the glyph boxes leave a gap, and the index inserts a space at each split,
   * so a bibliography whose numbers are set with a little letter-spacing
   * arrives as "[ 12 ]" and matched nothing at all. */
  const patterns = [
    /\[\s*(\d{1,3})\s*\]\s*([\s\S]*?)(?=\n?\s*\[\s*\d{1,3}\s*\]|$)/g,
    /(?:^|\n)\s*(\d{1,3})\.\s+([\s\S]*?)(?=\n\s*\d{1,3}\.\s+|$)/g,
    // "(12) Author, …" — used by a minority of chemistry and materials titles.
    /(?:^|\n)\s*\(\s*(\d{1,3})\s*\)\s*([\s\S]*?)(?=\n\s*\(\s*\d{1,3}\s*\)|$)/g,
  ];

  /* Length bounds, loosened at both ends.
   *
   * A one-line entry ("[7] IEA, World Energy Outlook, 2023.") is 34 characters
   * but a "[53] Ibid., p. 14." is 14, and the old 20-character floor threw the
   * short ones away. At the other end a reference with a long DOI, a URL and
   * an access date runs well past 600, and the old ceiling dropped exactly the
   * data-set and standards citations that need the lookup most. */
  const MAX_ENTRY = 1400;
  const plausible = (t) => t.length >= 10 && t.length <= MAX_ENTRY;

  let best = null;
  for (const re of patterns) {
    const got = new Map();
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(tail))) {
      const n = +m[1];
      const text = m[2].replace(/\s+/g, " ").trim();
      if (text.length < 10) continue;
      if (!got.has(n)) got.set(n, text);
    }
    // The convention that finds the most entries wins outright — running them
    // together would let list numbering pollute a real bibliography.
    if (!best || got.size > best.size) best = got;
  }
  if (!best) return entries;

  /* THE LAST ENTRY HAS NOTHING AFTER IT TO STOP AT.
   *
   * Every entry is cut at the next "[n]" marker; the final one is cut at the
   * end of the text, so it absorbs whatever follows the reference list. In a
   * paper with an appendix after its references — which this pattern is common
   * enough to matter for — that is several thousand characters of prose, the
   * entry blows the length ceiling, and the paper's LAST reference is the one
   * that silently goes missing.
   *
   * Its real end is found by asking the other entries how long a reference is
   * in this paper, and trimming back to the last full stop inside that window.
   * References end in a full stop (a year, a page range, a DOI); the running
   * header and body prose that follow do not begin with one. */
  const lens = [...best.values()].map((t) => t.length).filter((n) => n <= MAX_ENTRY).sort((a, b) => a - b);
  const median = lens.length ? lens[lens.length >> 1] : 240;
  const window = Math.max(400, Math.min(MAX_ENTRY, median * 3));
  const trim = (t) => {
    if (t.length <= MAX_ENTRY) return t;
    const head = t.slice(0, window);
    const cut = head.lastIndexOf(". ");
    return cut > 40 ? head.slice(0, cut + 1) : null;
  };

  for (const [n, raw] of best) {
    const t = trim(raw);
    if (t && plausible(t)) entries.set(n, t);
  }

  /* Fill the gaps, conservatively.
   *
   * A numbered list is a contiguous run, so if the winning pattern found 52 of
   * 58 the six it missed are KNOWN by number — they are the holes below the
   * highest entry. Those specific numbers are re-cut with a looser rule (the
   * marker followed by anything up to the next marker, on any line, with no
   * shape assumptions), and a candidate is only accepted if it actually reads
   * like a citation. This can only ever ADD a numbered entry the reader can
   * see is missing; it cannot overwrite one that was already found. */
  const max = Math.max(...entries.keys());
  if (entries.size && max <= 400) {
    for (let n = 1; n <= max; n++) {
      if (entries.has(n)) continue;
      const re = new RegExp(
        `(?:\\[\\s*${n}\\s*\\]|(?:^|\\n)\\s*${n}[.)])\\s*([\\s\\S]{10,1400}?)` +
        `(?=\\[\\s*\\d{1,3}\\s*\\]|\\n\\s*\\d{1,3}[.)]\\s|$)`,
        "m",
      );
      const m = re.exec(tail);
      if (!m) continue;
      const text = m[1].replace(/\s+/g, " ").trim();
      if (plausible(text) && CITATION_SHAPED.test(text)) entries.set(n, text);
    }
  }

  return entries;
}

/* ---------------- reading a bibliography entry as fields ----------------
 * A citation card that dumps the raw entry makes the reader parse a wall of
 * abbreviations to answer the only two questions they had: which paper is this,
 * and who wrote it. So the entry is split into title / authors / venue — but
 * ONLY when the split is confident. `ok:false` means the caller must show the
 * raw entry rather than a confidently mis-cut one.
 */
const INITIALS_FIRST = /^(?:[A-Z]\.?\s*){1,4}[A-Z][\p{L}'’-]+(?:\s+(?:Jr|Sr|II|III|IV)\.?)?$/u;
const SURNAME_FIRST  = /^[A-Z][\p{L}'’-]+(?:\s+(?:van|von|de|der|del|di|da|el))?\s+(?:[A-Z]\.?\s*){1,4}$/u;
const BARE_SURNAME   = /^[A-Z][\p{L}'’-]+$/u;
const BARE_INITIALS  = /^(?:[A-Z]\.?\s*){1,4}$/;
/* What a venue segment looks like: a year, a "7 (1)" volume/issue, page range
 * or an explicit volume word. Digits alone are not enough — plenty of titles
 * contain a number. */
const VENUE_HINT = /\b(?:19|20)\d{2}\b|\b\d+\s*\(\d+\)|\bpp?\.\s*\d|\bvol\.?\s*\d|\bno\.?\s*\d/i;

const surnameOf = (author) => {
  const words = author.replace(/\s+/g, " ").trim().split(" ");
  const last = words[words.length - 1];
  // "Sadeghi AH" / "Sadeghi A.H." put the initials last; "A.H. Sadeghi" doesn't.
  return BARE_INITIALS.test(last) && words.length > 1 ? words[0] : last;
};

export function parseBibEntry(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  const fail = { ok: false, raw };
  if (raw.length < 12) return fail;

  const yearM = raw.match(/\b(19|20)\d{2}\b/g);
  const year = yearM ? yearM[yearM.length - 1] : null;

  const segs = raw.split(/\s*,\s*/).filter(Boolean);
  if (segs.length < 2) return fail;

  // 1) the leading run of author-shaped segments
  const authors = [];
  let i = 0;
  while (i < segs.length) {
    const s = segs[i].replace(/\.$/, "");
    if (INITIALS_FIRST.test(s) || SURNAME_FIRST.test(s)) { authors.push(s); i++; continue; }
    // "Sadeghi, A. H." — one author split across two comma segments.
    if (BARE_SURNAME.test(s) && i + 1 < segs.length && BARE_INITIALS.test(segs[i + 1].replace(/\.$/, ""))) {
      authors.push(`${s} ${segs[i + 1].replace(/\.$/, "")}`);
      i += 2; continue;
    }
    break;
  }
  if (!authors.length || i >= segs.length) return fail;

  // 2) the title runs until a segment that reads like a venue
  const titleParts = [];
  while (i < segs.length && !VENUE_HINT.test(segs[i])) { titleParts.push(segs[i]); i++; }
  const title = titleParts.join(", ").replace(/[.,;]\s*$/, "").trim();
  if (title.split(/\s+/).length < 3) return fail;

  const venue = segs.slice(i).join(", ").replace(/[.,;]\s*$/, "").trim();

  const first = surnameOf(authors[0]);
  const authorsShort =
    (authors.length === 1 ? first
      : authors.length === 2 ? `${first} & ${surnameOf(authors[1])}`
        : `${first} et al.`) + (year ? `, ${year}` : "");

  return { ok: true, raw, authors, authorsShort, title, venue, year };
}

/* ---------------- resolving a pointer to something showable ---------------- */

/** Pull the figure number out of a label the analyzer wrote ("Fig. 6", "Fig. 1 — …"). */
function labelNum(s) {
  const m = String(s || "").match(/(\d{1,2})/);
  return m ? +m[1] : null;
}

/**
 * Every figure we hold an image for, keyed by the paper's own figure number.
 *
 * `figIndex` is the position in `spec.resultFigures`, and it is what makes a
 * figure DIGITIZABLE: it is the handle "make this one live" writes its result
 * back through. Without it a figure card can explain a figure but cannot
 * reproduce it, which is the difference between a caption and a live plot —
 * so it is carried on every result figure regardless of which section of the
 * paper the figure happens to sit in.
 */
function figureIndex(spec) {
  const byNum = new Map();
  const add = (num, fig) => {
    if (num == null || byNum.has(num)) return;
    byNum.set(num, fig);
  };
  (spec?.resultFigures || []).forEach((f, idx) => {
    add(labelNum(f.figureLabel), {
      label: f.figureLabel || `Fig. ${labelNum(f.figureLabel)}`,
      title: f.title, explanation: f.explanation, image: f.image, page: f.page,
      bbox: f.bbox, figIndex: idx, panels: f.panels || [],
    });
  });
  for (const f of spec?.conceptFigures || []) {
    add(labelNum(f.title), {
      label: (String(f.title).split(/[—–-]/)[0] || "").trim() || `Fig. ${labelNum(f.title)}`,
      title: f.title, explanation: f.explanation, image: f.image, page: f.page,
      bbox: f.bbox,
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
function findQuoteSpan(index, pageNo, quote) {
  const pageIdx = index?.pages?.findIndex((pg) => pg.page === pageNo);
  if (pageIdx == null || pageIdx < 0 || !quote) return null;
  const p = index.pages[pageIdx];

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
  // The span is measured in the ORIGINAL text, so it has to end at the original
  // position of the needle's LAST character — not at start + needle.length,
  // which would stop short by however much whitespace the passage contains.
  const last = map[Math.min(at + needle.length - 1, map.length - 1)];
  return { page: p, pageIdx, start: map[at], end: last + 1 };
}

export function locateQuote(index, pageNo, quote) {
  const span = findQuoteSpan(index, pageNo, quote);
  return span ? span.page.base + span.start : null;
}

/**
 * Page-fraction rectangles covering a quoted passage — what a reader's own
 * highlight is drawn from.
 *
 * Deliberately re-derived from the text index at render time rather than
 * stored: a rectangle captured at 150% zoom sits in the wrong place at
 * fit-to-height, whereas the quote is true at every scale.
 */
export function quoteRects(index, pageNo, quote) {
  const span = findQuoteSpan(index, pageNo, quote);
  if (!span) return [];
  return rectsForSpan(index, span.pageIdx, span.start, span.end);
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

    /* `tight`: a cross-reference chip is drawn on the characters themselves,
     * not on the line box a highlight uses. See rectsForSpan. */
    const push = (start, end, kind, label, payload) => {
      const rects = rectsForSpan(index, pageIdx, start, end, { tight: true });
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

    /* THE FIGURE ITSELF IS A TARGET, not only the words "Fig. 3".
     *
     * A reader looking at a plot and wanting it live reaches for the plot.
     * Until now the only way in was an in-text mention, which meant a figure
     * whose number is never written out in prose — and, worse, every figure in
     * an appendix or a supplementary section, where the prose that mentions it
     * often isn't on the same page — had no way to be opened at all. The crop
     * box the analysis already recorded is exactly the region to make live, so
     * it is drawn as an outline over the figure on its own page.
     *
     * Added LAST on purpose: hit-testing walks this list in order, and a
     * figure-sized box would otherwise swallow the citation chips inside its
     * own caption.
     */
    for (const fig of figs.values()) {
      if (fig.page !== p.page) continue;
      const b = fig.bbox;
      if (!b || !(b.w > 0.02) || !(b.h > 0.02)) continue;
      spots.push({
        id: `r${seq++}`, kind: "figure", area: true, page: p.page,
        rects: [{
          x: Math.max(0, b.x), y: Math.max(0, b.y),
          w: Math.min(1 - Math.max(0, b.x), b.w), h: Math.min(1 - Math.max(0, b.y), b.h),
        }],
        label: fig.label,
        payload: { ...fig, citing: null },
      });
    }

    if (spots.length) byPage.set(p.page, spots);
  }

  return { byPage, bibliography };
}
