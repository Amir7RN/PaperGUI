/**
 * Regression check: every chart family renders faithfully from EVERY entry
 * point that can ask for a live panel.
 *
 * Run: node scripts/checkPanelFamilies.mjs
 *
 * There is no test runner in this project, so this bundles the real modules
 * with esbuild (already present as vite's own dependency), renders each panel
 * with react-dom/server, and asserts on the markup. It is checking three
 * things, which are the three ways the heat-map bug was able to happen:
 *
 *  1. RESOLUTION — a request naming a figure resolves to that figure's
 *     already-digitized panels, whichever gesture made it. All three call
 *     sites in PdfReader.jsx go through resolveFigureForPanel, so testing the
 *     function tests all three; a fourth call site that skips it is the thing
 *     to watch for.
 *  2. RENDERING — every family draws something, and draws the RIGHT family.
 *     A heat map that renders as a line chart is the original bug, and it
 *     renders perfectly happily.
 *  3. FALLBACK — the on-demand builder's own output is accepted and dispatched
 *     for every family too, for the case where no digitization exists.
 */

import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..");

const ENTRY = `
export { renderToStaticMarkup } from "react-dom/server";
export { default as React } from "react";
export * from "${path.join(ROOT, "src/DigitizedPanels.jsx").replace(/\\/g, "/")}";
export { resolveFigureForPanel, figureNumberIn } from "${path.join(ROOT, "src/figureResolve.js").replace(/\\/g, "/")}";
export { auditPanel } from "${path.join(ROOT, "src/panelGen.js").replace(/\\/g, "/")}";
export * from "${path.join(ROOT, "scripts/panelFamilies.fixture.js").replace(/\\/g, "/")}";
`;

/* Built INSIDE the project, not in the OS temp dir: the bundle leaves react,
 * react-dom and recharts external, and node only resolves those from a path
 * under the project's own node_modules. */
const tmp = fs.mkdtempSync(path.join(ROOT, "node_modules", ".panelcheck-"));
const entryFile = path.join(tmp, "entry.jsx");
const outFile = path.join(tmp, "bundle.mjs");
fs.writeFileSync(entryFile, ENTRY);

await build({
  entryPoints: [entryFile],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  loader: { ".js": "jsx", ".jsx": "jsx" },
  external: ["react", "react-dom", "react-dom/server", "recharts"],
  logLevel: "silent",
  /* panelGen.js reaches for the browser's Supabase client to SEND a build
   * request. Nothing under test sends one — auditPanel is pure — and the real
   * module reads import.meta.env at load, so it is stubbed out rather than
   * bundled. */
  plugins: [{
    name: "stub-supabase",
    setup(b) {
      b.onResolve({ filter: /(^|\/)supabase\.js$/ }, () => ({ path: "supabase-stub", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: "export const functionsUrl = ''; export const supabaseAnonKey = ''; export async function getAccessToken() { return null; }",
        loader: "js",
      }));
    },
  }],
});

const M = await import(pathToFileURL(outFile).href);

let failures = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { console.log(`  [32mok[0m   ${name}`); return; }
  failures++;
  console.log(`  [31mFAIL[0m ${name}${detail ? ` — ${detail}` : ""}`);
};

const html = (el) => {
  try { return M.renderToStaticMarkup(el); } catch (e) { return `__THREW__ ${e.message}`; }
};

/* ---- 1. resolution: the three entry points share one answer ---- */
console.log("\nresolution — one figure lookup for every gesture");

const heatFig = { label: "Fig. 4", panels: [M.DIGITIZED_PANELS.heatmap] };
const figByNum = new Map([[4, heatFig]]);
const gestures = {
  "figure-card button (label + caption)": ["Fig. 4 — three years of daily sales", null],
  "text selection naming the figure": ["As shown in Figure 4, weekend demand is systematically higher.", null],
  "text selection, abbreviated": ["see Fig.4(b) for the day-of-week pattern", null],
  "caption selection (figNum known)": ["Three years of daily sales.", 4],
  "table/listing selection": ["Mon 3 8 12\nTue 5 9 14\nWed 4 7 11  (Fig. 4)", null],
};
for (const [name, [quote, n]] of Object.entries(gestures)) {
  const hit = M.resolveFigureForPanel(quote, n, figByNum);
  ok(`resolves — ${name}`, hit === heatFig, hit ? "wrong figure" : "fell through to the metered builder");
}
ok("no figure named → falls through to the builder",
  M.resolveFigureForPanel("The model minimises mean absolute error.", null, figByNum) === null);
ok("figure with nothing renderable → falls through",
  M.resolveFigureForPanel("Fig. 4", null, new Map([[4, { panels: [{ reproduce: false, degradeReason: "forest plot" }] }]])) === null);
ok("'Fig. 2019' is a year following the word, not figure 20", M.figureNumberIn("Fig. 2019 baseline") === null);
ok("two-digit figures still read", M.figureNumberIn("as Figure 12 shows") === 12);

/* ---- 2. rendering: the right family, for free, from the digitized path ---- */
console.log("\nrendering — every family draws, and draws as itself");

for (const [kind, panel] of Object.entries(M.DIGITIZED_PANELS)) {
  ok(`${kind} — counted as renderable for free`, M.freePanels([panel]).length === 1);
  const out = html(M.React.createElement(M.FreePanel, { panel, height: 200 }));
  ok(`${kind} — renders`, out.length > 200 && !out.startsWith("__THREW__"), out.slice(0, 120));
  ok(`${kind} — dispatched to the special renderer, not the x-y one`, M.isSpecialDigitized(panel));
}

for (const [kind, panel] of Object.entries(M.XY_PANELS)) {
  const run = M.evalReportedPanel(panel);
  ok(`${kind} — reported values evaluate without the simulator`, !!run?.series?.length);
  ok(`${kind} — counted as renderable for free`, M.freePanels([panel]).length === 1);
  const out = html(M.React.createElement(M.FreePanel, { panel, height: 200 }));
  ok(`${kind} — renders`, out.includes("<svg") && !out.startsWith("__THREW__"), out.slice(0, 120));
}

ok("a reproduce:false panel is never drawn",
  M.freePanels([{ reproduce: false, digitized: { kind: "heatmap", grid: [[1, 2]] } }]).length === 0);
ok("a simulated panel is not faked without the pipeline",
  M.freePanels([{ reproduce: true, dataSource: "simulated", chartKind: "line", computeJs: "return {series:[{label:'a',data:outputs.y}]};" }]).length === 0);

/* ---- 3. fallback: the metered builder can now answer in every family ---- */
console.log("\nfallback — generate-panel output survives the audit and dispatches");

for (const kind of Object.keys(M.DIGITIZED_PANELS)) {
  const built = M.demoFor(kind);
  ok(`${kind} — passes the panel audit`, M.auditPanel(built) === null, M.auditPanel(built) || "");
  ok(`${kind} — recognised as a digitized demo`, M.isDigitizedDemo(built.demo));
  const out = html(M.React.createElement(M.DigitizedPanel, { panel: M.panelFromDemo(built.demo, built.title), height: 200 }));
  ok(`${kind} — renders from the notebook shape`, out.length > 200 && !out.startsWith("__THREW__"), out.slice(0, 120));
}

const emptyHeat = M.demoFor("heatmap");
emptyHeat.demo.digitized = { kind: "heatmap", source: "Fig. 4", grid: [] };
ok("an empty carrier is REJECTED rather than shown as a blank rectangle",
  typeof M.auditPanel(emptyHeat) === "string");
ok("an unrenderable family is rejected by name",
  /forest/.test(M.auditPanel({ demo: { kind: "digitized", digitized: { kind: "forest" } } }) || ""));

/* ---- coverage: the family list itself must not quietly shrink ---- */
console.log("\ncoverage");
const claimed = ["line", "bar", "scatter", ...M.SPECIAL_DIGITIZED_KINDS];
const missing = claimed.filter((k) => !M.ALL_FAMILIES.includes(k));
ok(`all ${claimed.length} claimed families are covered by a fixture`, missing.length === 0, missing.join(", "));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n[31m${failures} failing[0m\n` : "\n[32mall panel families render faithfully from every entry point[0m\n");
process.exit(failures ? 1 : 0);
