/**
 * Client side of the on-demand figure read (see supabase/functions/assist-digitize).
 *
 * The model returns a CALIBRATION, not data — axis labels, tick numbers and
 * positions, the plot box, and each series' legend label and colour. This
 * module's job is to turn that into the digitizer's own subplot shape and to
 * refuse anything that would seed a silently-wrong trace: a scale built from
 * one tick, a log axis calibrated on a non-positive value, two ticks at the
 * same position. A rejected panel arrives blank and the human calibrates it by
 * hand, which is exactly what happened before this feature existed.
 */

import { getAccessToken, functionsUrl, supabaseAnonKey } from "./supabase.js";

/** Ask the server to read one figure. `image` is the crop's data URL. */
export async function assistDigitize({ image, figureLabel, title, caption }) {
  if (!functionsUrl) throw new Error("Figure reading isn't configured for this deployment.");
  if (!image) throw new Error("There's no figure image to read.");

  const token = await getAccessToken();
  if (!token) {
    const e = new Error("Sign in to read this figure with AI.");
    e.code = "auth";
    throw e;
  }

  const res = await fetch(`${functionsUrl}/assist-digitize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ image, figureLabel, title, caption }),
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const e = new Error(data?.error || `Figure read failed (${res.status}).`);
    if (res.status === 402) e.code = "credit";
    throw e;
  }
  if (!data?.hint?.subplots?.length) throw new Error("Nothing readable came back — try again.");

  return { hint: data.hint, cost: data.cost || 0, remainingBalance: data.remainingBalance };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const finite = (v) => Number.isFinite(v);

/**
 * Two ticks far enough apart to define a scale.
 *
 * Rejects the failure modes that produce a calibration which LOOKS fine and
 * is wrong: a single tick (no scale at all), two ticks the model placed at the
 * same fraction (infinite slope), two ticks with the same value (zero slope),
 * and a log axis anchored on zero or a negative number.
 */
function pickPair(ticks, isLog) {
  const clean = (ticks || [])
    .filter((t) => finite(t?.atFrac) && finite(t?.value))
    .filter((t) => !isLog || t.value > 0)
    .map((t) => ({ f: clamp01(t.atFrac), val: t.value }))
    .sort((a, b) => a.f - b.f);
  if (clean.length < 2) return null;
  const a = clean[0], b = clean[clean.length - 1];
  if (Math.abs(b.f - a.f) < 0.02) return null;   // same place on the axis
  if (a.val === b.val) return null;              // same number twice
  return { a, b };
}

const HUES = ["#2a78d6", "#1baf7a", "#eda100", "#e34948", "#4a3aa7", "#e87ba4"];
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * The model's read → the digitizer's subplots.
 *
 * Returns { subplots, skipped } where `skipped` names the panels whose axes
 * couldn't be trusted; they are still returned, just uncalibrated, so the
 * figure's panel structure and curve colours are kept even when the numbers
 * weren't legible.
 */
export function hintToSubplots(hint, makeSubplot) {
  const subplots = [];
  const skipped = [];

  (hint?.subplots || []).forEach((p, i) => {
    const label = p.label || `subplot ${i + 1}`;
    const r = p.region;
    const region = r && finite(r.fx0) && finite(r.fy0) && finite(r.fx1) && finite(r.fy1)
      // The model occasionally returns the corners the other way round; a box
      // is a box regardless of which corner it named first.
      ? {
          fx0: clamp01(Math.min(r.fx0, r.fx1)), fy0: clamp01(Math.min(r.fy0, r.fy1)),
          fx1: clamp01(Math.max(r.fx0, r.fx1)), fy1: clamp01(Math.max(r.fy0, r.fy1)),
        }
      : null;
    const usable = region && region.fx1 - region.fx0 > 0.02 && region.fy1 - region.fy0 > 0.02
      ? region : null;

    const s = makeSubplot(label, usable);
    s.xLabel = p.xLabel || "x";
    s.yLabel = p.yLabel || "y";
    s.xLog = !!p.xLog;
    s.yLog = !!p.yLog;
    // "other" means the model judged this panel to have no numeric axes — a
    // photo or a schematic. Keep it as a line panel so the human can override,
    // but never pretend it was calibrated.
    if (p.kind && p.kind !== "other" && ["line", "radar", "box", "heatmap", "violin"].includes(p.kind)) {
      s.kind = p.kind;
    }

    const xs = pickPair(p.xTicks, s.xLog);
    const ys = pickPair(p.yTicks, s.yLog);
    if (xs && ys) {
      s.cal = {
        xA: { f: xs.a.f, val: xs.a.val }, xB: { f: xs.b.f, val: xs.b.val },
        yA: { f: ys.a.f, val: ys.a.val }, yB: { f: ys.b.f, val: ys.b.val },
      };
    } else {
      skipped.push(label);
    }

    if (p.curves?.length) {
      s.curves = p.curves.map((c, k) => ({
        label: c.label || `curve ${k + 1}`,
        colorHex: HEX.test(c.colorHex || "") ? c.colorHex.toLowerCase() : HUES[k % HUES.length],
        tol: 0.12,
        points: [],
      }));
      s.activeCurve = 0;
    }

    subplots.push(s);
  });

  return { subplots, skipped };
}
