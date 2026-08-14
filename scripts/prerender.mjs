/**
 * Bake the landing page's rendered HTML into dist/index.html.
 *
 * The app ships as `<body><div id="root"></div></body>` — about two kilobytes
 * with no words in it. Googlebot does execute JavaScript, but that render pass
 * is queued separately from the crawl and rationed, and a brand-new domain
 * with no inbound links sits at the back of that queue indefinitely. The page
 * that gets crawled has to contain the page.
 *
 * So after the build, the built site is served on loopback, opened in headless
 * Chromium, and the rendered DOM is written back over index.html. React's
 * createRoot().render() replaces the contents of #root on mount, so the baked
 * markup is thrown away the moment the app boots — there is no hydration
 * contract to violate and nothing can drift out of sync with it.
 *
 * Two details that are easy to get wrong and silently ruin the result:
 *
 *   REDUCED MOTION IS REQUIRED. `.pp-reveal` starts at `opacity: 0` and is
 *   only un-hidden by an IntersectionObserver as it scrolls into view. Render
 *   without it and everything below the fold bakes in invisible — text that is
 *   present in the HTML but hidden by CSS, which is the one thing Google
 *   actively discounts. The stylesheet already collapses those animations
 *   under prefers-reduced-motion.
 *
 *   THE SPINNER IS NOT THE PAGE. The app renders a loading spinner until the
 *   auth session resolves. Waiting on a timer would sometimes bake that, and a
 *   page whose only content is a spinner is worse than an empty one. It waits
 *   for the landing page's own marker and fails if it never arrives.
 *
 * Failure is LOUD, on purpose. Exiting 0 with the shell intact would mean
 * shipping an unindexable site while believing the opposite — the exact state
 * this script exists to end. A broken prerender fails the build; the previous
 * deploy stays up.
 */

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const INDEX = path.join(DIST, "index.html");

/** Enough rendered text that we know we baked the page and not a spinner. */
const MIN_TEXT_CHARS = 1200;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
};

/** A static server for dist/. The app must load exactly as deployed — from
 *  absolute paths off the origin root, which the file:// protocol cannot do. */
function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        // Contain every request inside dist/ — this reads from disk on paths a
        // browser supplies, so ".." must not escape even on loopback.
        const file = path.join(dir, rel);
        const safe = path.resolve(file).startsWith(path.resolve(dir));
        const target = safe && existsSync(file) && !file.endsWith(path.sep) ? file : path.join(dir, "index.html");
        const body = await readFile(target);
        res.writeHead(200, { "Content-Type": MIME[path.extname(target)] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const die = (msg) => {
  console.error(`\n  prerender FAILED: ${msg}\n`);
  console.error("  The site would deploy as an empty shell and stay unindexed.");
  console.error("  Install the browser with: npx playwright install chromium\n");
  process.exit(1);
};

if (!existsSync(INDEX)) die("dist/index.html does not exist — run the build first");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  die("playwright is not installed");
}

const { server, port } = await serve(DIST);
let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  server.close();
  die(`could not launch Chromium (${e.message})`);
}

try {
  const page = await browser.newPage({
    // See the header: without this, everything below the fold bakes in at
    // opacity 0 — present in the HTML and invisible, which is the worst of
    // both worlds.
    reducedMotion: "reduce",
    viewport: { width: 1280, height: 1600 },
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 45_000 });
  // The landing page itself, not the auth spinner that precedes it.
  await page.waitForSelector("[data-landing]", { timeout: 30_000 });

  const html = await page.content();
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());

  if (text.length < MIN_TEXT_CHARS) {
    die(`only ${text.length} characters of visible text were rendered (expected ≥ ${MIN_TEXT_CHARS}) — the page did not finish`);
  }
  // Text that is in the DOM but invisible is the failure mode this whole
  // script has to avoid, so check for it rather than assume the flag worked.
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll(".pp-reveal")].filter((el) => +getComputedStyle(el).opacity < 0.9).length);
  if (hidden > 0) die(`${hidden} revealed sections are still at opacity 0 — reduced motion did not apply`);

  await writeFile(INDEX, html, "utf8");

  /* GitHub Pages serves 404.html for any unknown path. Giving it the same
   * rendered page means a stale or mistyped URL lands on the real site rather
   * than GitHub's default 404, which is a dead end for a reader and a crawler
   * alike. */
  await writeFile(path.join(DIST, "404.html"), html, "utf8");

  const before = 1.9;
  console.log(
    `  prerendered dist/index.html — ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB ` +
    `(was ~${before} kB), ${text.length} characters of visible text`,
  );
  console.log("  wrote dist/404.html with the same page");
} finally {
  await browser.close();
  server.close();
}
