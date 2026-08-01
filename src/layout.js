/**
 * Layout / theme config for the workspace — the "PowerPoint master slide".
 *
 * Every adjustable size, font and section label lives here. The Layout Editor
 * edits a copy live; the result is persisted per-browser and can be exported as
 * JSON. To make a finalized layout the default for EVERY paper, paste the
 * exported object over DEFAULT_LAYOUT below.
 *
 * `numeric` values are emitted as CSS custom properties on the workspace root
 * (components read them via inline `var(--…)`), except the two chart heights,
 * which are passed to Recharts as real numbers.
 */

const STORAGE = "paper-playground-layout";

/* Bumped when a default changes in a way a stale saved layout would fight.
 * v2: the reader view became a full-bleed app shell (left rail + reading
 * column), so the old centred-document contentMax/pagePad are discarded. */
const LAYOUT_VERSION = 2;
const V2_RESET_KEYS = ["contentMax", "pagePad"];

/* Each numeric knob: { group, label, cssVar, unit, min, max, step, value } */
export const NUMERIC_DEFS = [
  // Global
  // The reader view is a full-bleed app shell (a fixed left rail + the reading
  // column), not a centred document — so `contentMax` caps the READING COLUMN
  // and its default is high enough that the column simply fills whatever is
  // left of the window on any normal display.
  { key: "contentMax",   group: "Global",       label: "Reading column max width", cssVar: "--content-max", unit: "px", min: 900, max: 3200, step: 20, value: 2600 },
  { key: "pagePad",      group: "Global",       label: "Side margin (flow mode)", cssVar: "--page-pad",    unit: "px", min: 0,   max: 48,   step: 2,  value: 12   },
  { key: "sideNavW",     group: "Global",       label: "Left section rail width", cssVar: "--sidenav-w",   unit: "px", min: 170, max: 320,  step: 4,  value: 216  },
  { key: "cardRadius",   group: "Global",       label: "Corner rounding",       cssVar: "--card-radius",   unit: "px", min: 6,   max: 26,   step: 1,  value: 16   },

  // Title header
  { key: "titleSize",    group: "Title header", label: "Paper title size",      cssVar: "--title-size",    unit: "px", min: 15,  max: 36,   step: 1,  value: 22   },
  { key: "authorSize",   group: "Title header", label: "Authors / venue size",  cssVar: "--author-size",   unit: "px", min: 10,  max: 16,   step: 1,  value: 12   },
  { key: "abstractSize", group: "Title header", label: "Abstract size",         cssVar: "--abstract-size", unit: "px", min: 11,  max: 17,   step: 1,  value: 13   },

  // Section headers (all four)
  { key: "secBadge",     group: "Section headers", label: "Number badge size",  cssVar: "--sec-badge",     unit: "px", min: 26,  max: 46,   step: 1,  value: 36   },
  { key: "secHead",      group: "Section headers", label: "Heading size",       cssVar: "--sec-head",      unit: "px", min: 13,  max: 28,   step: 1,  value: 16   },
  { key: "secSub",       group: "Section headers", label: "Sub-text size",      cssVar: "--sec-sub",       unit: "px", min: 10,  max: 16,   step: 1,  value: 12   },
  { key: "secGap",       group: "Section headers", label: "Space above section",cssVar: "--sec-gap",       unit: "px", min: 12,  max: 90,   step: 2,  value: 40   },

  // Concept Lab
  { key: "conceptText",  group: "Concept Lab",  label: "Explanation text size", cssVar: "--concept-text",  unit: "px", min: 11,  max: 16,   step: 0.5, value: 12.5 },
  { key: "conceptChartH",group: "Concept Lab",  label: "Plot height",           cssVar: null,              unit: "px", min: 200, max: 440,  step: 10, value: 300  },

  // Results Lab
  { key: "resultOrigMax",group: "Results Lab",  label: "Original-figure box width", cssVar: "--result-orig-max", unit: "px", min: 220, max: 680, step: 10, value: 520 },
  { key: "resultText",   group: "Results Lab",  label: "Explanation text size", cssVar: "--result-text",   unit: "px", min: 11,  max: 16,   step: 0.5, value: 12.5 },
  { key: "panelChartH",  group: "Results Lab",  label: "Subplot height",        cssVar: null,              unit: "px", min: 120, max: 280,  step: 10, value: 170  },

  // Foundations
  { key: "foundText",    group: "Foundations",  label: "Card text size",        cssVar: "--found-text",    unit: "px", min: 11,  max: 16,   step: 0.5, value: 13   },
];

/* The chapters — editable title + subtitle + on/off, like slides. */
export const DEFAULT_SECTIONS = [
  { key: "story",       on: true, title: "Why this paper exists",       sub: "The story in plain language: the problem, what earlier work couldn't do, and exactly what this paper adds." },
  { key: "mindmap",     on: true, title: "The whole paper, one map",    sub: "A clickable concept map — the problem, the prior work, the method, the contributions and the headline result, all in one place. Click any node to read what it means." },
  { key: "concept",     on: true, title: "The idea, in pictures",       sub: "The paper's own introductory figures, cropped and explained. Click any figure to open it fullscreen with its full explanation." },
  { key: "foundations", on: true, title: "Background you need first",   sub: "Key ideas from earlier work that this paper builds on — quick lessons before the new contribution makes sense." },
  { key: "model",       on: true, title: "The physics & the model",     sub: "What the paper actually did: experiment or simulation, the real instruments and software, the governing equations term by term, and the assumptions everything rests on." },
  { key: "method",      on: true, title: "Learn the method by playing", sub: "An app-style lab: pick a step of the pipeline on the left, watch the animated signal flow, turn its dials and see the plot react — plain language throughout." },
  { key: "explorables", on: true, title: "Play with the paper's own model", sub: "The paper's own equations on sliders, and its own reported numbers made interactive — hands-on even when the full method can't be simulated." },
  { key: "results",     on: true, title: "The results, from the paper itself", sub: "Every key result figure, cropped from the PDF with clickable hotspots and a guided tour — plus a live reproduction wherever one can honestly be built." },
  { key: "reverse",     on: true, title: "Reverse-engineer the paper",  sub: "The ultimate test of understanding: scramble the model's parameters, then let an in-browser optimizer recover the authors' operating point from nothing but the curves digitized off the published figures." },
  { key: "claims",      on: true, title: "Claims vs evidence",          sub: "Every headline claim, tagged by how directly the paper's OWN figures and tables back it — shown, inferred, or only asserted. A researcher's honest read of what this paper actually proves." },
  { key: "flashcards",  on: true, title: "Remember this paper",         sub: "The must-remember facts as flip cards — the key equation, the headline number, the central assumption. Flip through, mark what you know, come back later." },
];

/* Free-form canvas boxes: id -> { x,w in % of canvas width; y,h in px; font mult }.
 * The values below are the finalized "master slide" the maintainer approved —
 * every paper renders against this by default; visitors can still rearrange. */
export const DEFAULT_LAYOUT = {
  version: LAYOUT_VERSION,
  numeric: {
    ...Object.fromEntries(NUMERIC_DEFS.map((d) => [d.key, d.value])),
    contentMax: 2600, pagePad: 12, sideNavW: 216, cardRadius: 18,
    titleSize: 29, authorSize: 13, abstractSize: 15,
    secBadge: 38, secHead: 20, secSub: 15, secGap: 36,
    conceptText: 13, conceptChartH: 300,
    resultOrigMax: 680, resultText: 14.5, panelChartH: 220,
    foundText: 14.5,
  },
  sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
  freeMode: false, // flow by default; the box geometry below applies when arranging
  boxes: {
    conclusion:        { x: 5,   y: 40,   w: 89.5, h: 176,  font: 1 },
    "sec-concept":     { x: 5,   y: 264,  w: 89.5, h: 976,  font: 1 },
    "sec-foundations": { x: 5,   y: 1304, w: 89.5, h: 968,  font: 1.5 },
    "sec-method":      { x: 4.5, y: 2384, w: 90,   h: 904,  font: 1.5 },
    "sec-results":     { x: 4.5, y: 3384, w: 90,   h: 1272, font: 1.5 },
  },
};

export function loadLayout() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return structuredClone(DEFAULT_LAYOUT);
    const saved = JSON.parse(raw);
    const savedNumeric = { ...(saved.numeric || {}) };
    if ((saved.version || 1) < LAYOUT_VERSION) {
      for (const k of V2_RESET_KEYS) delete savedNumeric[k];
    }
    return {
      version: LAYOUT_VERSION,
      numeric: { ...DEFAULT_LAYOUT.numeric, ...savedNumeric },
      // merge by KEY (not index) so newly added sections appear with their
      // defaults instead of scrambling an older saved layout
      sections: DEFAULT_SECTIONS.map((d) => ({
        ...d,
        ...(saved.sections?.find?.((s) => s.key === d.key) || {}),
      })),
      freeMode: !!saved.freeMode,
      boxes: saved.boxes || {},
    };
  } catch {
    return structuredClone(DEFAULT_LAYOUT);
  }
}

export function saveLayout(layout) {
  try { localStorage.setItem(STORAGE, JSON.stringify(layout)); } catch { /* non-fatal */ }
}

export function resetLayout() {
  try { localStorage.removeItem(STORAGE); } catch { /* non-fatal */ }
  return structuredClone(DEFAULT_LAYOUT);
}

/** Build the CSS-variable style object applied to the workspace root. */
export function layoutStyle(layout) {
  const style = {};
  for (const d of NUMERIC_DEFS) {
    if (!d.cssVar) continue;
    style[d.cssVar] = `${layout.numeric[d.key]}${d.unit}`;
  }
  return style;
}

/**
 * Never returns undefined. Not every section on screen is an EDITABLE section:
 * the paper's own reading surface is a live document, not a titled card in the
 * layout editor, so `sectionByKey(layout, "paper")` legitimately has nothing to
 * find. Returning undefined made every `sec(id).title` call site a latent crash
 * — and one of them ran on every render, closed or not.
 */
export function sectionByKey(layout, key) {
  return (
    layout.sections.find((s) => s.key === key) ||
    DEFAULT_SECTIONS.find((s) => s.key === key) ||
    { key, on: true, title: "", sub: "" }
  );
}
