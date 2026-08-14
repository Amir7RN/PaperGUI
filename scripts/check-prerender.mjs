/**
 * The prerendered page must be inert to the app.
 *
 * Baking markup into #root is only safe because createRoot().render() replaces
 * it on mount. If that ever stopped being true the site would ship duplicated
 * or stale content to every visitor — a much worse outcome than the SEO
 * problem prerendering solves. This boots the built site the way a browser
 * does and checks that what the reader ends up with is the live app.
 *
 *   node scripts/check-prerender.mjs
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".mp4": "video/mp4", ".json": "application/json", ".txt": "text/plain", ".xml": "application/xml" };

const { server, port } = await new Promise((resolve) => {
  const s = createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const f = path.join(DIST, rel);
    const ok = path.resolve(f).startsWith(DIST) && existsSync(f) && !f.endsWith(path.sep);
    try {
      const body = await readFile(ok ? f : path.join(DIST, "index.html"));
      res.writeHead(200, { "Content-Type": MIME[path.extname(ok ? f : "index.html")] || "application/octet-stream" }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  s.listen(0, "127.0.0.1", () => resolve({ server: s, port: s.address().port }));
});

const browser = await chromium.launch();
let bad = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad++;
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // What a crawler that runs no JavaScript sees.
  await page.route("**/assets/*.js", (r) => r.abort());
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  const noJsText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").trim();
  check(noJsText.length > 1200, "crawler with JS disabled sees the page", `${noJsText.length} chars`);
  check(/Stop reading papers/i.test(noJsText), "the hero's own words are in the HTML");
  await page.unroute("**/assets/*.js");

  // What a reader gets.
  const live = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  live.on("pageerror", (e) => errors.push(e.message));
  await live.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await live.waitForSelector("[data-landing]", { timeout: 20_000 });

  const roots = await live.evaluate(() => document.querySelectorAll("[data-landing]").length);
  check(roots === 1, "the app replaced the baked markup, not appended to it", `${roots} landing root(s)`);

  const reactOwned = await live.evaluate(() => {
    const el = document.getElementById("root");
    return Object.keys(el).some((k) => k.startsWith("__react"));
  });
  check(reactOwned, "#root is owned by React after mount");

  const liveText = (await live.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").trim();
  check(liveText.length > 1200, "the live app renders the same page", `${liveText.length} chars`);
  check(errors.length === 0, "no page errors", errors[0] || "");

  // The 404 fallback is the same page, so a stale URL is not a dead end.
  const nf = await browser.newPage();
  await nf.goto(`http://127.0.0.1:${port}/does-not-exist`, { waitUntil: "domcontentloaded" });
  check((await nf.evaluate(() => document.body.innerText)).length > 500, "unknown paths land on the real site");

  for (const f of ["robots.txt", "sitemap.xml", "icon-48.png"]) {
    const r = await browser.newPage().then((p) => p.goto(`http://127.0.0.1:${port}/${f}`));
    check(r.ok(), `/${f} serves`);
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(bad ? 1 : 0);
