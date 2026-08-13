/**
 * How many of a paper's references do we actually recover?
 *
 * The bibliography is read out of the PDF's own text layer with no model call,
 * so it either finds an entry or it doesn't — and "52 of 58" is a number a
 * reader can check against the printed list, which is exactly why it has to be
 * measured rather than assumed. This runs the real extractor over a real PDF
 * and prints the count, the highest entry number, and which numbers are
 * missing from the run.
 *
 *   node scripts/refs-count.mjs papers/some-paper.pdf
 */

import { readFileSync } from "node:fs";
import { buildPaperIndex } from "../src/pdfAnchors.js";
import { buildInlineRefs } from "../src/paperRefs.js";
import { buildPaperText } from "../src/paperText.js";

// The legacy ESM build is the one that runs outside a browser: no worker, no
// DOM, no Vite `?url` import for the worker file.
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

/** The browser build reads geometry through extractPageItems; this is the same
 *  arithmetic against the Node build, which has no worker and no `?url`. */
async function pageItems(doc, pageNo) {
  const page = await doc.getPage(pageNo);
  const viewport = page.getViewport({ scale: 1 });
  const W = viewport.width || 1;
  const H = viewport.height || 1;
  const { items } = await page.getTextContent();
  const out = [];
  for (const it of items) {
    if (typeof it.str !== "string" || !it.str) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, it.transform);
    const h = Math.hypot(tx[2], tx[3]);
    if (!(h > 0)) continue;
    out.push({ str: it.str, x: tx[4] / W, y: (tx[5] - h) / H, w: (it.width || 0) / W, h: h / H });
  }
  return { page: pageNo, width: W, height: H, items: out };
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/refs-count.mjs <paper.pdf>");
  process.exit(2);
}

const data = new Uint8Array(readFileSync(file));
const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

const pages = [];
for (let n = 1; n <= doc.numPages; n++) pages.push(await pageItems(doc, n));

const index = buildPaperIndex(pages);
const { bibliography } = buildInlineRefs(index, {});

const nums = [...bibliography.keys()].sort((a, b) => a - b);
const max = nums.length ? nums[nums.length - 1] : 0;
const missing = [];
for (let n = 1; n <= max; n++) if (!bibliography.has(n)) missing.push(n);

console.log(`${file}`);
console.log(`  pages:      ${doc.numPages}`);
console.log(`  recovered:  ${bibliography.size}`);
console.log(`  highest #:  ${max}`);
console.log(`  missing:    ${missing.length ? missing.join(", ") : "none"}`);

// A couple of samples, so a run that "found" 58 pieces of garbage is visible.
for (const n of nums.slice(0, 2).concat(nums.slice(-2))) {
  console.log(`  [${n}] ${bibliography.get(n).slice(0, 110)}`);
}

/* The sections come off the same column-ordered lines the bibliography does,
 * so they are the regression check on that ordering: if columns collapse, the
 * headings go with them. */
const { sections } = buildPaperText(pages, index);
console.log(`  sections:   ${sections.length ? sections.map((s) => `${s.label}(p${s.page})`).join(" ") : "none"}`);
console.log(`  headings:   ${index.headings.map((h) => h.key).join(" ") || "none"}`);
