#!/usr/bin/env node
/**
 * Turn a PDF into text + page images for the offline fixture harness.
 *
 * The analyzer's real input is the PDF itself, sent to the API as a document
 * block. Recording a phase offline means handing the same paper to something
 * that can only read files, so the paper has to be unpacked first: prose for
 * the argument and the equations, page renders for the figures the spec has to
 * describe (conceptFigures, resultFigures). Text alone is not enough — a
 * figure's shape is the thing being asked about.
 *
 * pdfjs-dist and @napi-rs/canvas are already dependencies (see the extract-figs
 * scripts), so this needs nothing installed.
 *
 * Usage:
 *   node scripts/pdf-pages.mjs --pdf papers/foo.pdf
 *   node scripts/pdf-pages.mjs --pdf papers/foo.pdf --pages 4-9 --scale 2.5
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, Path2D, DOMMatrix, ImageData } from "pdfjs-dist/node_modules/@napi-rs/canvas/index.js";

globalThis.Path2D = Path2D;
globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
}

const pdfPath = arg("pdf");
if (!pdfPath) {
  console.error("usage: --pdf <file.pdf> [--pages 1-20] [--scale 2] [--out <dir>]");
  process.exit(1);
}
const scale = Number(arg("scale", "2"));

/** pdfjs needs its own canvas factory in Node — no DOM to borrow one from. */
class NodeCanvasFactory {
  create(w, h) { const c = createCanvas(w, h); return { canvas: c, context: c.getContext("2d") }; }
  reset(cc, w, h) { cc.canvas.width = w; cc.canvas.height = h; }
  destroy(cc) { cc.canvas.width = 0; cc.canvas.height = 0; }
}

const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await getDocument({
  data,
  canvasFactory: new NodeCanvasFactory(),
  standardFontDataUrl: path.join(ROOT, "node_modules", "pdfjs-dist", "standard_fonts") + path.sep,
}).promise;

const outDir = arg("out") || path.join(ROOT, "scratch", "pages", path.basename(pdfPath, ".pdf"));
fs.mkdirSync(outDir, { recursive: true });

/** "4-9" | "7" | null → the pages to render (text always covers all of them). */
function pageRange(spec, total) {
  if (!spec) return Array.from({ length: total }, (_, i) => i + 1);
  const [a, b] = spec.split("-").map(Number);
  const lo = Math.max(1, a || 1);
  const hi = Math.min(total, b || a || total);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

// --- Text: every page, one file. Items are grouped into lines by their y
// position, because pdfjs emits runs, not lines.
let text = `${path.basename(pdfPath)} — ${doc.numPages} pages\n`;
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const lines = [];
  let last = null, line = "";
  for (const it of tc.items) {
    const y = it.transform[5];
    if (last !== null && Math.abs(y - last) > 3) { lines.push(line); line = ""; }
    line += it.str;
    last = y;
  }
  if (line) lines.push(line);
  text += `\n===== PAGE ${p} =====\n${lines.join("\n")}\n`;
}
const textPath = path.join(outDir, "text.txt");
fs.writeFileSync(textPath, text, "utf8");

// --- Images: the requested range, for the figures.
const pages = pageRange(arg("pages"), doc.numPages);
for (const p of pages) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale });
  const c = createCanvas(vp.width, vp.height);
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp, canvasFactory: new NodeCanvasFactory() }).promise;
  fs.writeFileSync(path.join(outDir, `p${String(p).padStart(2, "0")}.png`), c.toBuffer("image/png"));
}

console.log(`pages   ${doc.numPages}`);
console.log(`text    ${path.relative(ROOT, textPath)} (${text.length.toLocaleString()} chars)`);
console.log(`images  ${pages.length} rendered at ${scale}x → ${path.relative(ROOT, outDir)}`);
