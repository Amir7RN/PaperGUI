/**
 * Extract Figs 1–4 of papers/3/habibi.pdf (Habibi & Cui, PRX Energy
 * 2026) into public/figs/ as zt-figN.jpg. Dev-time script
 * (node scripts/extract-figs-ztpx.mjs). Fraction-space crop boxes were read
 * off full-page renders.
 *
 * NOTE: imports pdfjs-dist's own nested @napi-rs/canvas — mixing it with the
 * top-level copy makes pdfjs's internal SMask canvases fail native type checks.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, Path2D, DOMMatrix, ImageData } from "pdfjs-dist/node_modules/@napi-rs/canvas/index.js";

globalThis.Path2D = Path2D;
globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const PDF = path.join(root, "papers", "3", "habibi.pdf");
const OUT_DIR = path.join(root, "public", "figs");

const TARGETS = [
  { out: "zt-fig1", page: 2, box: { x0: 0.065, y0: 0.630, x1: 0.940, y1: 0.940 } },
  { out: "zt-fig2", page: 4, box: { x0: 0.075, y0: 0.385, x1: 0.950, y1: 0.935 } },
  { out: "zt-fig3", page: 5, box: { x0: 0.075, y0: 0.340, x1: 0.950, y1: 0.930 } },
  { out: "zt-fig4", page: 6, box: { x0: 0.075, y0: 0.385, x1: 0.950, y1: 0.945 } },
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

const SCALE = 4;
for (const t of TARGETS) {
  const page = await doc.getPage(t.page);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = createCanvas(viewport.width, viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvasFactory: new NodeCanvasFactory() }).promise;
  const W = canvas.width, H = canvas.height;
  const x0 = Math.round(t.box.x0 * W), x1 = Math.round(t.box.x1 * W);
  const y0 = Math.round(t.box.y0 * H), y1 = Math.round(t.box.y1 * H);
  const crop = createCanvas(x1 - x0, y1 - y0);
  crop.getContext("2d").drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  fs.writeFileSync(path.join(OUT_DIR, `${t.out}.jpg`), crop.toBuffer("image/jpeg", 88));
  console.log(`${t.out}.jpg  p${t.page}  ${x1 - x0}x${y1 - y0}`);
}
console.log("done");
