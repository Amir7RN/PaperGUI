/**
 * Extract Figs 1–4 of papers/2/Phonon.pdf (Yelishala et al., Nature Materials
 * 2025) into public/figs/ as ph-figN.jpg. Dev-time script
 * (node scripts/extract-figs-phonon.mjs). Fraction-space crop boxes were read
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
const PDF = path.join(root, "papers", "2", "Phonon.pdf");
const OUT_DIR = path.join(root, "public", "figs");

const TARGETS = [
  { out: "ph-fig1", page: 2, box: { x0: 0.055, y0: 0.055, x1: 0.965, y1: 0.565 } },
  { out: "ph-fig2", page: 4, box: { x0: 0.055, y0: 0.058, x1: 0.965, y1: 0.805 } },
  { out: "ph-fig3", page: 5, box: { x0: 0.055, y0: 0.052, x1: 0.965, y1: 0.685 } },
  { out: "ph-fig4", page: 6, box: { x0: 0.055, y0: 0.058, x1: 0.965, y1: 0.462 } },
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
