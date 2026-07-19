/**
 * Extract the key figures of Construction.pdf (Noghabaei, Liu & Han,
 * "Automated Compatibility Checking of Prefabricated Components Using 3D
 * As-built Models and BIM", Automation in Construction 143 (2022) 104556)
 * into public/figs/ as cn-figN.jpg. Dev-time script
 * (node scripts/extract-figs-construction.mjs). Fraction-space crop boxes were
 * read off full-page renders (1190x1584 at scale 2).
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
const PDF = path.join(root, "Construction.pdf");
const OUT_DIR = path.join(root, "public", "figs");

const TARGETS = [
  { out: "cn-fig1",  page: 5,  box: { x0: 0.085, y0: 0.190, x1: 0.915, y1: 0.360 } }, // method overview cards
  { out: "cn-fig2",  page: 5,  box: { x0: 0.085, y0: 0.495, x1: 0.920, y1: 0.850 } }, // flowchart
  { out: "cn-fig3",  page: 7,  box: { x0: 0.195, y0: 0.095, x1: 0.810, y1: 0.320 } }, // Gaussian noise levels
  { out: "cn-fig4",  page: 7,  box: { x0: 0.190, y0: 0.445, x1: 0.815, y1: 0.655 } }, // noise distribution extraction
  { out: "cn-fig5",  page: 9,  box: { x0: 0.180, y0: 0.120, x1: 0.825, y1: 0.365 } }, // cross-section features
  { out: "cn-fig6",  page: 9,  box: { x0: 0.085, y0: 0.660, x1: 0.920, y1: 0.850 } }, // three case studies
  { out: "cn-fig7",  page: 10, box: { x0: 0.085, y0: 0.225, x1: 0.920, y1: 0.512 } }, // scan vs BIM/CAD
  { out: "cn-fig11", page: 13, box: { x0: 0.128, y0: 0.448, x1: 0.878, y1: 0.728 } }, // cross sections C1/C2
  { out: "cn-fig12", page: 14, box: { x0: 0.188, y0: 0.093, x1: 0.802, y1: 0.435 } }, // cross section coupling
  { out: "cn-fig13", page: 14, box: { x0: 0.285, y0: 0.588, x1: 0.705, y1: 0.735 } }, // occlusion map
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
  const cw = x1 - x0, ch = y1 - y0;
  const crop = createCanvas(cw, ch);
  crop.getContext("2d").drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
  fs.writeFileSync(path.join(OUT_DIR, `${t.out}.jpg`), crop.toBuffer("image/jpeg", { quality: 0.92 }));
  console.log("wrote", t.out, `${cw}x${ch}`);
}
