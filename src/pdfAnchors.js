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
 * Where the bibliography starts, even in papers whose "References" heading we
 * never saw: scanning from the end, the longest tail of sentences that is
 * mostly citations *is* the reference list.
 */
function referencesStart(sentences, headingPos) {
  let start = headingPos;
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
  const line = String(raw || "").trim();
  if (!line || line.length > 70) return null;
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
function columnEdges(items) {
  const total = items.length;
  if (total < 60) return null;
  const B = 200;
  const hist = new Float64Array(B);
  for (const it of items) hist[Math.min(B - 1, Math.max(0, Math.floor(it.x * B)))]++;
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
  return (it) => {
    let c = 0;
    for (let i = 0; i < edges.length; i++) if (it.x + 0.02 >= edges[i]) c = i;
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
        flat.push({ x: it.x, y: ln.y, w: it.w, h: ln.h, line: li, ih: it.h });
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
  const refsAt = referencesStart(sentences, headings.find((h) => h.key === "refs")?.pos ?? Infinity);
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
export function rectsForSpan(index, pageIdx, start, end) {
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
    // position instead. Proportional spacing makes this approximate; for a
    // marker a few pixels out is invisible, and it beats a 350px underline.
    let a = i;
    while (a > 0 && p.owner[a - 1] === fi) a--;
    let b = i;
    while (b + 1 < p.owner.length && p.owner[b + 1] === fi) b++;
    const len = b - a + 1;

    const from = Math.max(a, start);
    const to = Math.min(b, end - 1);
    const x1 = it.x + (it.w * (from - a)) / len;
    const x2 = it.x + (it.w * (to - a + 1)) / len;

    const r = byLine.get(it.line);
    if (!r) byLine.set(it.line, { x1, y1: it.y, x2, y2: it.y + it.h });
    else {
      r.x1 = Math.min(r.x1, x1); r.x2 = Math.max(r.x2, x2);
      r.y1 = Math.min(r.y1, it.y); r.y2 = Math.max(r.y2, it.y + it.h);
    }
    i = b + 1;
  }

  return [...byLine.values()]
    .map((r) => {
      const h = r.y2 - r.y1;
      return {
        x: Math.max(0, r.x1 - 0.001),
        y: Math.max(0, r.y1 - h * 0.1),
        w: Math.min(1, r.x2 - r.x1 + 0.002),
        h: h * 1.2,
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
