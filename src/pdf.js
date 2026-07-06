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

/**
 * Render the given 1-indexed pages of a PDF to PNG data URLs.
 * Returns a Map(pageNumber -> dataURL). Pages that fail render are skipped.
 */
export async function renderPdfPages(arrayBuffer, pageNumbers) {
  const result = new Map();
  const unique = [...new Set(pageNumbers)].filter((p) => Number.isInteger(p) && p > 0);
  if (!unique.length) return result;

  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  for (const pageNo of unique) {
    if (pageNo > doc.numPages) continue;
    try {
      const page = await doc.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      result.set(pageNo, canvas.toDataURL("image/png"));
    } catch {
      // skip unrenderable page — figure card will show explanation only
    }
  }
  return result;
}
