/**
 * Extract figure crops from the bundled sample paper's PDF into public/figs/.
 * Dev-time script (node scripts/extract-figs.mjs) — locates each "Fig. N."
 * caption in the page text, crops from the previous caption (or top margin)
 * down through the caption, and writes a PNG.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, Path2D, DOMMatrix, ImageData } from "@napi-rs/canvas";

// pdfjs draws glyphs through global Path2D/DOMMatrix — point them at the
// @napi-rs/canvas implementations so ctx.fill(path) receives the right type.
globalThis.Path2D = Path2D;
globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const PDF = path.join(
  root,
  "Decentralized_Repetitive_Learning_for_Whole-Body_Planning_and_Control_of_Humanoid_Robots_With_Centroidal_Momentum_Dynamics.pdf"
);
const OUT_DIR = path.join(root, "public", "figs");

const TARGETS = [
  { out: "dl-fig1",  fig: 1 },
  { out: "dl-fig2",  fig: 2 },
  { out: "dl-fig4",  fig: 4 },
  { out: "dl-fig5",  fig: 5 },
  { out: "dl-fig6",  fig: 6 },
  { out: "dl-fig7",  fig: 7 },
  { out: "dl-fig9",  fig: 9 },
  { out: "dl-fig10", fig: 10 },
  { out: "dl-fig11", fig: 11 },
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

// 1) find every "Fig. N." caption: page + top-origin y (at scale 1)
const captions = new Map(); // figNo -> {page, yTop}
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const viewport = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  for (const it of tc.items) {
    const m = /^Fig\.\s*(\d+)\.\s/.exec(it.str + " ");
    if (!m) continue;
    const no = +m[1];
    if (captions.has(no)) continue; // first occurrence = the caption (references say "Fig. 4 illustrates")
    const yTop = viewport.height - it.transform[5]; // baseline in top-origin
    const x0 = it.transform[4];
    const x1 = x0 + (it.width || 0);
    captions.set(no, { page: p, yTop, x0, x1, pageW: viewport.width });
  }
}
console.log("captions found:", [...captions.entries()].map(([n, c]) => `Fig${n}@p${c.page}`).join(" "));

// 2) crop each target
const SCALE = 4; // high-res so subplot axis text stays readable when enlarged
for (const t of TARGETS) {
  const cap = captions.get(t.fig);
  if (!cap) { console.log(`Fig ${t.fig}: caption NOT FOUND, skipped`); continue; }
  const page = await doc.getPage(cap.page);
  const viewport = page.getViewport({ scale: SCALE });
  const W = viewport.width, H = viewport.height;

  const midX = cap.pageW / 2;
  const capStartsRight = cap.x0 >= midX * 0.96;

  // captions above this one on the same page bound the figure's top
  const sameAbove = [...captions.values()]
    .filter((c) => c.page === cap.page && c.yTop < cap.yTop - 5)
    .map((c) => c.yTop);
  const topMargin = 0.055 * (H / SCALE);
  const yStartU = sameAbove.length ? Math.max(...sameAbove) + 16 : topMargin; // unscaled
  const yEndU = cap.yTop + 22;

  // full-width vs column: does body text occupy the opposite column inside the band?
  const tc2 = await page.getTextContent();
  let oppositeText = 0;
  const vp1 = page.getViewport({ scale: 1 });
  for (const it of tc2.items) {
    const y = vp1.height - it.transform[5];
    if (y < yStartU + 12 || y > yEndU - 26) continue;
    if (!it.str.trim()) continue;
    if (capStartsRight ? it.transform[4] < midX * 0.9 : it.transform[4] > midX * 1.02) oppositeText++;
  }
  const isColumn = oppositeText > 6;

  const yStart = yStartU * SCALE;
  const yEnd = Math.min(H, yEndU * SCALE);

  const canvas = createCanvas(W, H);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvasFactory: new NodeCanvasFactory() }).promise;

  let x0 = Math.round(0.035 * W), x1 = Math.round(0.965 * W);
  if (isColumn && !capStartsRight) { x0 = Math.round(0.030 * W); x1 = Math.round(0.515 * W); }
  if (isColumn && capStartsRight)  { x0 = Math.round(0.490 * W); x1 = Math.round(0.970 * W); }
  const sh = Math.max(40, Math.round(yEnd - yStart));
  const crop = createCanvas(x1 - x0, sh);
  crop.getContext("2d").drawImage(canvas, x0, Math.round(yStart), x1 - x0, sh, 0, 0, x1 - x0, sh);
  const file = path.join(OUT_DIR, `${t.out}.jpg`);
  fs.writeFileSync(file, crop.toBuffer("image/jpeg", 90));
  console.log(`${t.out}.jpg  p${cap.page}  ${x1 - x0}x${sh}`);
}
console.log("done");
