/**
 * The reader's own notebook for one paper.
 *
 * Every panel they built and every passage they saved belongs to THEM, not to
 * the analysis: it is the record of where this particular reader struggled and
 * what they went and made to get past it. A one-shot popup throws that away
 * the moment it closes, so their path through the paper is kept — and it is
 * kept per paper, because that path is only meaningful next to the paper it
 * was cut through.
 *
 * Stored in localStorage rather than the account: it is small, it is private
 * to the device, and it must survive a reload without needing a round-trip or
 * a signed-in session. Generated panels are already paid for, so losing them
 * to a refresh would mean paying twice.
 */

const STORAGE = "paper-playground-notebook";
const MAX_ENTRIES_PER_PAPER = 60;

/** Papers are keyed by title — the one identifier a sample, a fresh analysis
 *  and a library reopen all share. */
export function paperKey(spec) {
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
    // Quota exceeded, private mode, disabled storage — the notebook is a
    // convenience, never a precondition for reading the paper.
  }
}

/** Everything saved for one paper, newest first. */
export function loadNotebook(spec) {
  const list = readAll()[paperKey(spec)];
  return Array.isArray(list) ? list : [];
}

/**
 * Append an entry and return the new list.
 * `entry` is { kind: "panel" | "note", ... } — see addPanel / addNote.
 */
function push(spec, entry) {
  const all = readAll();
  const key = paperKey(spec);
  const list = Array.isArray(all[key]) ? all[key] : [];
  // Newest first, and bounded: a notebook is a record, not a log.
  const next = [entry, ...list].slice(0, MAX_ENTRIES_PER_PAPER);
  all[key] = next;
  writeAll(all);
  return next;
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A panel the reader had built for a passage. `panel` is {title, story, source, demo}. */
export function addPanel(spec, { panel, quote, page, sectionLabel, cost }) {
  return push(spec, {
    id: newId(),
    kind: "panel",
    at: Date.now(),
    quote, page, sectionLabel,
    cost: cost || 0,
    panel,
  });
}

/** A passage the reader kept, with whatever the assistant said about it. */
export function addNote(spec, { quote, page, sectionLabel, text }) {
  return push(spec, {
    id: newId(),
    kind: "note",
    at: Date.now(),
    quote, page, sectionLabel, text,
  });
}

export function removeEntry(spec, id) {
  const all = readAll();
  const key = paperKey(spec);
  const next = (all[key] || []).filter((e) => e.id !== id);
  all[key] = next;
  writeAll(all);
  return next;
}

export function clearNotebook(spec) {
  const all = readAll();
  delete all[paperKey(spec)];
  writeAll(all);
  return [];
}

/** How many panels this paper has generated — drives the spend cap. */
export function panelCount(spec) {
  return loadNotebook(spec).filter((e) => e.kind === "panel").length;
}

/** What this paper's panels have cost so far, in USD. */
export function panelSpend(spec) {
  return loadNotebook(spec).reduce((s, e) => s + (e.kind === "panel" ? e.cost || 0 : 0), 0);
}
