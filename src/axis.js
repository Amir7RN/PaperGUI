/**
 * Axis tick labels for a reproduced figure.
 *
 * Its own module rather than a helper inside the renderer, because it is the
 * one piece of chart code with a checkable right answer: the labels a
 * reproduction prints must be the labels the paper printed. That makes it
 * testable in isolation (scripts/check-axis.mjs), and a test that imports the
 * real function is worth more than one that keeps a copy of it.
 */

export const fmt = (v, d = 2) =>
  (v === undefined || v === null || Number.isNaN(+v) ? "–" : (+v).toFixed(d));

/**
 * A formatter with enough decimals to tell its own ticks apart.
 *
 * A fixed number of decimals is wrong for every axis it wasn't chosen for. On
 * a 0.1 → 0.25 axis, one decimal turned the paper's own ticks — 0.1, 0.15,
 * 0.2, 0.25 — into "0.1, 0.1, 0.2, 0.2": two pairs of identical labels at
 * different heights, on a chart whose entire claim is that it was traced off
 * the real figure. A reader who checks it against the paper finds it wrong,
 * and is right.
 *
 * The precision an axis needs is a property OF THE AXIS: whatever it takes to
 * distinguish one tick from the next. Capped at four decimals, past which the
 * label is noise rather than information.
 */
export function axisFmt(lo, hi, ticks = 5) {
  const step = Math.abs(hi - lo) / Math.max(1, ticks - 1);
  if (!Number.isFinite(step) || step === 0) return (v) => fmt(v, 2);
  // A step of 0.05 needs 2 decimals; 0.5 needs 1; 5 needs 0.
  const d = Math.min(4, Math.max(0, Math.ceil(-Math.log10(step)) + 1));
  return (v) => {
    if (v === undefined || v === null || Number.isNaN(+v)) return "–";
    const s = (+v).toFixed(d);
    // Don't print "0.2500" when "0.25" says the same thing.
    return d > 0 && s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
  };
}
