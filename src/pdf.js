/**
 * PDF utilities: base64 encoding for the Claude API, and page rendering
 * (via pdf.js) so concept figures identified by the analyzer can be shown
 * as static images above the interactive pipeline.
 */

import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** File -> base64 string without newlines (Claude requires none). */
export async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Render figure regions out of a PDF.
 * items: [{ page (1-indexed), bbox?: {x,y,w,h} in page fractions, top-left origin }]
 * Returns an array of dataURL|null aligned with items. A valid bbox yields a
 * cropped figure (with a small pad); a missing/degenerate bbox falls back to
 * the full page. Failures yield null.
 */
export async function renderPdfRegions(arrayBuffer, items) {
  const out = new Array(items.length).fill(null);
  const valid = items.some((it) => Number.isInteger(it?.page) && it.page > 0);
  if (!valid) return out;

  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCanvases = new Map(); // pageNo -> canvas (rendered once, reused per crop)

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!Number.isInteger(it?.page) || it.page < 1 || it.page > doc.numPages) continue;
    try {
      let canvas = pageCanvases.get(it.page);
      if (!canvas) {
        const page = await doc.getPage(it.page);
        const viewport = page.getViewport({ scale: 3 }); // high-res so figure text stays readable
        canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        pageCanvases.set(it.page, canvas);
      }

      const b = it.bbox;
      const usable = b && [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0.02 && b.h > 0.02;
      if (usable) {
        const pad = 0.015; // generous pad — model bboxes are approximate
        const x0 = clamp01(b.x - pad), y0 = clamp01(b.y - pad);
        const x1 = clamp01(b.x + b.w + pad), y1 = clamp01(b.y + b.h + pad);
        const sx = Math.round(x0 * canvas.width);
        const sy = Math.round(y0 * canvas.height);
        const sw = Math.max(1, Math.round((x1 - x0) * canvas.width));
        const sh = Math.max(1, Math.round((y1 - y0) * canvas.height));
        const crop = document.createElement("canvas");
        crop.width = sw;
        crop.height = sh;
        crop.getContext("2d").drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        out[i] = crop.toDataURL("image/jpeg", 0.92);
      } else {
        out[i] = canvas.toDataURL("image/jpeg", 0.92);
      }
    } catch {
      // leave null — the card shows the explanation without a preview
    }
  }
  return out;
}
