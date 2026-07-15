/**
 * Plot digitizer core — the WebPlotDigitizer technique, reimplemented as pure
 * functions so a curve traced off a paper's REAL figure becomes accurate data
 * instead of numbers the model eyeballed off the plot.
 *
 * Everything here works in the figure image's FRACTION space: a point is
 * {fx, fy} with fx,fy in [0,1], origin top-left of the cropped figure image.
 * Fraction space is resolution-independent, so calibration set on a small
 * preview stays valid when the same image is read at natural resolution for
 * auto-tracing. Calibration then maps fraction → the plot's DATA coordinates.
 *
 * The reader (or an auto-seed from the vision model) marks two reference
 * points on each axis — a known data value at a known position — and that
 * fixes the pixel→data mapping. Axes are treated as decoupled and axis-aligned
 * (x depends only on fx, y only on fy), which is true for essentially every
 * PDF result figure and far more stable than solving a full affine transform.
 */

const log10 = (v) => Math.log(v) / Math.LN10;

/**
 * Build a calibration from two reference points per axis.
 *   xRef / yRef: [{ f: fraction 0..1 along that axis, val: data value }, …] (>=2)
 *   xLog / yLog: interpolate that axis in log10 space (decade-linear ticks)
 * Returns { toData, toFrac, xLog, yLog } or null if under-specified/degenerate.
 */
export function makeCalibration({ xRef, yRef, xLog = false, yLog = false }) {
  const axis = (refs, isLog) => {
    if (!Array.isArray(refs) || refs.length < 2) return null;
    const [a, b] = refs;
    if (!Number.isFinite(a.f) || !Number.isFinite(b.f) || a.f === b.f) return null;
    if (!Number.isFinite(a.val) || !Number.isFinite(b.val)) return null;
    if (isLog && (a.val <= 0 || b.val <= 0)) return null; // log needs positive ticks
    const va = isLog ? log10(a.val) : a.val;
    const vb = isLog ? log10(b.val) : b.val;
    const slope = (vb - va) / (b.f - a.f);
    return {
      toData: (f) => { const v = va + (f - a.f) * slope; return isLog ? Math.pow(10, v) : v; },
      toFrac: (val) => { const v = isLog ? log10(val) : val; return a.f + (v - va) / slope; },
    };
  };
  const X = axis(xRef, xLog);
  const Y = axis(yRef, yLog);
  if (!X || !Y) return null;
  return {
    xLog, yLog,
    toData: (fx, fy) => ({ x: X.toData(fx), y: Y.toData(fy) }),
    toFrac: (x, y) => ({ fx: X.toFrac(x), fy: Y.toFrac(y) }),
  };
}

/** Squared RGB distance (cheap; good enough for solid plot lines). */
function colorDist2(r, g, b, tr, tg, tb) {
  const dr = r - tr, dg = g - tg, db = b - tb;
  return dr * dr + dg * dg + db * db;
}

/**
 * Automatic curve extraction by colour, WebPlotDigitizer "averaging window"
 * style: scan the image column by column, and in each column average the
 * y-positions of every pixel close to the target colour. That collapses a
 * multi-pixel-thick, anti-aliased line into one point per column.
 *
 *   imageData : ImageData at natural resolution (w×h RGBA)
 *   target    : { r, g, b } the curve's colour (from an eyedrop click)
 *   tol       : 0..1 colour tolerance (fraction of the max RGB distance)
 *   region    : optional { fx0, fy0, fx1, fy1 } fraction box to restrict to
 *   xStep     : sample every N-th column (natural px); default 2
 *
 * Returns ordered fraction points [{ fx, fy }] (empty if the colour isn't found).
 */
export function autoTraceColor(imageData, target, { tol = 0.12, region = null, xStep = 2 } = {}) {
  const { data, width: w, height: h } = imageData;
  const maxD2 = 3 * 255 * 255;
  const thresh = tol * tol * maxD2;
  const x0 = Math.max(0, Math.floor((region?.fx0 ?? 0) * w));
  const x1 = Math.min(w, Math.ceil((region?.fx1 ?? 1) * w));
  const y0 = Math.max(0, Math.floor((region?.fy0 ?? 0) * h));
  const y1 = Math.min(h, Math.ceil((region?.fy1 ?? 1) * h));
  const pts = [];
  for (let x = x0; x < x1; x += xStep) {
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 32) continue; // transparent
      if (colorDist2(data[i], data[i + 1], data[i + 2], target.r, target.g, target.b) <= thresh) {
        sum += y; n++;
      }
    }
    if (n > 0) pts.push({ fx: x / w, fy: sum / n / h });
  }
  return pts;
}

/** Read the RGB at a fraction position (for the eyedrop colour pick). */
export function sampleColor(imageData, fx, fy) {
  const { data, width: w, height: h } = imageData;
  const x = Math.min(w - 1, Math.max(0, Math.round(fx * w)));
  const y = Math.min(h - 1, Math.max(0, Math.round(fy * h)));
  const i = (y * w + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

/** #rrggbb → {r,g,b} (null on bad input). */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** {r,g,b} → #rrggbb */
export function rgbToHex({ r, g, b }) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Convert a set of fraction points + a calibration into real DATA points,
 * sorted by x and de-duplicated onto a monotonic x grid (drop backtracks so a
 * noisy trace still plots as a function). Returns [[x, y], …].
 */
export function fracPointsToData(fracPts, cal) {
  if (!cal) return [];
  const data = fracPts
    .map((p) => { const d = cal.toData(p.fx, p.fy); return [d.x, d.y]; })
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .sort((a, b) => a[0] - b[0]);
  // collapse near-equal x (average y) so interpolation stays well-defined
  const out = [];
  for (const [x, y] of data) {
    const last = out[out.length - 1];
    if (last && Math.abs(x - last[0]) < 1e-9) { last[1] = (last[1] + y) / 2; }
    else out.push([x, y]);
  }
  return out;
}

/**
 * Transform an auto-seed position the vision model expressed as a fraction of
 * the FIGURE'S OWN bbox into a fraction of our padded CROP (what the reader
 * actually sees). renderPdfRegions pads the bbox by `pad` on every side, so the
 * crop spans (dim + 2·pad) in page-fraction units and the bbox starts `pad` in.
 * Returns the crop-space fraction (clamped to [0,1]).
 */
export function bboxFracToCropFrac(f, bboxSize, pad = 0.015) {
  if (!Number.isFinite(f) || !Number.isFinite(bboxSize) || bboxSize <= 0) return f;
  const span = bboxSize + 2 * pad;
  return Math.max(0, Math.min(1, (f * bboxSize + pad) / span));
}
