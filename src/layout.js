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

/* Each numeric knob: { group, label, cssVar, unit, min, max, step, value } */
export const NUMERIC_DEFS = [
  // Global
  { key: "contentMax",   group: "Global",       label: "Page width",            cssVar: "--content-max",   unit: "px", min: 900, max: 1600, step: 20, value: 1280 },
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

/* The four chapters — editable title + subtitle + on/off, like slides. */
export const DEFAULT_SECTIONS = [
  { key: "concept",     on: true, title: "The idea, in pictures",       sub: "The paper's own introductory figures, cropped and explained. Click any figure to open it fullscreen with its full explanation." },
  { key: "foundations", on: true, title: "Background you need first",   sub: "Key ideas from earlier work that this paper builds on — quick lessons before the new contribution makes sense." },
  { key: "method",      on: true, title: "Learn the method by playing", sub: "An app-style lab: pick a step of the pipeline on the left, watch the animated signal flow, turn its dials and see the plot react — plain language throughout." },
  { key: "results",     on: true, title: "The results, recreated and alive", sub: "Pick any of the paper's result figures on the left: the original beside its interactive reproduction — every subplot, every curve — reshaping as you tune the parameters." },
];

export const DEFAULT_LAYOUT = {
  numeric: Object.fromEntries(NUMERIC_DEFS.map((d) => [d.key, d.value])),
  sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
};

export function loadLayout() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return structuredClone(DEFAULT_LAYOUT);
    const saved = JSON.parse(raw);
    return {
      numeric: { ...DEFAULT_LAYOUT.numeric, ...(saved.numeric || {}) },
      sections: DEFAULT_SECTIONS.map((d, i) => ({ ...d, ...(saved.sections?.[i] || {}) })),
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

export function sectionByKey(layout, key) {
  return layout.sections.find((s) => s.key === key) || DEFAULT_SECTIONS.find((s) => s.key === key);
}
