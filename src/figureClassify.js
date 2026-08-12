/**
 * STAGE A — reading a figure's STRUCTURE off its pixels, offline and free.
 *
 * Making a published figure interactive has always been one call: hand the
 * crop to a vision model and ask for the chart back. That call is the most
 * expensive thing in the product and it kept getting the same three things
 * wrong — how many subplots there are, which chart family each one is, and
 * whether bars are stacked or grouped — because it was answering from scratch,
 * every time, about a picture it had looked at once.
 *
 * Those three questions are not really vision questions. They are measurement
 * questions, and pixels answer them:
 *
 *   - How many panels? Panels are separated by gutters of blank paper. Split
 *     into horizontal bands first, then cut each band into columns — a legend
 *     running the full width blocks every vertical gutter otherwise.
 *   - Bars or a curve? A bar is SOLID beneath its outline and its sides are
 *     VERTICAL; a curve is thin ink with paper under it.
 *   - Stacked or grouped? Walk up the inside of one bar. Two colours stacked
 *     vertically is a stack; one colour per bar with bars clustered is a group.
 *   - A box plot? Its rectangles FLOAT clear of the baseline, and a thin
 *     whisker runs out of the top and the bottom.
 *   - A violin? Its sides CURVE where a bar's and a box's are straight.
 *
 * So this module measures, and the online call (Stage B) then verifies and
 * corrects what was measured against what it can see. That is a much more
 * reliable request than "describe this figure", because every claim it is
 * checking is specific, and disagreeing with one is cheap.
 *
 * Nothing here is authoritative. Everything it returns is a DRAFT carrying its
 * own confidence, and Stage B is told in as many words that the image wins.
 *
 * Pure functions over ImageData: no DOM, no network, no model, no cost. That
 * also means it runs unchanged in Node against a decoded JPEG, which is how it
 * is tested — scripts/classify-figs.mjs checks it against the real figure
 * crops in public/figs, whose true chart families the sample specs record.
 */

/* ---------------- pixel basics ---------------- */

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** HSV saturation, 0..1 — how "coloured" (as opposed to grey) a pixel is. */
function sat(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx <= 0 ? 0 : (mx - mn) / mx;
}

const hex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

const stdev = (xs) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / xs.length);
};

/**
 * The page colour.
 *
 * Taken from the crop's OUTER FRAME rather than the modal colour of the whole
 * image: a heat map or a filled contour can cover most of its own area, so the
 * most common colour in the image is the plot, not the paper. The border is
 * paper in essentially every figure crop, because renderPdfRegions pads it.
 */
function backgroundOf(img) {
  const { data, width: w, height: h } = img;
  const counts = new Map();
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const push = (x, y) => {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 32) return;
    const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    counts.set(k, (counts.get(k) || 0) + 1);
  };
  for (let y = 0; y < h; y++) for (let d = 0; d < band; d++) { push(d, y); push(w - 1 - d, y); }
  for (let x = 0; x < w; x++) for (let d = 0; d < band; d++) { push(x, d); push(x, h - 1 - d); }

  let bestK = -1, bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { bestN = n; bestK = k; }
  if (bestK < 0) return { r: 255, g: 255, b: 255 };
  return { r: ((bestK >> 8) & 15) * 17, g: ((bestK >> 4) & 15) * 17, b: (bestK & 15) * 17 };
}

/* Anything this far from the page is ink. Low enough to catch a pale fill,
 * high enough to ignore JPEG mush around black text. */
const INK = 32;

/**
 * The per-pixel masks every later step reads.
 *
 *   ink    not the page colour
 *   dark   ink that is dark and unsaturated — rules, ticks, type, outlines
 *   solid  ink that survives an erosion, i.e. is part of a FILLED AREA rather
 *          than a stroke
 *
 * `solid` is what makes the rest of this module work. A figure is mostly
 * strokes — axes, gridlines, tick labels, legend text, the outline around
 * every bar — and all of it is ink. Eroding by two pixels deletes anything
 * thinner than about five, which is every stroke and every glyph, and keeps
 * bar fills, box bodies, violin bodies and heat-map cells. Measuring fills
 * against `solid` instead of `ink` is the difference between "this panel is
 * 40% ink, who knows" and "this panel contains nine filled rectangles".
 */
function buildMasks(img, bg) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const ink = new Uint8Array(n);
  const dark = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (data[i + 3] < 32) continue;
    const dr = data[i] - bg.r, dg = data[i + 1] - bg.g, db = data[i + 2] - bg.b;
    if (Math.sqrt(dr * dr + dg * dg + db * db) < INK) continue;
    ink[p] = 1;
    if (sat(data[i], data[i + 1], data[i + 2]) < 0.22 && lum(data[i], data[i + 1], data[i + 2]) < 170) {
      dark[p] = 1;
    }
  }

  // Erode with a radius-2 cross: cheap, separable enough, and exactly the
  // scale that separates a 3px stroke from a 20px bar.
  const solid = new Uint8Array(n);
  for (let y = 2; y < h - 2; y++) {
    const b = y * w;
    for (let x = 2; x < w - 2; x++) {
      const p = b + x;
      if (!ink[p]) continue;
      if (ink[p - 1] && ink[p + 1] && ink[p - 2] && ink[p + 2] &&
          ink[p - w] && ink[p + w] && ink[p - 2 * w] && ink[p + 2 * w]) {
        solid[p] = 1;
      }
    }
  }
  return { ink, dark, solid, w, h };
}

/* ---------------- region helpers ---------------- */

/** Ink counts per column and per row inside a box. */
function profiles(m, box, mask = m.ink) {
  const { x0, y0, x1, y1 } = box;
  const cw = Math.max(0, x1 - x0), ch = Math.max(0, y1 - y0);
  const cols = new Int32Array(cw);
  const rows = new Int32Array(ch);
  let total = 0;
  for (let y = y0; y < y1; y++) {
    const base = y * m.w;
    for (let x = x0; x < x1; x++) {
      if (!mask[base + x]) continue;
      cols[x - x0]++; rows[y - y0]++; total++;
    }
  }
  return { cols, rows, total, cw, ch };
}

/** Runs where the profile stays at or below `floor`, at least `minRun` long. */
function gutters(prof, minRun, floorAbs) {
  const out = [];
  let run = -1;
  for (let i = 0; i < prof.length; i++) {
    if (prof[i] <= floorAbs) { if (run < 0) run = i; }
    else { if (run >= 0 && i - run >= minRun) out.push([run, i]); run = -1; }
  }
  if (run >= 0 && prof.length - run >= minRun) out.push([run, prof.length]);
  return out;
}

/** Gutters → the spans between them, dropping slivers. */
function spansBetween(gaps, length, minSpan) {
  const spans = [];
  let at = 0;
  for (const [a, b] of gaps) {
    if (a - at >= minSpan) spans.push([at, a]);
    at = b;
  }
  if (length - at >= minSpan) spans.push([at, length]);
  return spans;
}

/**
 * Long straight rules inside a box — axis spines, plot frames, gridlines.
 *
 * They have to be found for two different reasons. They tell us where the plot
 * area is; and they have to be ERASED before anything is measured, because a
 * frame line across the top of a panel makes every column's topmost ink row 0,
 * which is indistinguishable from "every bar is full height". That single
 * effect is why an earlier version of this module found no bars in any framed
 * plot — which is most of them.
 *
 * A rule is thin (a few pixels) and long (most of the box). The thinness test
 * is what keeps a heat map's rows, which are also long, from being erased.
 */
function findRules(m, box) {
  const { x0, y0, x1, y1 } = box;
  const cw = x1 - x0, ch = y1 - y0;
  if (cw < 12 || ch < 12) return { rows: [], cols: [] };

  const rowInk = new Int32Array(ch);
  for (let y = y0; y < y1; y++) {
    let n = 0;
    const b = y * m.w;
    for (let x = x0; x < x1; x++) if (m.ink[b + x]) n++;
    rowInk[y - y0] = n;
  }
  const colInk = new Int32Array(cw);
  for (let x = x0; x < x1; x++) {
    let n = 0;
    for (let y = y0; y < y1; y++) if (m.ink[y * m.w + x]) n++;
    colInk[x - x0] = n;
  }

  /* A run of consecutive long rows is a rule only while it stays thin. Four
   * pixels is generous for a drawn line at this resolution and far under the
   * height of any data band. */
  const runsOf = (arr, span, maxThick) => {
    const hits = [];
    let start = -1;
    for (let i = 0; i <= arr.length; i++) {
      const on = i < arr.length && arr[i] >= span;
      if (on) { if (start < 0) start = i; continue; }
      if (start >= 0 && i - start <= maxThick) hits.push([start, i]);
      start = -1;
    }
    return hits;
  };

  /* 0.42, not 0.6, because REFERENCE LINES ARE DASHED.
   *
   * A dashed "Top-down: 3,068" baseline drawn across a bar chart covers only
   * about half the columns it crosses, so a 60% threshold missed it — and an
   * unstripped dashed line puts ink in the gaps BETWEEN the bars, which welds
   * every bar in the panel into one full-width blob and destroys the bar
   * detection completely. Three grouped-bar figures came back as line plots
   * for exactly this reason.
   *
   * Lowering it is safe because of the thickness test above: a row through the
   * middle of a bar chart also passes 42% coverage, but so do the two hundred
   * rows above and below it, and a two-hundred-pixel-thick "rule" is rejected.
   * Only something genuinely thin and genuinely long survives. */
  return {
    rows: runsOf(rowInk, cw * 0.42, 4),
    cols: runsOf(colInk, ch * 0.42, 4),
    rowInk, colInk,
  };
}

/**
 * How FLAT the filled colour is — the test that separates a heat map from a
 * photograph.
 *
 * Both fill their box; both can quantise down to a handful of colour clusters.
 * The difference is local: a heat map cell is one exact colour across tens of
 * pixels, while a photograph changes shade from pixel to pixel. Sampling
 * whether a pixel matches its neighbour four across and four down measures
 * precisely that, and costs one pass over a grid.
 */
function flatness(m, img, box) {
  const { data } = img;
  let same = 0, seen = 0;
  const step = Math.max(2, Math.round(Math.min(box.x1 - box.x0, box.y1 - box.y0) / 90));
  /* Compared with a TOLERANCE, not for equality. These crops are JPEGs at
   * quality 0.9: a flat heat-map cell is flat in the source and mottled by a
   * few levels in the file, so exact matching scored real heat maps at 40%
   * and reported them as photographs. */
  const near = (p, q) => {
    const i = p * 4, j = q * 4;
    return Math.abs(data[i] - data[j]) < 14 &&
           Math.abs(data[i + 1] - data[j + 1]) < 14 &&
           Math.abs(data[i + 2] - data[j + 2]) < 14;
  };
  for (let y = box.y0; y < box.y1 - 4; y += step) {
    const base = y * m.w;
    for (let x = box.x0; x < box.x1 - 4; x += step) {
      const p = base + x;
      if (!m.solid[p]) continue;
      seen++;
      if (near(p, p + 4) && near(p, p + 4 * m.w)) same++;
    }
  }
  return seen < 20 ? 0.5 : same / seen;
}

/** Ink with the rules erased — what every measurement below actually reads. */
function dataMask(m, box, rules) {
  const data = new Uint8Array(m.ink.length);
  data.set(m.ink);
  for (const [a, b] of rules.rows) {
    for (let y = box.y0 + a; y < box.y0 + b; y++) {
      const base = y * m.w;
      for (let x = box.x0; x < box.x1; x++) data[base + x] = 0;
    }
  }
  for (const [a, b] of rules.cols) {
    for (let x = box.x0 + a; x < box.x0 + b; x++) {
      for (let y = box.y0; y < box.y1; y++) data[y * m.w + x] = 0;
    }
  }
  return data;
}

/**
 * The plot area inside a panel: bounded by its axis spines when it has them,
 * and by the ink otherwise. Keeping tick labels, titles and legends out of the
 * box is what makes a bar's measured height mean anything.
 */
function plotBox(m, box) {
  const rules = findRules(m, box);
  const cw = box.x1 - box.x0, ch = box.y1 - box.y0;
  const mid = (r) => (r[0] + r[1]) / 2;

  let left = null, right = null, top = null, bottom = null;
  for (const r of rules.cols) {
    const v = mid(r);
    if (v < cw * 0.5) { if (left === null || v < left) left = v; }
    else if (right === null || v > right) right = v;
  }
  for (const r of rules.rows) {
    const v = mid(r);
    if (v > ch * 0.5) { if (bottom === null || v > bottom) bottom = v; }
    else if (top === null || v < top) top = v;
  }

  const p = profiles(m, box);
  const firstInk = (arr) => { for (let i = 0; i < arr.length; i++) if (arr[i] > 0) return i; return 0; };
  const lastInk = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] > 0) return i; return arr.length - 1; };

  const L = Math.round(left ?? firstInk(p.cols));
  const R = Math.round(right ?? lastInk(p.cols));
  const T = Math.round(top ?? firstInk(p.rows));
  const B = Math.round(bottom ?? lastInk(p.rows));

  const out = {
    x0: box.x0 + Math.min(L, R), x1: box.x0 + Math.max(L, R) + 1,
    y0: box.y0 + Math.min(T, B), y1: box.y0 + Math.max(T, B) + 1,
    hasRules: (left !== null || right !== null) && (top !== null || bottom !== null),
  };
  if (out.x1 - out.x0 < 12 || out.y1 - out.y0 < 12) {
    return { ...box, hasRules: false };
  }
  return out;
}

/* ---------------- vertical ink blobs: the shared primitive ----------------
 *
 * Bars, box bodies and violins are all "a lump of ink occupying a range of
 * columns". Finding those lumps once and then asking what SHAPE each one is
 * beats three separate detectors that each re-scan the panel and disagree
 * about where one object ends and the next begins.
 */

/** Per-column top/bottom/count within a box, over a given mask. */
function columnSpans(m, box, mask) {
  const W = box.x1 - box.x0;
  const spans = new Array(W);
  for (let x = box.x0; x < box.x1; x++) {
    let first = -1, last = -1, n = 0;
    for (let y = box.y0; y < box.y1; y++) {
      if (mask[y * m.w + x]) { if (first < 0) first = y; last = y; n++; }
    }
    spans[x - box.x0] = first < 0 ? null : { top: first - box.y0, bot: last - box.y0, n };
  }
  return spans;
}

/**
 * Group columns into blobs and measure each one's shape.
 *
 * `sideStdev` is the discriminator this whole module turns on: how much the
 * blob's left and right edges wander as you go down it. A bar and a box body
 * have perfectly straight sides (near 0). A violin's curve outward and back
 * (large). Nothing else needs to be known about the outline.
 */
function findBlobs(m, img, box, mask, solid) {
  const W = box.x1 - box.x0, H = box.y1 - box.y0;
  const spans = columnSpans(m, box, mask);

  const runs = [];
  let start = -1;
  let gap = 0;
  const GAP_OK = Math.max(1, Math.round(W * 0.004));   // bridge JPEG speckle
  for (let x = 0; x <= W; x++) {
    const on = x < W && !!spans[x];
    if (on) { if (start < 0) start = x; gap = 0; continue; }
    if (start >= 0) {
      gap++;
      if (gap <= GAP_OK && x < W) continue;
      const x1 = x - gap + 1;
      if (x1 - start >= Math.max(2, W * 0.008)) runs.push([start, x1]);
      start = -1; gap = 0;
    }
  }

  /* Split a run wherever it stops being ONE object.
   *
   * Bars in a real figure very often touch: a histogram's bars share edges by
   * definition, and a grouped bar chart's bars touch inside each cluster and
   * only separate between clusters. A run-of-ink detector sees each cluster as
   * a single wide lump whose top is not flat, which fails every bar test and
   * is why an earlier version called a grouped bar chart a violin plot.
   *
   * Two cuts recover the individual bars, and neither fires on a genuinely
   * continuous shape: a STEP in the top edge (bars of different heights) and a
   * CHANGE OF FILL COLOUR at mid-height (bars of the same height in different
   * series). A violin's top edge moves a pixel at a time and its fill never
   * changes, so it survives both.
   */
  const { data } = img;
  const step = Math.max(3, H * 0.025);

  /* The step is measured on the FILL's top edge, not the ink's.
   *
   * A box plot's whisker rises out of the middle of the box, so the ink starts
   * much higher in the box's centre columns than at its edges — and splitting
   * on that cut every box into five slices, each too narrow to carry a whisker
   * and none of them recognisable. The fill's top edge runs flat across the
   * whole box and steps only where one object really ends and the next begins,
   * which is the thing being looked for. */
  const solidTopAt = (x) => {
    const s = spans[x];
    if (!s) return null;
    for (let y = box.y0 + s.top; y <= box.y0 + s.bot; y++) {
      if (solid[y * m.w + box.x0 + x]) return y - box.y0;
    }
    return null;
  };

  const cut = [];
  for (const [bx0, bx1] of runs) {
    const pieces = [];
    let from = bx0;
    for (let x = bx0 + 1; x < bx1; x++) {
      const a = spans[x - 1], b = spans[x];
      if (!a || !b) continue;
      const sa = solidTopAt(x - 1), sb = solidTopAt(x);
      let split = sa != null && sb != null
        ? Math.abs(sb - sa) > step
        : Math.abs(b.top - a.top) > step;
      if (!split) {
        // Probe the fill a third of the way down from this column's top.
        const probe = (s, xx) => {
          if (!s) return null;
          const y = box.y0 + Math.min(H - 1, Math.round(s.top + (s.bot - s.top) * 0.35));
          const p = y * m.w + box.x0 + xx;
          if (!solid[p]) return null;
          const i = p * 4;
          return { r: data[i], g: data[i + 1], b: data[i + 2] };
        };
        const far = (u, v) => !!u && !!v && Math.hypot(u.r - v.r, u.g - v.g, u.b - v.b) > 60;
        const ca = probe(a, x - 1), cb = probe(b, x);
        /* A colour change only ends an object if it PERSISTS.
         *
         * A box plot draws its whisker and its median line through the middle
         * of the box in a different tone, so probing one column either side of
         * them reports "the colour changed" and cuts the box in half — at
         * exactly its centre, which is where the whisker is, so both halves
         * then look like plain rectangles with no whisker at all. Checking a
         * few columns further on ignores anything narrower than a mark. */
        const ahead = Math.min(bx1 - 1, x + Math.max(4, Math.round(W * 0.012)));
        if (far(ca, cb) && far(ca, probe(spans[ahead], ahead))) split = true;
      }
      if (split) {
        if (x - from >= Math.max(2, W * 0.006)) pieces.push([from, x]);
        from = x;
      }
    }
    if (bx1 - from >= Math.max(2, W * 0.006)) pieces.push([from, bx1]);
    cut.push(...(pieces.length ? pieces : [[bx0, bx1]]));
  }

  return cut.flatMap(([bx0, bx1]) => {
    const cols = [];
    for (let x = bx0; x < bx1; x++) if (spans[x]) cols.push(spans[x]);
    if (!cols.length) return [];

    const inkTop = Math.min(...cols.map((c) => c.top));
    const inkBot = Math.max(...cols.map((c) => c.bot));
    const width = bx1 - bx0;

    /* THE BODY IS THE SOLID CORE, NOT THE INK EXTENT — and one column of the
     * panel can hold SEVERAL bodies.
     *
     * A box plot's box is an outline with whiskers running out of it, and a
     * bar very often has its value printed above it: measured over the whole
     * ink extent both come out "about a third filled", which reads as neither
     * a filled shape nor a line. Worse, a two-series box plot draws its two
     * boxes at the SAME x, one above the other, so the column's ink extent
     * spans both plus the gap between them. Between them those two effects
     * produced not one recognised mark in a panel of twelve textbook
     * box-and-whisker plots.
     *
     * So: find the runs of rows that actually contain filled pixels, and treat
     * each run as its own body. What the ink does above and below a body then
     * becomes that body's whisker measurement, for free. */
    const rowSolid = new Int32Array(inkBot - inkTop + 1);
    const rowInk = new Int32Array(inkBot - inkTop + 1);
    for (let y = inkTop; y <= inkBot; y++) {
      let s = 0, k = 0;
      const base = (box.y0 + y) * m.w + box.x0;
      for (let x = bx0; x < bx1; x++) { if (solid[base + x]) s++; if (mask[base + x]) k++; }
      rowSolid[y - inkTop] = s;
      rowInk[y - inkTop] = k;
    }

    /* WHERE THE FILL STOPS BUT THE INK DOES NOT, IT IS STILL ONE OBJECT.
     *
     * This is the line between the two cases that both look like "a gap in the
     * filled area". A STACKED BAR is one continuous object whose segments are
     * separated by a drawn border — the erosion eats a few pixels either side
     * of that border, leaving a hole in the fill, but the INK runs straight
     * through. Two BOX PLOTS drawn at the same x are two separate objects with
     * paper between them, and there the ink stops too.
     *
     * Splitting on the fill alone gave the box plots (correctly) and broke
     * every stacked bar into its segments, so nothing reached the baseline and
     * a three-panel stacked-bar figure stopped being a bar chart at all.
     * Checking the ink at the gap tells the two apart exactly. */
    const runs = [];
    let from = -1, gap = 0;
    for (let i = 0; i <= rowSolid.length; i++) {
      const on = i < rowSolid.length && rowSolid[i] > 0;
      if (on) { if (from < 0) from = i; gap = 0; continue; }
      if (from >= 0) {
        gap++;
        const inked = i < rowSolid.length && rowInk[i] >= width * 0.5;
        if (i < rowSolid.length && (gap <= 2 || inked)) continue;
        const end = i - gap;
        if (end - from >= 2) runs.push([from + inkTop, end + inkTop]);
        from = -1; gap = 0;
      }
    }
    // No filled body at all: keep ONE blob over the ink so line work is still
    // measured (it will simply score no fill and fall to the curve tests).
    const bodies = runs.length ? runs : [[inkTop, inkBot]];

    return bodies.map(([coreTop, coreBot]) => {
      /* The ink this body owns: outwards from the core until the ink stops.
       * That is the whisker, and it must not run into the NEXT body, so it
       * halts at any row the core runs already excluded. */
      let top = coreTop, bot = coreBot;
      const rowInkAt = (y) => {
        const base = (box.y0 + y) * m.w + box.x0;
        for (let x = bx0; x < bx1; x++) if (mask[base + x]) return true;
        return false;
      };
      const others = bodies.filter(([a, b]) => !(a === coreTop && b === coreBot));
      const blocked = (y) => others.some(([a, b]) => y >= a && y <= b);
      while (top - 1 >= inkTop && rowInkAt(top - 1) && !blocked(top - 1)) top--;
      while (bot + 1 <= inkBot && rowInkAt(bot + 1) && !blocked(bot + 1)) bot++;

      let solidN = 0;
      const solTops = [];
      for (let x = bx0; x < bx1; x++) {
        let first = -1;
        for (let y = box.y0 + coreTop; y <= box.y0 + coreBot; y++) {
          if (solid[y * m.w + box.x0 + x]) {
            if (first < 0) first = y - box.y0;
            solidN++;
          }
        }
        if (first >= 0) solTops.push(first);
      }
      const coreArea = Math.max(1, width * (coreBot - coreTop + 1));

      // Left/right edge per ROW, over the core — the side-straightness test.
      const lefts = [], rights = [];
      const step = Math.max(1, Math.round((coreBot - coreTop) / 48));
      for (let y = box.y0 + coreTop; y <= box.y0 + coreBot; y += step) {
        let l = -1, r = -1;
        const base = y * m.w;
        for (let x = box.x0 + bx0; x < box.x0 + bx1; x++) {
          if (mask[base + x]) { if (l < 0) l = x; r = x; }
        }
        if (l >= 0) { lefts.push(l - box.x0); rights.push(r - box.x0); }
      }
      const centres = lefts.map((l, i) => (l + rights[i]) / 2);
      /* How much the core's WIDTH changes down its length. A bar and a box
       * body are the same width all the way down; a violin bulges. Without
       * this a ragged clump of line work counts as "curved sides" and three
       * line-plot figures came back as violins. */
      const rowWidths = lefts.map((l, i) => rights[i] - l + 1);
      const wMax = rowWidths.length ? Math.max(...rowWidths) : 0;
      const wMin = rowWidths.length ? Math.min(...rowWidths) : 0;

      return {
        x0: bx0, x1: bx1, width,
        top, bot,
        coreTop, coreBot,
        topStdev: stdev(solTops.length ? solTops : [0]),
        sideStdev: (stdev(lefts) + stdev(rights)) / 2,
        centreStdev: stdev(centres),
        widthVary: wMax > 0 ? (wMax - wMin) / wMax : 0,
        coreFill: solidN / coreArea,
        // How far the ink runs past the core, up and down: a whisker.
        whiskerUp: coreTop - top,
        whiskerDown: bot - coreBot,
        touchesTop: top <= Math.max(2, H * 0.02),
        widthFrac: width / W,
        heightFrac: (bot - top + 1) / H,
        coreHeightFrac: (coreBot - coreTop + 1) / H,
      };
    });
  }).filter(Boolean);
}

/**
 * The same measurement, sideways: rows grouped into blobs.
 *
 * A horizontal bar chart is a bar chart rotated, and every column-based test
 * above fails on it — its "bars" span rows, not columns. Rather than
 * generalise the whole pipeline over an axis parameter (which makes every
 * function harder to read for one chart family), this measures the two things
 * a horizontal bar actually needs: a filled band of rows, straight top and
 * bottom edges, and a left end anchored on the axis.
 */
function findRowBars(m, box, mask, solid) {
  const W = box.x1 - box.x0, H = box.y1 - box.y0;
  const rows = new Array(H);
  for (let y = box.y0; y < box.y1; y++) {
    let first = -1, last = -1, n = 0;
    const base = y * m.w;
    for (let x = box.x0; x < box.x1; x++) {
      if (mask[base + x]) { if (first < 0) first = x; last = x; n++; }
    }
    rows[y - box.y0] = first < 0 ? null : { left: first - box.x0, right: last - box.x0, n };
  }

  const runs = [];
  let start = -1;
  for (let y = 0; y <= H; y++) {
    const on = y < H && !!rows[y];
    if (on) { if (start < 0) start = y; continue; }
    if (start >= 0 && y - start >= Math.max(3, H * 0.02)) runs.push([start, y]);
    start = -1;
  }

  return runs.map(([ry0, ry1]) => {
    const live = rows.slice(ry0, ry1).filter(Boolean);
    if (!live.length) return null;
    const rights = live.map((r) => r.right);
    const lefts = live.map((r) => r.left);
    let solidN = 0;
    for (let y = box.y0 + ry0; y < box.y0 + ry1; y++) {
      const base = y * m.w;
      for (let x = box.x0 + Math.min(...lefts); x <= box.x0 + Math.max(...rights); x++) {
        if (solid[base + x]) solidN++;
      }
    }
    const area = Math.max(1, (Math.max(...rights) - Math.min(...lefts) + 1) * (ry1 - ry0));
    return {
      y0: ry0, y1: ry1,
      left: Math.min(...lefts), right: Math.max(...rights),
      rightStdev: stdev(rights),
      anchored: Math.min(...lefts) <= W * 0.06,
      fill: solidN / area,
      lengthFrac: (Math.max(...rights) - Math.min(...lefts) + 1) / W,
      thickFrac: (ry1 - ry0) / H,
    };
  }).filter(Boolean);
}

/** Does a thin spike run out of this blob's centre — a whisker? */
function hasWhisker(m, box, mask, blob) {
  const cx = box.x0 + Math.round((blob.x0 + blob.x1) / 2);
  let first = -1, last = -1;
  for (let y = box.y0; y < box.y1; y++) {
    if (mask[y * m.w + cx]) { if (first < 0) first = y; last = y; }
  }
  if (first < 0) return false;
  const H = box.y1 - box.y0;
  const up = blob.top - (first - box.y0);
  const down = (last - box.y0) - blob.bot;
  return up > H * 0.02 || down > H * 0.02;
}

/* ---------------- series colours ---------------- */

/**
 * The distinct data colours in a plot box, biggest first.
 *
 * Sampled from `solid` only: a legend swatch, an axis and a letter are all ink
 * with a colour, and counting them turns a two-series plot into a nine-series
 * one. Quantised coarsely and then merged, because anti-aliasing smears every
 * edge across dozens of neighbouring RGB values.
 */
function seriesColors(m, img, box, maxOut = 12) {
  const { data } = img;
  const counts = new Map();
  let n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    const base = y * m.w;
    for (let x = box.x0; x < box.x1; x++) {
      const p = base + x;
      if (!m.solid[p]) continue;
      n++;
      const i = p * 4;
      const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  if (!n) return [];

  const raw = [...counts.entries()]
    .map(([k, c]) => ({ r: ((k >> 10) & 31) * 8 + 4, g: ((k >> 5) & 31) * 8 + 4, b: (k & 31) * 8 + 4, n: c }))
    .sort((a, b) => b.n - a.n);

  const merged = [];
  for (const c of raw) {
    const near = merged.find((o) => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b) < 52);
    if (near) { near.n += c.n; continue; }
    merged.push({ ...c });
  }

  const floor = Math.max(24, n * 0.015);
  return merged
    .filter((c) => c.n >= floor)
    .slice(0, maxOut)
    .map((c) => ({ hex: hex(c), share: c.n / n }));
}

/** Walk up the middle of one bar and list the colour bands it passes through.
 *  Two or more is a STACK. This is the call Stage B has been getting wrong
 *  most often and most expensively. */
function barBands(m, img, box, blob) {
  const { data } = img;
  const cx = box.x0 + Math.round((blob.x0 + blob.x1) / 2);
  const H = box.y1 - box.y0;
  const bands = [];
  let cur = null;
  for (let y = box.y0 + blob.coreTop; y <= box.y0 + blob.coreBot; y++) {
    const p = y * m.w + cx;
    if (!m.solid[p]) { cur = null; continue; }
    const i = p * 4;
    const c = { r: data[i], g: data[i + 1], b: data[i + 2] };
    if (cur && Math.hypot(cur.r - c.r, cur.g - c.g, cur.b - c.b) < 46) { cur.n++; continue; }
    cur = { ...c, n: 1 };
    bands.push(cur);
  }
  // Hairline bands are segment borders, not segments.
  return bands.filter((b) => b.n >= Math.max(3, H * 0.02));
}

/* ---------------- subplot segmentation ---------------- */

/**
 * Is this region a plot panel, or a legend / caption / colour bar that
 * happened to sit past a gutter?
 *
 * A panel has axis rules, or failing that a real amount of filled ink. A
 * legend is swatches and type: almost no `solid`, no long rules, and an
 * extreme aspect ratio. Getting this wrong is the classic failure — a figure
 * with a legend down its right-hand side reported as two subplots.
 */
function panelScore(m, box, totalInk) {
  const p = profiles(m, box);
  if (!p.total) return 0;
  const rules = findRules(m, box);
  const area = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0));
  const solidCover = profiles(m, box, m.solid).total / area;
  const inkShare = p.total / Math.max(1, totalInk);
  const w = box.x1 - box.x0, h = box.y1 - box.y0;
  const aspect = w / Math.max(1, h);

  let s = 0;
  if (rules.rows.length && rules.cols.length) s += 0.6;
  else if (rules.rows.length || rules.cols.length) s += 0.25;
  if (solidCover > 0.05) s += 0.3;
  if (inkShare > 0.12) s += 0.2;
  if (!rules.rows.length && !rules.cols.length && (aspect > 3.5 || aspect < 0.28)) s -= 0.4;
  if (w < 40 || h < 40) s -= 0.3;
  return s;
}

/**
 * Cut a figure into panels: horizontal BANDS first, then columns within each
 * band.
 *
 * The order is the whole point. A multi-panel figure with a legend strip
 * across the top has no vertical gutter that runs the full height of the
 * crop — the legend blocks every one of them — so cutting columns first finds
 * nothing and reports a six-panel figure as one panel. Banding first puts the
 * legend in its own band, and the panels below it then separate cleanly.
 */
function segment(m, full, totalInk) {
  const p = profiles(m, full);
  /* The gutter between two panels of a grid is NOT tall. It holds the upper
   * panel's tick labels and axis title and the lower one's title, and what is
   * left genuinely blank is often only a few pixels once the crop has been
   * scaled down. An earlier version demanded 2.5% of the figure's height of
   * unbroken white and consequently found ONE panel in every six-panel figure
   * it was given. The threshold is small on purpose, and the panel score below
   * is what throws away the label strips it lets through. */
  const floor = Math.max(1, Math.round(p.cw * 0.002));
  const bandGaps = gutters(p.rows, Math.max(3, Math.round(p.ch * 0.008)), floor);
  const bands = spansBetween(bandGaps, p.ch, Math.max(20, p.ch * 0.04));

  const cells = [];
  let maxCols = 1;
  for (const [ya, yb] of (bands.length ? bands : [[0, p.ch]])) {
    const band = { x0: full.x0, x1: full.x1, y0: full.y0 + ya, y1: full.y0 + yb };
    const bp = profiles(m, band);
    /* Measured against raw ink, deliberately. Weighting the profile towards
     * filled area to "see past" the tick labels between two panels was tried
     * and over-segmented badly — a single grouped bar chart split into three
     * panels at the gaps between its own bar clusters, because those gaps are
     * empty of fill too. Ink is the conservative signal and the panel score
     * below is what cleans up after it. */
    const colFloor = Math.max(1, Math.round(bp.ch * 0.002));
    const colGaps = gutters(bp.cols, Math.max(3, Math.round(bp.cw * 0.006)), colFloor);
    const cols = spansBetween(colGaps, bp.cw, Math.max(24, bp.cw * 0.05));
    const use = cols.length ? cols : [[0, bp.cw]];
    maxCols = Math.max(maxCols, use.length);
    for (const [xa, xb] of use) {
      cells.push({ x0: band.x0 + xa, x1: band.x0 + xb, y0: band.y0, y1: band.y1 });
    }
  }

  if (cells.length <= 1) return { cells: [full], rows: 1, cols: 1 };

  /* Keep the cells that read as panels. If that would leave nothing — a
   * monochrome grid of unframed line plots — keep them all: over-reporting the
   * panel count is something Stage B fixes by looking, whereas reporting one
   * panel for a 2x3 grid is the exact failure this exists to prevent. */
  const kept = cells.filter((c) => panelScore(m, c, totalInk) >= 0.3);
  const use = kept.length ? kept : cells;
  return { cells: use, rows: bands.length || 1, cols: maxCols };
}

/* ---------------- the classifier ---------------- */

/** One panel, measured and named. `debug` attaches the raw blob measurements,
 *  which is the only practical way to work on the thresholds below — the
 *  difference between a bar and a violin here is one standard deviation, and
 *  you cannot see it from the family name alone. */
function classifyPanel(m, img, cell, index, debug = false) {
  const box = plotBox(m, cell);
  const rules = findRules(m, box);
  const data = dataMask(m, box, rules);

  const area = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0));
  const solidCover = profiles(m, box, m.solid).total / area;
  const inkCover = profiles(m, box, data).total / area;
  const colours = seriesColors(m, img, box);
  const flat = flatness(m, img, box);
  const W = box.x1 - box.x0, H = box.y1 - box.y0;

  const notes = [];
  let family = "other";
  let confidence = 0.25;
  const rough = {};

  const blobs = findBlobs(m, img, box, data, m.solid);
  /* Objects worth reasoning about: wide enough to be a mark rather than a
   * speck, and not the whole panel (which is a filled field, not a bar). */
  const objs = blobs.filter((b) => b.widthFrac > 0.008 && b.widthFrac < 0.8 && b.heightFrac > 0.03);

  const straight = (b) => b.sideStdev <= Math.max(1.2, b.width * 0.09);
  const flatTop = (b) => b.topStdev <= Math.max(1.5, H * 0.015);

  /* MARKS are the filled shapes; everything else in the panel is writing.
   *
   * A plot box is full of ink that is not data — the legend, the value printed
   * on top of each bar, the tick labels the plot box didn't quite exclude —
   * and all of it becomes a blob. Judging "are most of the shapes here bars?"
   * against that population fails on any figure that labels its bars: one
   * panel of a grouped bar chart had five perfect bars among twenty-one blobs,
   * so bars were 24% of the shapes and the panel was reported as a line plot.
   *
   * The erosion already separates the two populations — writing does not
   * survive it — so filtering on fill and then reasoning only about what is
   * left is both simpler and much more stable than tuning the dominance
   * fraction downwards. */
  const marks = objs.filter((b) => b.coreFill > 0.5 && b.coreHeightFrac > 0.015);

  /* THE BASELINE IS WHERE THE BARS AGREE, not the bottom of the plot box.
   *
   * A bar rests on the axis's zero line, and that line is very often well
   * above the bottom of the frame — the frame encloses the tick labels too,
   * and most plotting libraries leave a margin under the data. Measuring
   * against the box bottom said "nothing touches the baseline" for a perfectly
   * ordinary bar chart, and eleven immaculate bars (fill 0.95, dead-straight
   * sides, dead-flat tops) were reported as a heat map.
   *
   * Taken as the biggest CLUSTER of bottom edges rather than their median: a
   * median is dragged off the baseline by a few tall marks, while the thing
   * being looked for is precisely "the row where lots of shapes end". Bars
   * share one; box plots and violins emphatically do not, so the same
   * measurement separates them. */
  const baseline = (() => {
    if (!marks.length) return H;
    const tol = Math.max(4, H * 0.03);
    const sorted = marks.map((b) => b.coreBot).sort((a, b) => a - b);
    let best = sorted[0], bestN = 0;
    for (const v of sorted) {
      const near = sorted.filter((u) => Math.abs(u - v) <= tol);
      if (near.length > bestN) { bestN = near.length; best = near.reduce((a, u) => a + u, 0) / near.length; }
    }
    return best;
  })();
  const onBase = (b) => Math.abs(b.coreBot - baseline) <= Math.max(4, H * 0.03);
  const sharedBase = marks.length >= 2 && marks.filter(onBase).length >= Math.max(2, marks.length * 0.5);

  const bars = sharedBase
    ? marks.filter((b) => straight(b) && flatTop(b) && onBase(b) && !b.touchesTop)
    : [];
  /* A box is a straight-sided, solidly-filled core that FLOATS and has ink
   * running out of it top and bottom. Every clause is load-bearing: without
   * "floats" every bar is a box, without the whiskers every legend swatch is
   * one, and without the fill and width tests every place two thick curves
   * cross in a line plot is one — which is how three line-plot figures came
   * back as box plots the first time this ran. */
  const boxLike = marks.filter((b) =>
    straight(b) && !onBase(b) && !b.touchesTop &&
    b.coreHeightFrac < 0.6 && b.width >= 4 &&
    b.widthVary < 0.3 &&
    (b.whiskerUp > Math.max(2, H * 0.012) || b.whiskerDown > Math.max(2, H * 0.012)));
  /* One more property no accident has: a box plot draws every box the SAME
   * width. Requiring the widths to agree costs nothing and is the difference
   * between "twelve boxes" and "twelve places two curves happened to cross". */
  const boxes = (() => {
    if (boxLike.length < 3) return [];
    /* Keep the ones whose width agrees with the median, rather than accepting
     * or rejecting the whole set on its spread. A panel of twelve boxes plus
     * two odd shapes IS a box plot, and a spread test throws all fourteen away
     * because of the two. */
    const ws = boxLike.map((b) => b.width).sort((a, b) => a - b);
    const med = ws[ws.length >> 1];
    const kept = boxLike.filter((b) => Math.abs(b.width - med) <= Math.max(2, med * 0.45));
    return kept.length >= 3 ? kept : [];
  })();
  /* A violin's core has curved sides but stays SYMMETRIC about its own centre
   * line. Without the symmetry test any ragged clump of line work counts as
   * curved, and half the panels of a six-panel line figure came back violins. */
  const curvy = marks.filter((b) =>
    !straight(b) && b.coreHeightFrac > 0.06 && b.widthFrac > 0.015 && b.widthFrac < 0.4 &&
    b.centreStdev <= Math.max(1.5, b.width * 0.18) && b.widthVary >= 0.35);
  /* A horizontal bar's far end is a STRAIGHT vertical edge. Without that test
   * every line plot whose curve happens to start at the y axis reads as one
   * long horizontal bar, which is how three line-plot figures came back as
   * horizontal stacks. */
  const rowBars = findRowBars(m, box, data, m.solid).filter((r) =>
    r.fill > 0.5 && r.anchored && r.lengthFrac > 0.08 && r.thickFrac < 0.28 &&
    r.rightStdev <= Math.max(1.5, W * 0.02));

  /* ---------------- scoring, not a cascade ----------------
   *
   * This used to be an if/else chain, and it was untunable: every threshold
   * moved to fix one figure broke another, because whichever branch happened
   * to be first won outright even when a later branch had far better evidence.
   * A grouped bar chart and a violin plot are not "bar unless violin" — they
   * are two hypotheses with different support, and the honest output is both
   * of them with their scores.
   *
   * That matters more here than tidiness. Stage A's job is to give the online
   * pass a PRIOR, and a confidently wrong single label is worse than useless —
   * it anchors the model against the picture. A ranked pair with the evidence
   * attached lets Stage B agree, pick the runner-up, or throw both away, which
   * is exactly what its instructions tell it to do. */
  const spans = columnSpans(m, box, data);
  const continuity = spans.filter(Boolean).length / Math.max(1, W);
  const gridish = colours.length >= 2 && colours.length <= 14 && flat > 0.7;
  const whiskered = boxes.filter((b) => hasWhisker(m, box, data, b));

  const bands = bars.slice(0, 14).map((b) => barBands(m, img, box, b));
  const multiBand = bands.filter((bs) => bs.length >= 2).length;
  const gaps = [];
  for (let i = 1; i < bars.length; i++) gaps.push(bars[i].x0 - bars[i - 1].x1);
  const gMax = Math.max(0, ...gaps);
  const touching = gaps.length > 0 && gMax <= Math.max(2, W * 0.008);
  const clustered = gaps.length >= 3 && gMax > 0 &&
    gaps.filter((g) => g < gMax * 0.45).length >= Math.max(2, gaps.length * 0.4);

  const barShare = marks.length ? bars.length / marks.length : 0;
  const barBase = bars.length >= 2 ? 0.35 + 0.35 * clamp01(barShare) : 0;
  const fieldBase = clamp01((solidCover - 0.4) / 0.35);

  const score = {
    stackedBar: barBase * (multiBand >= Math.max(2, bars.length * 0.4) ? 1 : 0.15),
    groupedBar: barBase * (clustered && colours.length >= 2 ? 0.95 : 0.2),
    bar: barBase * (touching ? 0.95 : 0.65),
    box: whiskered.length >= 2 ? 0.4 + 0.4 * clamp01(whiskered.length / Math.max(1, marks.length)) : 0,
    violin: curvy.length >= 1 ? 0.3 + 0.45 * clamp01(curvy.length / Math.max(1, marks.length)) : 0,
    stackedBarH: rowBars.length >= 3 && bars.length < 2 ? 0.45 : 0,
    heatmap: gridish ? fieldBase : fieldBase * 0.15,
    image: flat <= 0.7 ? fieldBase * 0.9 : fieldBase * 0.2,
    /* Continuity alone is NOT evidence of a line: a row of bars also puts ink
     * in every column of its panel. What separates them is what ELSE is there
     * — a line plot has no filled shapes and very little filled area. Without
     * these two penalties `line` outscored eleven immaculate bars, because
     * "ink in 98% of columns" is true of both. */
    line: solidCover < 0.5 && continuity > 0.45
      ? (0.25 + 0.5 * clamp01((continuity - 0.45) / 0.45)) *
        (1 / (1 + marks.length * 0.4)) * clamp01(1 - solidCover / 0.5)
      : 0,
    scatter: inkCover > 0.004 && continuity <= 0.62 && solidCover < 0.4
      ? (0.3 + 0.25 * clamp01((0.62 - continuity) / 0.5)) * (1 / (1 + marks.length * 0.25))
      : 0,
  };

  const ranked = Object.entries(score)
    .filter(([, v]) => v > 0.05)
    .sort((a, b) => b[1] - a[1]);

  /* A weak winner is not a winner. Below this, the measurements did not point
   * anywhere in particular, and the useful thing to hand the online pass is
   * "unclear, here is what was measured" — not a family name it might defer
   * to. A confidently wrong prior is the one failure mode of this whole
   * design, so it is bought off cheaply here. */
  const DECISIVE = 0.34;
  family = ranked.length && ranked[0][1] >= DECISIVE ? ranked[0][0] : "other";
  confidence = ranked.length ? Math.min(0.7, ranked[0][1]) : 0.15;

  /* A near-tie is not a decision. Saying so is the difference between the
   * online pass CHECKING a claim and the online pass being talked into one. */
  const ambiguous = ranked.length > 1 && ranked[0][1] - ranked[1][1] < 0.12;
  if (ambiguous) confidence = Math.min(confidence, 0.3);

  const alternatives = ranked.slice(1, 3).map(([k, v]) => ({ family: k, score: +v.toFixed(2) }));

  /* The evidence, written down whatever the ranking chose — the measurements
   * are worth more to Stage B than the label derived from them. */
  notes.push(
    `${(solidCover * 100).toFixed(0)}% of the plot box is filled area; ink is present in ` +
    `${(continuity * 100).toFixed(0)}% of its columns; ${(flat * 100).toFixed(0)}% of filled pixels ` +
    `match their neighbours (flat blocks read as a heat map, a photograph does not)`,
  );
  if (marks.length) {
    notes.push(
      `${marks.length} filled shape(s) found: ${bars.length} straight-sided on a shared baseline, ` +
      `${whiskered.length} floating with whiskers, ${curvy.length} with curved symmetric sides, ` +
      `${rowBars.length} lying horizontally from the left axis`,
    );
  } else {
    notes.push("no filled shapes at all — this panel is line work, points, or type");
  }
  if (bars.length >= 2) {
    notes.push(
      multiBand >= Math.max(2, bars.length * 0.4)
        ? `${multiBand} of ${bars.length} bars contain 2+ colour bands stacked up their length`
        : touching
          ? "the bars touch with no gaps, which reads as a histogram"
          : clustered
            ? "the bars fall into clusters separated by wider gaps"
            : "the bars are evenly spaced and single-coloured",
    );
  }
  if (ambiguous) {
    notes.push(`this is a close call between ${ranked[0][0]} and ${ranked[1][0]} — trust the image over it`);
  }

  /* Geometry for whichever hypotheses are actually in play. It is cheap, and a
   * runner-up's numbers are exactly what Stage B needs if it overturns the
   * top-ranked guess. */
  if (bars.length >= 2) {
    rough.bars = bars.slice(0, 40).map((b, i) => ({
      xFrac: +(((b.x0 + b.x1) / 2) / W).toFixed(3),
      // Measured from the baseline the bars actually share, not the bottom of
      // the box — the two differ by the axis margin on most plots.
      heightFrac: +Math.max(0, (baseline - b.coreTop) / H).toFixed(3),
      segments: bands[i]?.length ?? null,
    }));
  }
  if (whiskered.length >= 2) {
    rough.boxes = whiskered.slice(0, 24).map((b) => ({
      xFrac: +(((b.x0 + b.x1) / 2) / W).toFixed(3),
      boxTopFrac: +(b.coreTop / H).toFixed(3),
      boxBotFrac: +(b.coreBot / H).toFixed(3),
      whiskerTopFrac: +(b.top / H).toFixed(3),
      whiskerBotFrac: +(b.bot / H).toFixed(3),
    }));
  }
  if (curvy.length) {
    rough.violins = curvy.slice(0, 16).map((b) => ({
      xFrac: +(((b.x0 + b.x1) / 2) / W).toFixed(3),
      topFrac: +(b.coreTop / H).toFixed(3),
      botFrac: +(b.coreBot / H).toFixed(3),
      maxWidthFrac: +b.widthFrac.toFixed(3),
    }));
  }
  if (rowBars.length >= 3) {
    rough.rowBars = rowBars.slice(0, 24).map((r) => ({
      yFrac: +(((r.y0 + r.y1) / 2) / H).toFixed(3),
      lengthFrac: +r.lengthFrac.toFixed(3),
    }));
  }
  if (score.line > 0.05) {
    const N = 24;
    const path = [];
    for (let k = 0; k < N; k++) {
      const x = Math.min(W - 1, Math.round((k / (N - 1)) * (W - 1)));
      path.push(spans[x] ? +(1 - spans[x].top / H).toFixed(3) : null);
    }
    rough.topOutline = path;
  }

  return {
    alternatives,
    index,
    box: {
      fx0: +clamp01(cell.x0 / m.w).toFixed(4), fy0: +clamp01(cell.y0 / m.h).toFixed(4),
      fx1: +clamp01(cell.x1 / m.w).toFixed(4), fy1: +clamp01(cell.y1 / m.h).toFixed(4),
    },
    plot: {
      fx0: +clamp01(box.x0 / m.w).toFixed(4), fy0: +clamp01(box.y0 / m.h).toFixed(4),
      fx1: +clamp01(box.x1 / m.w).toFixed(4), fy1: +clamp01(box.y1 / m.h).toFixed(4),
    },
    family,
    confidence: +confidence.toFixed(2),
    hasAxes: !!box.hasRules,
    solidCover: +solidCover.toFixed(3),
    seriesColors: colours.map((c) => c.hex),
    seriesCount: colours.length,
    rough,
    notes,
    ...(debug
      ? {
          debug: {
            inkCover: +inkCover.toFixed(3),
            counts: { blobs: blobs.length, objs: objs.length, marks: marks.length, bars: bars.length, boxes: boxes.length, curvy: curvy.length, rowBars: rowBars.length },
            baseline: Math.round(baseline), sharedBase,
            objs: objs.slice(0, 24).map((b) => ({
              x: [b.x0, b.x1], ink: [b.top, b.bot], core: [b.coreTop, b.coreBot],
              w: +b.widthFrac.toFixed(3), h: +b.heightFrac.toFixed(3),
              fill: +b.coreFill.toFixed(2), side: +b.sideStdev.toFixed(1),
              topSd: +b.topStdev.toFixed(1), ctr: +b.centreStdev.toFixed(1),
              vary: +b.widthVary.toFixed(2),
              wU: b.whiskerUp, wD: b.whiskerDown,
            })),
          },
        }
      : {}),
  };
}

/**
 * STAGE A: read one figure crop's structure.
 *
 * @param imageData  ImageData for the crop (RGBA), long edge ~900px.
 * @returns a draft object, or { ok: false, reason } when the image is unusable.
 */
export function classifyFigureImage(imageData, { debug = false } = {}) {
  if (!imageData?.data || !imageData.width || !imageData.height) {
    return { ok: false, reason: "no image data" };
  }
  const { width: w, height: h } = imageData;
  if (w < 40 || h < 40) return { ok: false, reason: "image too small to measure" };

  const bg = backgroundOf(imageData);
  const m = buildMasks(imageData, bg);
  const full = { x0: 0, y0: 0, x1: w, y1: h };
  const whole = profiles(m, full);
  if (whole.total < w * h * 0.004) return { ok: false, reason: "almost no ink in the crop" };

  const { cells, rows, cols } = segment(m, full, whole.total);
  const subplots = cells.slice(0, 16).map((c, i) => classifyPanel(m, imageData, c, i, debug));

  return {
    ok: true,
    width: w, height: h,
    background: hex(bg),
    layout: { rows, cols, count: subplots.length },
    subplots,
  };
}

/* ---------------- handing the draft to Stage B ---------------- */

const FAMILY_PROSE = {
  bar: "a bar chart (filled rectangles standing on the baseline)",
  groupedBar: "grouped bars (clusters of differently-coloured bars per category)",
  stackedBar: "vertically stacked bars (colour segments on top of each other inside one bar)",
  stackedBarH: "horizontal bars (wide filled rectangles running left to right)",
  box: "a box plot (rectangles floating clear of the baseline, with whiskers)",
  violin: "a violin plot (filled shapes whose sides curve)",
  line: "a line/curve plot (thin ink with paper beneath it)",
  scatter: "a scatter of points (disconnected marks, most columns empty)",
  heatmap: "a heat map (the plot box is almost entirely filled with a few flat colours)",
  image: "a photograph, micrograph or continuous field (almost entirely filled, many colours)",
  other: "unclear from the pixels alone",
};

/**
 * Render a draft as the text block Stage B verifies.
 *
 * Written as MEASUREMENTS with their reasons attached, never as conclusions.
 * "3 rectangles that do not reach the baseline, so probably a box plot" is
 * something a model can check and overturn; "this is a box plot" invites it to
 * agree. That distinction is the whole point of handing the draft over.
 */
export function draftToPrompt(draft) {
  if (!draft?.ok || !draft.subplots?.length) return null;
  const L = [];
  const n = draft.subplots.length;
  L.push(
    `LOCAL PIXEL READ OF THE CROP (${draft.width}x${draft.height}px). It found ${n} candidate panel${n === 1 ? "" : "s"}` +
    (draft.layout.rows > 1 || draft.layout.cols > 1
      ? `, laid out as roughly ${draft.layout.rows} band(s) of up to ${draft.layout.cols} column(s)`
      : "") +
    ". Boxes are fractions of the crop (0-1, top-left origin).",
  );

  draft.subplots.forEach((s, i) => {
    const b = s.box;
    L.push(
      `\nPANEL ${i + 1} — box [${b.fx0}, ${b.fy0}] to [${b.fx1}, ${b.fy1}]` +
      (s.hasAxes ? ", axis spines detected" : ", NO axis spines detected (it may not be a plot at all)"),
    );
    L.push(`  measured family: ${FAMILY_PROSE[s.family] || s.family} — confidence ${s.confidence}`);
    for (const note of s.notes) L.push(`  evidence: ${note}`);
    if (s.seriesCount) {
      L.push(`  ${s.seriesCount} distinct fill colour(s): ${s.seriesColors.join(", ")}`);
    } else {
      L.push("  no filled areas found, so no series colours — the panel is line work or drawn in one tone");
    }
    if (s.rough.bars?.length) {
      const shown = s.rough.bars.slice(0, 14);
      L.push(
        "  bar geometry as fractions of the PLOT BOX (x across, height up from the baseline; NOT data values — no axis was read): " +
        shown.map((r) => `x=${r.xFrac} h=${r.heightFrac}${r.segments ? ` (${r.segments} stacked segments)` : ""}`).join("; ") +
        (s.rough.bars.length > shown.length ? ` … ${s.rough.bars.length - shown.length} more` : ""),
      );
    }
    if (s.rough.boxes?.length) {
      L.push(
        "  box geometry as fractions of the PLOT BOX, measured down from the top (the rectangle, then how far " +
      "the whiskers reach): " +
        s.rough.boxes.map((r) => `x=${r.xFrac} box=${r.boxTopFrac}..${r.boxBotFrac} whiskers=${r.whiskerTopFrac}..${r.whiskerBotFrac}`).join("; "),
      );
    }
    if (s.rough.violins?.length) {
      L.push(
        "  violin geometry as fractions of the PLOT BOX: " +
        s.rough.violins.map((r) => `x=${r.xFrac} top=${r.topFrac} bottom=${r.botFrac} widest=${r.maxWidthFrac}`).join("; "),
      );
    }
    if (s.rough.topOutline) {
      L.push(
        "  shape of the topmost ink, 24 samples left→right as a fraction of the plot box height (1 = top). " +
        "Use it only to check you are reading the same curve: " +
        s.rough.topOutline.map((v) => (v == null ? "-" : v)).join(", "),
      );
    }
  });

  L.push(
    "\nThis read is geometry only. It has not read a single axis number, tick or legend entry, so every value " +
    "above is a fraction of a box, never a quantity. It is also blind to anything that is not ink: a panel " +
    "drawn in one colour looks like one series to it however many the legend lists.",
  );
  return L.join("\n");
}

/* ---------------- browser glue ---------------- */

/**
 * Decode an image source (a data URL or a same-origin URL) to ImageData,
 * downscaled so the long edge is at most `maxEdge` and flattened onto white.
 * Browser-only; everything above this line runs anywhere.
 */
export async function imageDataFromSrc(src, maxEdge = 900) {
  if (typeof document === "undefined") throw new Error("imageDataFromSrc needs a browser");
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("could not decode the figure image"));
    el.src = src;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // A PNG crop has alpha; unflattened transparency reads as ink.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * The whole of Stage A, from a figure's image to the text Stage B verifies.
 * Returns { draft, prompt } — or nulls, because a failed local read must never
 * stop the reader from digitizing the figure. Stage B works without it; it
 * just works less well.
 */
export async function stageADraft(src) {
  try {
    const data = await imageDataFromSrc(src);
    const draft = classifyFigureImage(data);
    return { draft, prompt: draftToPrompt(draft) };
  } catch (e) {
    console.warn("stage A local figure read failed", e);
    return { draft: null, prompt: null };
  }
}
