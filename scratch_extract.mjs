import fs from "node:fs";
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const data = new Uint8Array(fs.readFileSync("Construction.pdf"));
const doc = await getDocument({ data, useSystemFonts: true }).promise;
let out = `PAGES ${doc.numPages}\n`;
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  let last = null, line = "";
  const lines = [];
  for (const it of tc.items) {
    const y = it.transform[5];
    if (last !== null && Math.abs(y - last) > 3) { lines.push(line); line = ""; }
    line += it.str;
    last = y;
  }
  if (line) lines.push(line);
  out += `\n===== PAGE ${p} =====\n` + lines.join("\n") + "\n";
}
fs.writeFileSync("scratch_construction.txt", out);
console.log("done", doc.numPages, "pages", out.length, "chars");
