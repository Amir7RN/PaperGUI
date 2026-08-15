/**
 * Cut the FIRST FRAME out of each landing demo GIF, as a poster image.
 *
 * Run: node scripts/gif-posters.mjs
 *
 * The landing tiles don't autoplay — the files are 6-12 MB each and three
 * moving images side by side is unreadable — so before it is clicked a tile
 * has to show something. A gradient with a play button says "video here"; the
 * recording's own first frame says WHAT video, which is the entire job of a
 * thumbnail. It also means clicking play changes nothing but motion: the GIF
 * begins on the frame that was already on screen.
 *
 * Extracted with WebCodecs' ImageDecoder inside real Chromium rather than a
 * GIF library, because that is the same decoder that will draw the GIF on the
 * page — frame 0 here is exactly frame 0 there, including its palette and its
 * disposal method. Playwright is already a dependency (the prerender check
 * uses it), so this costs no new tooling.
 *
 * The GIFs are served over a throwaway local server rather than handed to the
 * page as bytes: a 12 MB array over the CDP bridge is slow enough to look
 * broken, and a fetch from the page's own origin is instant.
 */

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const QUALITY = 0.82;
/* Wide enough to stay sharp on a retina screen at the tile's rendered size,
 * small enough that three of them are a rounding error next to one GIF. */
const MAX_W = 1200;

const gifs = fs.readdirSync(PUBLIC).filter((f) => /^sciloupe-demo-.*\.gif$/.test(f));
if (!gifs.length) {
  console.error("no public/sciloupe-demo-*.gif files to read");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const name = decodeURIComponent((req.url || "").replace(/^\//, ""));
  // The page itself: an empty document, just to get an origin to fetch from.
  if (!name) {
    res.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>posters</title>");
    return;
  }
  const file = path.join(PUBLIC, name);
  if (!file.startsWith(PUBLIC) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": "image/gif" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });

let failures = 0;
for (const name of gifs) {
  const out = path.join(PUBLIC, name.replace(/\.gif$/, ".poster.jpg"));
  try {
    const bytes = await page.evaluate(async ({ url, maxW, quality }) => {
      const data = await (await fetch(url)).arrayBuffer();
      if (typeof ImageDecoder === "undefined") throw new Error("no ImageDecoder in this browser");
      const decoder = new ImageDecoder({ data, type: "image/gif" });
      const { image } = await decoder.decode({ frameIndex: 0 });
      const scale = Math.min(1, maxW / image.displayWidth);
      const w = Math.round(image.displayWidth * scale);
      const h = Math.round(image.displayHeight * scale);
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      /* Flattened onto white: a GIF's frame 0 can be partly transparent, and
       * transparency saved as JPEG turns black. */
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(image, 0, 0, w, h);
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, { url: `${origin}/${name}`, maxW: MAX_W, quality: QUALITY });

    fs.writeFileSync(out, Buffer.from(bytes));
    const kb = (fs.statSync(out).size / 1024).toFixed(0);
    const src = (fs.statSync(path.join(PUBLIC, name)).size / 1048576).toFixed(1);
    console.log(`  ok   ${path.basename(out)} — ${kb} kB poster for a ${src} MB gif`);
  } catch (e) {
    failures++;
    console.error(`  FAIL ${name} — ${e.message}`);
  }
}

await browser.close();
server.close();
process.exit(failures ? 1 : 0);
