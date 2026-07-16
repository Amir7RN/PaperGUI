/**
 * Extract the six data figures (Figs 3–8) from supplychain.pdf into public/figs/
 * as sc-figN.jpg. Dev-time script (node scripts/extract-figs-supplychain.mjs).
 *
 * Figs 1 & 2 (the MPH phase flow charts) are deliberately NOT cropped here —
 * they are rebuilt as animated inline SVG in src/samplePaper3.js, which is far
 * more legible and eye-catching than a flat crop of a boxes-and-arrows diagram.
 *
 * Each target gives the SOURCE PAGE and a fraction-space crop box {x0,y0,x1,y1}
 * (0..1 of the rendered page, top-left origin), read off the full-page renders.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, Path2D, DOMMatrix, ImageData } from "@napi-rs/canvas";

globalThis.Path2D = Path2D;
globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const PDF = path.join(root, "supplychain.pdf");
const OUT_DIR = path.join(root, "public", "figs");

// page + fraction-space crop box for each figure
const TARGETS = [
  { out: "sc-fig3", page: 7,  box: { x0: 0.135, y0: 0.060, x1: 0.865, y1: 0.470 } }, // gross sales by category
  { out: "sc-fig4", page: 7,  box: { x0: 0.055, y0: 0.618, x1: 0.905, y1: 0.910 } }, // calendar heatmap
  { out: "sc-fig5", page: 8,  box: { x0: 0.120, y0: 0.520, x1: 0.905, y1: 0.935 } }, // monthly SKU lines
  { out: "sc-fig6", page: 9,  box: { x0: 0.125, y0: 0.058, x1: 0.855, y1: 0.475 } }, // holidays stacked bar
  { out: "sc-fig7", page: 11, box: { x0: 0.050, y0: 0.690, x1: 0.925, y1: 0.930 } }, // phase I vs II bars
  { out: "sc-fig8", page: 13, box: { x0: 0.050, y0: 0.068, x1: 0.925, y1: 0.275 } }, // radar vs traditional
];

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(cc, width, height) { cc.canvas.width = width; cc.canvas.height = height; }
  destroy(cc) { cc.canvas.width = 0; cc.canvas.height = 0; }
}

const data = new Uint8Array(fs.readFileSync(PDF));
const doc = await getDocument({
  data,
  canvasFactory: new NodeCanvasFactory(),
  standardFontDataUrl: path.join(root, "node_modules", "pdfjs-dist", "standard_fonts") + path.sep,
}).promise;

fs.mkdirSync(OUT_DIR, { recursive: true });

const SCALE = 5; // high-res so multi-panel figures stay readable when enlarged
const pageCache = new Map();

for (const t of TARGETS) {
  if (!pageCache.has(t.page)) {
    const page = await doc.getPage(t.page);
    const viewport = page.getViewport({ scale: SCALE });
    const canvas = createCanvas(viewport.width, viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvasFactory: new NodeCanvasFactory() }).promise;
    pageCache.set(t.page, canvas);
  }
  const src = pageCache.get(t.page);
  const W = src.width, H = src.height;
  const x0 = Math.round(t.box.x0 * W), x1 = Math.round(t.box.x1 * W);
  const y0 = Math.round(t.box.y0 * H), y1 = Math.round(t.box.y1 * H);
  const cw = x1 - x0, ch = y1 - y0;
  const crop = createCanvas(cw, ch);
  crop.getContext("2d").drawImage(src, x0, y0, cw, ch, 0, 0, cw, ch);
  const file = path.join(OUT_DIR, `${t.out}.jpg`);
  fs.writeFileSync(file, crop.toBuffer("image/jpeg", 92));
  console.log(`${t.out}.jpg  p${t.page}  ${cw}x${ch}`);
}
console.log("done");
