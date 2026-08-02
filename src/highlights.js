/**
 * The reader's own highlighter, per paper.
 *
 * Marking a sentence is the oldest reading gesture there is, and unlike
 * "keep this" it is not a clipping filed away somewhere else — it stays ON the
 * page, where the reader put it, and is still there when they come back. So it
 * is stored the same way the notebook is: localStorage, keyed by paper, no
 * round-trip and no signed-in session required.
 *
 * A highlight is stored as the QUOTE, not as coordinates. Page geometry depends
 * on zoom, fit mode and the pdf.js text layer's own line breaking; a rectangle
 * captured at 150% would sit in the wrong place at fit-to-height. The quote is
 * re-located against the page's text index on render (the same matcher the
 * provenance marks use), so a highlight lands correctly at any zoom.
 */

const STORAGE = "paper-playground-highlights";
const MAX_PER_PAPER = 300;

export const HL_COLORS = [
  { key: "yellow", label: "Yellow", css: "rgba(250, 204, 21, 0.40)", ring: "#eab308", dot: "#facc15" },
  { key: "green",  label: "Green",  css: "rgba(52, 211, 153, 0.38)", ring: "#10b981", dot: "#34d399" },
  { key: "blue",   label: "Blue",   css: "rgba(56, 189, 248, 0.38)", ring: "#0ea5e9", dot: "#38bdf8" },
  { key: "pink",   label: "Pink",   css: "rgba(244, 114, 182, 0.38)", ring: "#ec4899", dot: "#f472b6" },
];
export const colorOf = (k) => HL_COLORS.find((c) => c.key === k) || HL_COLORS[0];

/** Papers are keyed by title — same identifier the notebook uses. */
function paperKey(spec) {
  const t = spec?.meta?.title?.trim();
  return t ? t.slice(0, 200) : "untitled-paper";
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE);
    const all = raw ? JSON.parse(raw) : {};
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(all));
  } catch {
    // Quota, private mode, storage disabled — highlighting is a convenience.
  }
}

export function loadHighlights(spec) {
  const list = readAll()[paperKey(spec)];
  return Array.isArray(list) ? list : [];
}

const newId = () => `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Add one. `{ quote, page, color, sectionLabel }` → the new list. */
export function addHighlight(spec, { quote, page, color = "yellow", sectionLabel }) {
  const all = readAll();
  const key = paperKey(spec);
  const list = Array.isArray(all[key]) ? all[key] : [];
  // Re-highlighting the same passage recolours it rather than stacking two
  // washes on top of each other, which reads as a darker, arbitrary third
  // colour and can never be removed in one click.
  const same = list.find((h) => h.page === page && h.quote === quote);
  const next = same
    ? list.map((h) => (h.id === same.id ? { ...h, color } : h))
    : [{ id: newId(), at: Date.now(), quote, page, color, sectionLabel }, ...list].slice(0, MAX_PER_PAPER);
  all[key] = next;
  writeAll(all);
  return next;
}

export function removeHighlight(spec, id) {
  const all = readAll();
  const key = paperKey(spec);
  all[key] = (all[key] || []).filter((h) => h.id !== id);
  writeAll(all);
  return all[key];
}

export function clearHighlights(spec) {
  const all = readAll();
  delete all[paperKey(spec)];
  writeAll(all);
  return [];
}
