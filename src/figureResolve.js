/**
 * ONE resolution from "the reader asked for this to be live" to "the paper's
 * own figure, which the analysis already digitized".
 *
 * Three gestures ask for a live panel — the figure card's button, a text
 * selection, a table/listing selection — and each used to decide for itself
 * whether an already-traced reproduction existed. Only one of them actually
 * checked, so selecting a sentence that says "Fig. 4" went straight to the
 * metered builder and got a calendar heat map reinvented as a line chart,
 * while clicking that same figure's card returned the real thing for free.
 * Which gesture the reader happened to use decided whether they got the truth.
 *
 * This module is that decision, in one place, with no React in it: pull a
 * figure number out of the request, look it up among the figures we hold a
 * crop for, and confirm at least one of its panels can be drawn right now.
 * Nothing resolves → the caller falls through to the on-demand builder, which
 * is what that builder is actually for (equations, passages, and the rare
 * figure Phase 5 honestly gave up on).
 */

import { freePanels } from "./DigitizedPanels.jsx";

/* "Fig. 4", "Figure 4", "FIG.4(b)", "Figs. 4 and 5" → 4. First mention wins:
 * it is the one the sentence is about. Two digits max — "Fig. 2019" is a year
 * that happens to follow the word, not a figure number. */
const FIG_RE = /\b(?:figures?|figs?)\.?\s*(\d{1,2})\b/i;

/** The figure number a request is about, or null. */
export function figureNumberIn(text) {
  const m = String(text || "").match(FIG_RE);
  return m ? +m[1] : null;
}

/**
 * @param quote     the selected text / figure blurb the reader is asking about
 * @param figNum    a figure number the caller already knows (caption selection)
 * @param figByNum  Map<number, { label, panels, … }> of figures we hold a crop for
 * @returns the figure when it has at least one panel renderable for free, else null
 */
export function resolveFigureForPanel(quote, figNum, figByNum) {
  const n = Number.isInteger(figNum) ? figNum : figureNumberIn(quote);
  if (n == null || !figByNum) return null;
  const fig = figByNum.get(n);
  if (!fig) return null;
  return freePanels(fig.panels).length ? fig : null;
}
