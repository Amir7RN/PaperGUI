/**
 * Extract Figs 1–8 of papers/1/scirobotics.adz7397.pdf into public/figs/ as
 * sr-figN.jpg. Dev-time script (node scripts/extract-figs-scirobotics.mjs).
 * Fraction-space crop boxes were read off full-page renders.
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
const PDF = path.join(root, "papers", "1", "scirobotics.adz7397.pdf");
const OUT_DIR = path.join(root, "public", "figs");

const TARGETS = [
  { out: "sr-fig1", page: 3,  box: { x0: 0.09, y0: 0.080, x1: 0.94, y1: 0.795 } },
  { out: "sr-fig2", page: 4,  box: { x0: 0.05, y0: 0.070, x1: 0.95, y1: 0.835 } },
  { out: "sr-fig3", page: 6,  box: { x0: 0.09, y0: 0.075, x1: 0.95, y1: 0.845 } },
  { out: "sr-fig4", page: 7,  box: { x0: 0.06, y0: 0.265, x1: 0.96, y1: 0.855 } },
  { out: "sr-fig5", page: 9,  box: { x0: 0.07, y0: 0.060, x1: 0.95, y1: 0.850 } },
  { out: "sr-fig6", page: 10, box: { x0: 0.05, y0: 0.075, x1: 0.96, y1: 0.845 } },
  { out: "sr-fig7", page: 12, box: { x0: 0.09, y0: 0.075, x1: 0.95, y1: 0.845 } },
  { out: "sr-fig8", page: 13, box: { x0: 0.12, y0: 0.650, x1: 0.90, y1: 0.890 } },
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

const SCALE = 4; // photo-heavy pages: 4× keeps files reasonable and text readable
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
  const crop = createCanvas(x1 - x0, y1 - y0);
  crop.getContext("2d").drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  fs.writeFileSync(path.join(OUT_DIR, `${t.out}.jpg`), crop.toBuffer("image/jpeg", 88));
  console.log(`${t.out}.jpg  p${t.page}  ${x1 - x0}x${y1 - y0}`);
}
console.log("done");
