/**
 * Re-time the landing demo GIFs — play them faster without re-encoding a pixel.
 *
 * Run: node scripts/gif-speed.mjs [factor]      (default 1.5)
 *
 * A GIF carries its own pace: every frame has a delay, in hundredths of a
 * second, in that frame's Graphic Control Extension. Nothing on the page can
 * override it — an <img> exposes no playback rate, and the recordings play at
 * whatever speed they were captured at. So the speed-up happens here, by
 * walking the GIF's block structure and dividing each delay. The image data
 * is copied through untouched, so this is lossless and costs no quality.
 *
 * SOURCE IS THE ROOT ORIGINAL, output is public/. Rewriting public/ in place
 * would compound every time it ran — 1.5x twice is 2.25x — so the untouched
 * capture in the project root stays the source of truth and this is
 * re-runnable with any factor. (The root copies are git-ignored; the served
 * copies in public/ are what ship.)
 *
 * Delays are clamped at 2 centiseconds because browsers treat 0 and 1 as
 * "unspecified" and substitute 10 — a frame sped up past the limit would come
 * out ten times SLOWER than it started.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const factor = Number(process.argv[2] || 1.5);
if (!Number.isFinite(factor) || factor <= 0) {
  console.error(`"${process.argv[2]}" is not a speed factor`);
  process.exit(1);
}

/** Browsers clamp anything below this to 10cs. See the header. */
const MIN_DELAY_CS = 2;

/** Skip a chain of length-prefixed sub-blocks; returns the offset after it. */
function skipSubBlocks(buf, at) {
  for (;;) {
    const len = buf[at];
    at += 1;
    if (!len) return at;
    at += len;
  }
}

/**
 * Divide every frame delay by `by`, in place on a copy of the buffer.
 * Returns { out, frames, before, after } — the totals are in centiseconds, so
 * the caller can report the real change rather than the requested one.
 */
function retime(buf, by) {
  const out = Buffer.from(buf);
  if (out.toString("latin1", 0, 3) !== "GIF") throw new Error("not a GIF");

  let at = 6;
  const packed = out[at + 4];
  at += 7;                                              // logical screen descriptor
  if (packed & 0x80) at += 3 * (1 << ((packed & 7) + 1)); // global colour table

  let frames = 0, before = 0, after = 0;
  for (;;) {
    if (at >= out.length) break;
    const marker = out[at];

    if (marker === 0x3b) break;                          // trailer

    if (marker === 0x21) {                               // extension
      const label = out[at + 1];
      at += 2;
      if (label === 0xf9) {                              // graphic control: the delay lives here
        const size = out[at];                            // always 4, but read it
        const delayAt = at + 2;                          // after size byte + packed byte
        const was = out.readUInt16LE(delayAt);
        const now = Math.max(MIN_DELAY_CS, Math.round(was / by));
        out.writeUInt16LE(now, delayAt);
        frames += 1; before += was; after += now;
        at = skipSubBlocks(out, at + 1 + size);
      } else {
        at = skipSubBlocks(out, at);
      }
      continue;
    }

    if (marker === 0x2c) {                               // image descriptor
      const p = out[at + 9];
      at += 10;
      if (p & 0x80) at += 3 * (1 << ((p & 7) + 1));      // local colour table
      at += 1;                                            // LZW minimum code size
      at = skipSubBlocks(out, at);
      continue;
    }

    throw new Error(`unexpected block 0x${marker.toString(16)} at ${at}`);
  }
  return { out, frames, before, after };
}

const sources = fs.readdirSync(ROOT).filter((f) => /^sciloupe-demo-.*\.gif$/.test(f));
if (!sources.length) {
  console.error("no sciloupe-demo-*.gif originals in the project root to re-time");
  process.exit(1);
}

let failures = 0;
for (const name of sources) {
  const dest = path.join(PUBLIC, name);
  /* Only re-times what the site actually serves. A recording dropped in the
   * root and never wired into DemoStrip has no public/ copy, and creating one
   * would ship a file nothing links to. */
  if (!fs.existsSync(dest)) {
    console.log(`  skip ${name} — not served from public/`);
    continue;
  }
  try {
    const { out, frames, before, after } = retime(fs.readFileSync(path.join(ROOT, name)), factor);
    fs.writeFileSync(dest, out);
    console.log(
      `  ok   ${name} — ${frames} frames, ${(before / 100).toFixed(1)}s → ${(after / 100).toFixed(1)}s ` +
      `(${(before / after).toFixed(2)}x)`,
    );
  } catch (e) {
    failures++;
    console.error(`  FAIL ${name} — ${e.message}`);
  }
}
process.exit(failures ? 1 : 0);
