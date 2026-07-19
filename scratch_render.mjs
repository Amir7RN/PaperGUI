import fs from "node:fs";
import path from "node:path";
import { createCanvas, Path2D, DOMMatrix, ImageData } from "pdfjs-dist/node_modules/@napi-rs/canvas/index.js";
globalThis.Path2D = Path2D; globalThis.DOMMatrix = DOMMatrix; globalThis.ImageData = ImageData;
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const OUT = "scratch_pages"; fs.mkdirSync(OUT, { recursive: true });
class F { create(w,h){const c=createCanvas(w,h);return{canvas:c,context:c.getContext("2d")};} reset(cc,w,h){cc.canvas.width=w;cc.canvas.height=h;} destroy(cc){cc.canvas.width=0;cc.canvas.height=0;} }
const data = new Uint8Array(fs.readFileSync("Construction.pdf"));
const doc = await getDocument({ data, canvasFactory: new F(), standardFontDataUrl: path.join("node_modules","pdfjs-dist","standard_fonts")+path.sep }).promise;
const pages = [5,7,9,10,13,14];
for (const p of pages) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 2 });
  const c = createCanvas(vp.width, vp.height);
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp, canvasFactory: new F() }).promise;
  fs.writeFileSync(path.join(OUT, `p${p}.png`), c.toBuffer("image/png"));
  console.log("rendered", p, c.width, c.height);
}
