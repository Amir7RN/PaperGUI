/**
 * "Where in the real paper did this section come from?"
 *
 * Given the raw text geometry of every PDF page (from extractPageItems), this
 * builds a searchable index of the document — reading-order text, sentence
 * spans with their on-page boxes, and the paper's own section headings — and
 * then answers, for one section of the analysis, which page to open and which
 * sentences to highlight.
 *
 * The match is deliberately dumb-but-honest: no model call, no network. A
 * section's digest (the same text the chat assistant is grounded in) supplies
 * the query terms; they're weighted by how rare they are *inside this paper*,
 * so boilerplate ("system", "results") counts for little and the terms that
 * actually identify the passage carry the score. The paper's own headings give
 * a soft prior — the Story section is *probably* sourced from the
 * Introduction — but a strong match elsewhere can still win, which matters for
 * papers whose headings we fail to detect at all.
 *
 * Everything is normalized to page fractions, so a caller can draw highlights
 * at any zoom without re-running anything.
 */

/* ---------------- tokenizing ---------------- */

const STOP = new Set(
  `a an the and or but if then than that this these those of in on at to for from by with within without into over under between across as is are was were be been being it its we our us they their there here he she his her you your not no nor so too can could should would may might will shall do does did done have has had having each other others same such only own more most less least very much many few any all both some new novel paper work works method methods approach approaches result results show shows shown showed propose proposed present presented presents based given also however thus hence therefore where when which who while about above after again against because before below during further how once out through until up down off why also although though while whereas fig figs figure figures table tables section sections eq eqs equation equations ref refs et al ie eg cf vs via per one two three first second third case cases used using use uses different various several respectively well large small high low good better best value values set sets number numbers time times`
    .split(/\s+/)
);

/** Lowercase, de-hyphenate line breaks, strip punctuation for matching only. */
const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/-\s+/g, "");

export function tokenize(s) {
  const out = [];
  for (const w of normalize(s).split(/[^a-z0-9]+/)) {
    if (!w || w.length < 3 || STOP.has(w)) continue;
    if (/^\d+$/.test(w)) continue; // bare numbers match everything
    out.push(w);
  }
  return out;
}

/* ---------------- the paper's own headings ---------------- */

const HEADS = [
  ["abstract", /^abstract\b/i],
  ["introduction", /^introduction\b/i],
  ["related", /^(related work|background|preliminaries|prior work|literature|state of the art|fundamentals|motivation)\b/i],
  ["method", /^(method|methodolog|approach|proposed|model|modell?ing|formulation|framework|theory|theoretical|design|architecture|algorithm|problem statement|problem formulation|controller|control)\b/i],
  ["experiment", /^(experiment|experimental|implementation|simulation|setup|evaluation|materials|case stud|dataset|data collection|test)\b/i],
  ["results", /^(results?|discussion|performance|validation|comparison|ablation|findings|observations)\b/i],
  ["conclusion", /^(conclusion|concluding|summary|future work|outlook|final remarks)\b/i],
  ["refs", /^(references|bibliography|acknowledg|author contributions|declaration of|data availability|funding|conflicts? of interest|supplementary|supporting information)\b/i],
];

/* A bibliography cites the same rare words the paper uses, in short dense
 * lines — catnip for a term-overlap score. Anything that smells like a citation
 * is kept out of the running so a section never "comes from" the reference
 * list. */
const REF_SMELL = new RegExp(
  [
    /\[\d{1,3}\]\s*[A-Z]/,                    // "[12] A. Author"
    /\b[A-Z]\.\s*[A-Z]?\.?\s+[A-Z][a-z]+,/,   // "A. B. Smith,"
    /\bpp?\.\s*\d/, /\bvol\.\s*\d/, /\bno\.\s*\d/,
    /\bdoi[:.]\s*10\./, /https?:\/\//,
    /\bet al\.,\s*\d{4}/,
    /\(\s*(?:19|20)\d{2}\s*\)\s*[,.]?\s*\d/,  // "(2021), 110742"
    /\b[A-Z][a-z]{2,12}\.\s+\d{1,4}\s*\(/,    // "J. Forecast. 9 ("
    /\b(?:19|20)\d{2}\)\s*\d{2,4}\s*[–-]\s*\d{2,4}/, // page ranges
  ].map((r) => `(?:${r.source})`).join("|")
);

/**
 * Where the bibliography starts.
 *
 * The heading is the answer when we have one. The citation-smell scan below —
 * scanning from the end, the longest tail of sentences that is mostly
 * citations IS the reference list — exists for the papers whose "References"
 * heading we never saw, and it is a fallback rather than a correction.
 *
 * It used to run unconditionally and take whichever answer was EARLIER, which
 * quietly overrode a heading we had found. A discussion section that cites
 * heavily smells like a bibliography by this measure, so the boundary landed
 * several thousand characters early, inside the prose — and every in-text
 * "[58]" in that prose then matched the bibliography reader's entry pattern
 * and claimed the slot belonging to the real entry 58.
 */
function referencesStart(sentences, headingPos) {
  if (Number.isFinite(headingPos)) return headingPos;
  let start = Infinity;
  let smell = 0, total = 0;
  for (let i = sentences.length - 1; i >= 0; i--) {
    total++;
    if (sentences[i].ref) smell++;
    if (total >= 8 && smell / total >= 0.6) start = Math.min(start, sentences[i].pos);
  }
  return start;
}

/** A line of text -> canonical heading key, or null if it isn't a heading.
 *  Exported for paperText.js, which cuts the document into sections using the
 *  same rule the anchor index does — two heading detectors would drift. */
export function headingKey(raw) {
  let line = String(raw || "").trim();
  if (!line || line.length > 70) return null;

  /* Heal LaTeX small caps.
   *
   * `\textsc{Conclusion}` sets the C larger than the rest, so pdf.js reports
   * two runs with a real gap between them and the index — correctly — puts a
   * space there. The heading arrives as "V. C ONCLUSION", and every section
   * heading in an IEEE-template paper is typeset this way: Introduction,
   * Conclusion, Appendix, References. None of them were being detected, which
   * is not a cosmetic loss — "where do the references start" is what stops the
   * bibliography reader from scanning the Discussion and matching in-text
   * citation markers as though they were entries.
   *
   * Only a STANDALONE capital is glued to the all-caps word after it, so
   * "FTM AND GAIT" is untouched (its M is not a token of its own). */
  line = line.replace(/(^|\s)([A-Z])\s+([A-Z]{2,})/g, "$1$2$3");

  // drop leading numbering: "IV.", "3.", "3.1", "(2)"
  const clean = line
    .replace(/^[[(]?\s*(?:[ivxlcIVXLC]{1,6}|\d{1,2}(?:\.\d{1,2})*)\s*[.):\-–]?\s+/, "")
    .trim();
  if (!clean || clean.length > 48) return null;
  for (const [key, re] of HEADS) if (re.test(clean)) return key;
  return null;
}

/* ---------------- lines & columns ---------------- */

/**
 * Multi-column papers (IEEE two-column, Cell three-column) interleave in raw
 * content order, so before anything else we work out where the columns are and
 * read each one out completely before the next.
 *
 * Columns announce themselves as sharp peaks in the histogram of where text
 * *starts*: every body line in a column begins at the same left margin. Peaks
 * carrying at least a twentieth of the page's text, spaced far enough apart to
 * be different columns, become the column edges. One peak (or too little text
 * to tell) means one column, which is also the safe fallback.
 */
/**
 * Where lines actually START, which is not where text runs start.
 *
 * pdf.js splits a line at every style change, so one reference line —
 * `[12] A. Author, “A title,” Journal, 2021.` — arrives as six or seven runs
 * at six or seven different x positions, only the first of which is a margin.
 * Histogramming all of them buries the two real margins under the noise of
 * mid-line fragments, and on a page that is fragmented enough NO bin clears
 * the threshold, columns come back as "one column", and the two columns get
 * read interleaved line by line.
 *
 * That is not a hypothetical: it is what a two-column IEEE reference list does
 * — the most typographically chopped-up page in the paper — so the bibliography
 * came out as left-column entries with the right column's bare numbers spliced
 * between them, and roughly a tenth of the references were unrecoverable.
 *
 * A run starts a line when nothing on its own row ends just to its left. That
 * yields two x values per row on a two-column page: the two margins.
 */
function lineStartXs(items) {
  const rows = [];
  for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(it.y - last.y) <= Math.max(it.h, last.h) * 0.6) {
      last.items.push(it);
      last.y = Math.min(last.y, it.y);
      last.h = Math.max(last.h, it.h);
    } else {
      rows.push({ y: it.y, h: it.h, items: [it] });
    }
  }

  const xs = [];
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    let prevRight = -1;
    for (const it of row.items) {
      // A gap wider than a few characters means a new column, not a word space.
      if (prevRight < 0 || it.x - prevRight > 0.04) xs.push(it.x);
      prevRight = Math.max(prevRight, it.x + it.w);
    }
  }
  return xs;
}

function columnEdges(items) {
  if (items.length < 60) return null;
  const starts = lineStartXs(items);
  const total = starts.length;
  if (total < 20) return null;
  const B = 200;
  const hist = new Float64Array(B);
  for (const x of starts) hist[Math.min(B - 1, Math.max(0, Math.floor(x * B)))]++;
  // light smoothing so a margin that wobbles by a bin still reads as one peak
  const sm = new Float64Array(B);
  for (let i = 0; i < B; i++) sm[i] = (hist[i - 1] || 0) * 0.5 + hist[i] + (hist[i + 1] || 0) * 0.5;

  const peaks = [];
  const minMass = total * 0.05;
  const gap = 16; // 8% of the page width — closer than that is one margin
  for (let n = 0; n < 4; n++) {
    let bi = -1, bv = 0;
    for (let i = 0; i < B; i++) if (sm[i] > bv) { bv = sm[i]; bi = i; }
    if (bi < 0 || bv < minMass) break;
    peaks.push(bi / B);
    for (let i = Math.max(0, bi - gap); i <= Math.min(B - 1, bi + gap); i++) sm[i] = 0;
  }
  if (peaks.length < 2) return null;
  peaks.sort((a, b) => a - b);
  if (peaks[peaks.length - 1] - peaks[0] < 0.15) return null;
  return peaks;
}

function columnOf(items) {
  const edges = columnEdges(items);
  if (!edges) return () => 0;
  /* Split on the MIDPOINTS between margins, not on the margins themselves.
   *
   * Testing `x >= margin` with a fixed tolerance has to guess how far left of
   * its column a line may legitimately start, and a hanging indent — the `[12]`
   * of a reference, sitting a few percent left of the text it labels — is
   * exactly that case. Guess too small and every right-column reference number
   * is filed under the left column; guess too large and a narrow gutter
   * collapses. A midpoint needs no guess: columns are at least 15% of the page
   * apart, so nothing legitimate lands near one. */
  const mids = [];
  for (let i = 1; i < edges.length; i++) mids.push((edges[i - 1] + edges[i]) / 2);
  return (it) => {
    let c = 0;
    while (c < mids.length && it.x >= mids[c]) c++;
    return c;
  };
}

/** Items -> lines in reading order: [{ y, h, col, right, items: [...] }].
 *  Exported for paperText.js: reconstructing tables and algorithm listings
 *  needs the SAME lines the index was built from, with each run's own x/width
 *  still attached, and a second line-grouper would eventually disagree with
 *  this one about where a column starts. */
export function groupLines(items) {
  const col = columnOf(items);
  const keep = items.filter((it) => it.str.trim());
  const sorted = keep
    .map((it) => ({ ...it, col: col(it) }))
    .sort((a, b) => a.col - b.col || a.y - b.y || a.x - b.x);

  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    const near =
      last &&
      last.col === it.col &&
      Math.abs(it.y - last.y) <= Math.max(it.h, last.h) * 0.6 &&
      it.x + 0.02 >= last.right;
    if (near) {
      last.items.push(it);
      last.y = Math.min(last.y, it.y);
      last.h = Math.max(last.h, it.h);
      last.right = Math.max(last.right, it.x + it.w);
    } else {
      lines.push({ y: it.y, h: it.h, col: it.col, right: it.x + it.w, items: [it] });
    }
  }
  return lines;
}

/* ---------------- sentences ---------------- */

const ABBR = /(?:^|\s)(?:fig|figs|eq|eqs|no|nos|vs|et|al|ref|refs|sec|approx|cf|dr|prof|mr|ms|st|pp|vol|ch|tab|i\.e|e\.g|resp)\.$/i;

/** Split a page's text into sentences, keeping character offsets. */
function splitSentences(text) {
  const out = [];
  let start = 0;
  const flush = (end) => {
    const s = text.slice(start, end);
    if (s.replace(/\s+/g, " ").trim().length > 28) out.push({ start, end, text: s });
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const nextC = text[i + 1] ?? " ";
    // PDFs often glue the next sentence straight onto the full stop, so a
    // capital right after the punctuation also ends a sentence (but "3.5" and
    // "Fig.2" must not).
    const terminal =
      (c === "." || c === "!" || c === "?" || c === ";") &&
      (/[\s"')\]]/.test(nextC) || (/[A-Z]/.test(nextC) && !/\d/.test(text[i - 1] || "")));
    if (terminal) {
      const head = text.slice(Math.max(start, i - 12), i + 1);
      if (ABBR.test(head)) continue;          // "Fig." / "et al." aren't stops
      if (/\s[A-Za-z]\.$/.test(head)) continue; // initials: "J. Smith"
      flush(i + 1);
    } else if (i - start > 560 && /\s/.test(c)) {
      flush(i + 1);                            // runaway (no punctuation) — cut
    }
  }
  flush(text.length);
  return out;
}

/* ---------------- the index ---------------- */

/**
 * pageDatas: [{ page, items }] from extractPageItems, in page order.
 * Returns an index the anchor finder (and a plain text search) can run on.
 */
export function buildPaperIndex(pageDatas) {
  const pages = [];
  const sentences = [];
  const headings = [];
  const df = new Map(); // term -> how many sentences contain it (rarity signal)
  let base = 0;

  for (const pd of pageDatas || []) {
    const lines = groupLines(pd.items || []);
    const flat = [];   // boxes, reading order
    const owner = [];  // char index -> flat index (-1 for inserted whitespace)
    let text = "";

    lines.forEach((ln, li) => {
      const lineText = ln.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      const hk = headingKey(lineText);
      if (hk) headings.push({ key: hk, page: pd.page, pos: base + text.length });

      let prev = null;
      for (const it of ln.items) {
        // any real gap is a word space (a glyph-level split has none)
        if (prev && it.x - (prev.x + prev.w) > 0.0015) { text += " "; owner.push(-1); }
        const fi = flat.length;
        // `h`/`y` are the LINE's, so highlight boxes line up across a line.
        // `ih` keeps the run's own glyph height, which is the only signal that
        // separates a superscript citation ("…grid.14,15") from body text —
        // see the superscript scan in paperRefs.js.
        // `ih`/`iy` are the run's OWN glyph box. A superscript citation sits in
        // the top third of its line, so drawing it at the line's height and
        // position put the chip over the whole line — see rectsForSpan.
        flat.push({ x: it.x, y: ln.y, w: it.w, h: ln.h, line: li, ih: it.h, iy: it.y, str: it.str });
        for (let k = 0; k < it.str.length; k++) owner.push(fi);
        text += it.str;
        prev = it;
      }
      text += "\n";
      owner.push(-1);
    });

    const pageIdx = pages.length;
    pages.push({ page: pd.page, base, text, owner, flat });

    for (const s of splitSentences(text)) {
      const toks = tokenize(s.text);
      if (toks.length < 4) continue;
      const set = new Set(toks);
      const bgs = new Set();
      for (let i = 0; i + 1 < toks.length; i++) bgs.add(`${toks[i]} ${toks[i + 1]}`);
      const clean = s.text.replace(/\s+/g, " ").trim();
      sentences.push({
        pageIdx,
        page: pd.page,
        start: s.start,
        end: s.end,
        pos: base + s.start,
        n: toks.length,
        toks: set,
        bgs,
        text: clean,
        ref: REF_SMELL.test(clean),
      });
      for (const t of set) df.set(t, (df.get(t) || 0) + 1);
      for (const b of bgs) df.set(b, (df.get(b) || 0) + 1);
    }

    base += text.length;
  }

  headings.sort((a, b) => a.pos - b.pos);
  /* The FIRST refs-ish heading — "References", but also "Acknowledgements" or
   * "Data availability", which sit just before the list and cost nothing to
   * include. Restricted to the back half of the document so a paper that
   * happens to print "References" in a running header cannot declare the
   * bibliography to start on page one. */
  const total = base;
  const refsHead = headings.find((h) => h.key === "refs" && h.pos > total * 0.5);
  const refsAt = referencesStart(sentences, refsHead?.pos ?? Infinity);
  return { pages, sentences, headings, df, refsAt, nSent: sentences.length || 1 };
}

/* ---------------- section -> paper section prior ---------------- */

/** Which of the paper's own sections each analysis section usually comes from,
 *  best guess first. Only a prior: a strong match elsewhere still wins. */
export const SECTION_SOURCE = {
  story: ["introduction", "abstract", "conclusion"],
  mindmap: ["introduction", "abstract"],
  concept: ["method", "introduction"],
  foundations: ["related", "introduction", "method"],
  model: ["method", "experiment"],
  method: ["method", "experiment"],
  explorables: ["method", "results"],
  results: ["results", "experiment"],
  reverse: ["results", "experiment"],
  claims: ["conclusion", "results", "abstract"],
  flashcards: ["abstract", "conclusion"],
};

/** Human label for the paper section a match landed in. */
export const HEAD_LABEL = {
  abstract: "Abstract",
  introduction: "Introduction",
  related: "Background / related work",
  method: "Method",
  experiment: "Experimental setup",
  results: "Results",
  conclusion: "Conclusion",
};

/**
 * The paper's OWN table of contents, for the reading rail: one entry per
 * detected section in reading order, as { key, label, page }.
 *
 * Only the FIRST occurrence of each kind survives. Papers repeat these words in
 * subsection headings ("3.2 Method for …", "Results of the ablation"), and a
 * rail that listed every hit would be noise rather than navigation.
 *
 * `refs` is dropped: jumping the reader into the bibliography is never what
 * someone clicking a section rail wants.
 *
 * Returns [] when nothing was detected — the caller MUST treat that as "this
 * paper has no usable outline" and fall back, not render an empty rail. Heading
 * detection genuinely fails on papers with unusual typography, and inventing a
 * structure we didn't find would be worse than admitting we didn't find one.
 */
export function paperOutline(index) {
  const heads = index?.headings || [];

  /* Front matter is a minefield of false headings. A journal's first page
   * carries a graphical abstract, an "In brief" panel and a Highlights list
   * whose own sub-labels read exactly like section headings — which is how an
   * outline ends up claiming "Results" is on page 1 and "Introduction" on
   * page 3. Nothing but the abstract legitimately precedes the Introduction,
   * so once we've found one, anything else before it is front matter and the
   * real heading is a later occurrence. */
  const introAt = heads.find((h) => h.key === "introduction")?.pos ?? -Infinity;

  const seen = new Set();
  const out = [];
  for (const h of heads) {
    if (h.key === "refs" || seen.has(h.key)) continue;
    if (!HEAD_LABEL[h.key]) continue;
    // abstract/introduction are allowed to be first; everything else must come
    // after the introduction to count.
    if (h.key !== "abstract" && h.key !== "introduction" && h.pos < introAt) continue;
    seen.add(h.key);
    out.push({ key: h.key, label: HEAD_LABEL[h.key], page: h.page });
  }

  /* A one-entry outline is not an outline — it's a single lucky match, and
   * showing it as "the paper's contents" overstates what we detected. */
  return out.length >= 3 ? out : [];
}

/** [start,end) character ranges of the preferred paper sections, with a boost. */
function preferredSpans(index, prefs) {
  const spans = [];
  const heads = index.headings;
  for (let i = 0; i < heads.length; i++) {
    const rank = prefs.indexOf(heads[i].key);
    if (rank < 0) continue;
    spans.push({
      key: heads[i].key,
      from: heads[i].pos,
      to: i + 1 < heads.length ? heads[i + 1].pos : Infinity,
      boost: [1.85, 1.45, 1.2][rank] ?? 1.1,
    });
  }
  return spans;
}

/** Query terms from a section digest, weighted by rarity inside this paper. */
function keyTerms(text, df, nSent) {
  const toks = tokenize(text);
  const tf = new Map();
  for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
  for (let i = 0; i + 1 < toks.length; i++) {
    const b = `${toks[i]} ${toks[i + 1]}`;
    tf.set(b, (tf.get(b) || 0) + 1);
  }
  const out = new Map();
  for (const [term, f] of tf) {
    const d = df.get(term) || 0;
    if (!d) continue;                      // the paper never says it
    if (d > nSent * 0.22) continue;        // boilerplate in this paper
    out.set(term, (1 + Math.log(f)) * Math.log(1 + nSent / d));
  }
  return out;
}

/**
 * Boxes (page fractions) covering one character range of one page, one box per
 * line the range spans. Exported because inline references (citation markers,
 * "Fig. 3" mentions) need exactly the same char-range → on-page-geometry step
 * that provenance highlights do — see paperRefs.js.
 *
 * `start`/`end` are indices into that page's own `text`.
 */
/**
 * Roughly how wide each character is, relative to the others in its run.
 *
 * A citation marker is four characters inside a run that pdf.js often hands
 * back as an entire line, so where the marker sits has to be interpolated —
 * and interpolating by character COUNT assumes a monospace font. It isn't one:
 * in "…the sustainable–intensification literature [12]" the count-based guess
 * drifts left by several characters, because the run is full of i's, l's,
 * spaces and full stops that the estimate charged full width for. That drift
 * is exactly the "the highlight isn't on the number" complaint.
 *
 * These are eyeballed proportional-serif ratios, not metrics from the embedded
 * font — which we deliberately don't load. They don't need to be exact: the
 * run's TOTAL width is known and correct, so only the distribution inside it
 * is being estimated, and being roughly right about which characters are
 * narrow removes almost all of the error.
 */
const NARROW = new Set([..."ijltfrI.,;:'’`|!()[]{}-–— "]);
const WIDE = new Set([..."mwMW@%"]);
const charW = (c) => (NARROW.has(c) ? 0.45 : WIDE.has(c) ? 1.5 : /[A-Z0-9]/.test(c) ? 1.15 : 1);

/** Cumulative width fractions across a run's string, from 0 to 1. */
function cumulative(str) {
  const out = new Float64Array(str.length + 1);
  let total = 0;
  for (let i = 0; i < str.length; i++) {
    total += charW(str[i]);
    out[i + 1] = total;
  }
  if (total > 0) for (let i = 0; i <= str.length; i++) out[i] /= total;
  else for (let i = 0; i <= str.length; i++) out[i] = i / Math.max(1, str.length);
  return out;
}

/**
 * Page-fraction rectangles covering a character range.
 *
 * `tight` chooses the vertical box. A reader's highlight wants the LINE box,
 * so consecutive highlighted lines stack flush. A cross-reference chip wants
 * the run's own INK box: a superscript "14,15" occupies the top third of its
 * line, and drawing it at line height put a pill over the whole line — three
 * of them on one line read as scattered blocks rather than as three markers.
 */
export function rectsForSpan(index, pageIdx, start, end, { tight = false } = {}) {
  const p = index?.pages?.[pageIdx];
  if (!p) return [];

  const byLine = new Map();
  let i = start;
  while (i < end && i < p.owner.length) {
    const fi = p.owner[i];
    if (fi < 0) { i++; continue; }              // inserted whitespace
    const it = p.flat[fi];
    if (!it) { i++; continue; }

    // How much of THIS glyph run the range actually covers. pdf.js hands back
    // whole lines as single runs, so a "Fig. 3" inside one would otherwise be
    // drawn across the entire line — the box is interpolated by character
    // WIDTH instead (see charW above).
    let a = i;
    while (a > 0 && p.owner[a - 1] === fi) a--;
    let b = i;
    while (b + 1 < p.owner.length && p.owner[b + 1] === fi) b++;
    const len = b - a + 1;

    const from = Math.max(a, start);
    const to = Math.min(b, end - 1);
    const cum = it.str && it.str.length === len ? cumulative(it.str) : null;
    const at = (k) => (cum ? cum[Math.max(0, Math.min(len, k))] : Math.max(0, Math.min(len, k)) / len);
    const x1 = it.x + it.w * at(from - a);
    const x2 = it.x + it.w * at(to - a + 1);

    // Ink box when we have one and it is genuinely smaller than the line;
    // otherwise the line box, which is what a full-height run occupies anyway.
    const useInk = tight && it.ih > 0 && Number.isFinite(it.iy) && it.ih < it.h;
    const y1 = useInk ? it.iy : it.y;
    const y2 = y1 + (useInk ? it.ih : it.h);

    const key = tight ? `${it.line}:${Math.round(y1 * 2000)}` : it.line;
    const r = byLine.get(key);
    if (!r) byLine.set(key, { x1, y1, x2, y2 });
    else {
      r.x1 = Math.min(r.x1, x1); r.x2 = Math.max(r.x2, x2);
      r.y1 = Math.min(r.y1, y1); r.y2 = Math.max(r.y2, y2);
    }
    i = b + 1;
  }

  /* Padding: generous for a highlight (it should cover the line it marks),
   * minimal for a chip (it should sit ON the characters, not over the line
   * above). The chip still gets a hair of headroom so its border has somewhere
   * to live and so it stays comfortably clickable. */
  const padY = tight ? 0.14 : 0.1;
  const grow = tight ? 1 + padY * 2 : 1.2;
  return [...byLine.values()]
    .map((r) => {
      const h = r.y2 - r.y1;
      return {
        x: Math.max(0, r.x1 - 0.001),
        y: Math.max(0, r.y1 - h * padY),
        w: Math.min(1, r.x2 - r.x1 + 0.002),
        h: h * grow,
      };
    })
    .filter((r) => r.w > 0.002 && r.h > 0.002);
}

/** Highlight boxes (page fractions) for one matched sentence, one per line. */
function rectsFor(index, m) {
  const p = index.pages[m.pageIdx];
  if (!p) return [];
  const byLine = new Map();
  for (let i = m.start; i < m.end && i < p.owner.length; i++) {
    const fi = p.owner[i];
    if (fi < 0) continue;
    const it = p.flat[fi];
    const r = byLine.get(it.line);
    if (!r) byLine.set(it.line, { x1: it.x, y1: it.y, x2: it.x + it.w, y2: it.y + it.h });
    else {
      r.x1 = Math.min(r.x1, it.x);
      r.y1 = Math.min(r.y1, it.y);
      r.x2 = Math.max(r.x2, it.x + it.w);
      r.y2 = Math.max(r.y2, it.y + it.h);
    }
  }
  return [...byLine.values()]
    .map((r) => {
      const h = r.y2 - r.y1;
      return {
        x: Math.max(0, r.x1 - 0.003),
        y: Math.max(0, r.y1 - h * 0.16),
        w: Math.min(1, r.x2 - r.x1 + 0.006),
        h: h * 1.34,
      };
    })
    .filter((r) => r.w > 0.004 && r.h > 0.002);
}

/**
 * The anchor for one analysis section.
 *   index    — from buildPaperIndex
 *   sectionId— "story" | "model" | …
 *   digest   — the section's own text (buildSectionContext output)
 * Returns { page, head, matches: [{ page, text, rects, score }] } or null when
 * nothing matches well enough to be worth claiming (honest degrade: the reader
 * then just opens at page 1 and says so).
 */
export function findSectionAnchor(index, sectionId, digest) {
  if (!index?.sentences?.length || !digest) return null;
  const kw = keyTerms(digest, index.df, index.nSent);
  if (kw.size < 3) return null;

  const spans = preferredSpans(index, SECTION_SOURCE[sectionId] || []);
  const spanAt = (pos) => spans.find((s) => pos >= s.from && pos < s.to) || null;

  const scored = [];
  for (const s of index.sentences) {
    if (s.pos >= index.refsAt || s.ref) continue; // never source from the bibliography
    let raw = 0;
    for (const t of s.toks) { const w = kw.get(t); if (w) raw += w; }
    for (const b of s.bgs) { const w = kw.get(b); if (w) raw += w * 1.8; }
    if (raw <= 0) continue;
    const sp = spanAt(s.pos);
    scored.push({
      ...s,
      head: sp?.key || null,
      score: (raw / Math.sqrt(Math.max(9, s.n))) * (sp ? sp.boost : 1),
    });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  // A weak best match means we're guessing — say nothing rather than mislead.
  if (best.score < 0.9) return null;

  // A handful of the strongest passages, spread out: neighbouring sentences of
  // one paragraph would otherwise all qualify and wash a whole column in
  // marker, which shows nothing. One mark per paragraph-ish region, four per
  // page, eight in all.
  const kept = [];
  for (const s of scored) {
    if (s.score < best.score * 0.55 || kept.length >= 8) break;
    if (kept.some((k) => k.pageIdx === s.pageIdx && Math.abs(k.pos - s.pos) < 900)) continue;
    if (kept.filter((k) => k.page === s.page).length >= 4) continue;
    kept.push(s);
  }
  kept.sort((a, b) => a.pos - b.pos);

  const matches = kept
    .map((m) => ({ page: m.page, text: m.text, score: +m.score.toFixed(3), rects: rectsFor(index, m) }))
    .filter((m) => m.rects.length);
  if (!matches.length) return null;

  // Matches stay in reading order (so "next passage" walks the paper forwards),
  // but the reader opens on — and starts at — the strongest one.
  let bestIdx = 0;
  for (let i = 1; i < matches.length; i++) if (matches[i].score > matches[bestIdx].score) bestIdx = i;

  return {
    page: matches[bestIdx].page,
    bestIdx,
    head: best.head,
    headLabel: best.head ? HEAD_LABEL[best.head] : null,
    matches,
  };
}
