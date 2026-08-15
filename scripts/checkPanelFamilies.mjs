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
export { auditFigurePanels, auditPanelCoverage, splitPlan } from "${path.join(ROOT, "src/figureDigitize.js").replace(/\\/g, "/")}";
export { PHASE_SCHEMAS, FIGURE_PANELS_SCHEMA, figureDigitizePrompt } from "${path.join(ROOT, "supabase/functions/_shared/paperSpec.js").replace(/\\/g, "/")}";
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

/* ---- 4. deferred digitization: phase 5 identifies, the reader's click reads ---- */
console.log("\ndeferred digitization — figures are found up front, read on demand");

const figProps = M.PHASE_SCHEMAS.results.properties.resultFigures.items;
ok("phase 5 no longer asks for panels", !("panels" in figProps.properties));
ok("phase 5 still asks for the crop box and the guided tour",
  ["figureLabel", "page", "bbox", "title", "explanation"].every((k) => figProps.required.includes(k)));
ok("the on-demand call carries the full panel schema", !!M.FIGURE_PANELS_SCHEMA.properties.panels);

for (const [kind, panel] of Object.entries(M.DIGITIZED_PANELS)) {
  const { panels, problems } = M.auditFigurePanels([panel]);
  ok(`${kind} — survives the on-demand figure check`, panels.length === 1, problems || "");
}
for (const [kind, panel] of Object.entries(M.XY_PANELS)) {
  const { panels } = M.auditFigurePanels([panel]);
  ok(`${kind} — reported x-y survives the on-demand figure check`, panels.length === 1);
}
{
  const { panels, problems } = M.auditFigurePanels([
    { subplotLabel: "(a)", reproduce: false, degradeReason: "This is a forest plot — shown as the paper's own figure." },
  ]);
  ok("an honest-degrade panel is KEPT, not treated as a failure", panels.length === 1 && !problems);
}
{
  const { panels, problems } = M.auditFigurePanels([{ subplotLabel: "(a)", reproduce: false, degradeReason: "" }]);
  ok("a degrade with no reason is sent back for a retry", panels.length === 0 && /degradeReason/.test(problems || ""));
}
{
  const { panels, problems } = M.auditFigurePanels([
    { subplotLabel: "(a)", reproduce: true, digitized: { kind: "heatmap", source: "Fig. 4", grid: [] } },
  ]);
  ok("an empty heatmap is dropped with a reason, never drawn blank",
    panels.length === 0 && /heatmap/.test(problems || ""));
}

/* ---- 5. the whole figure, in its own colours ----
 *
 * Three faults reported together from one screenshot of a 3-subplot figure:
 * only subplot (a) came back, its three differently-coloured bars were drawn
 * in one default blue, and the card showed the lot in a single narrow column.
 * The first two are checkable here; the third is layout (FigurePanels is given
 * the measured `cols`, asserted below).
 */
console.log("\nthe whole figure — every subplot, in the original's colours");

const rowOf3 = {
  ok: true,
  layout: { rows: 1, cols: 3, count: 3 },
  subplots: [0, 1, 2].map((i) => ({
    family: "bar", confidence: 0.5, hasAxes: true, notes: [], rough: {},
    box: { fx0: i / 3, fy0: 0, fx1: (i + 1) / 3, fy1: 1 },
  })),
};
ok("a 3-subplot figure answered with 1 panel is sent back",
  /3 plot boxes/.test(M.auditPanelCoverage(rowOf3, [{ subplotLabel: "(a)" }]) || ""));
ok("all three subplots present → nothing to complain about",
  M.auditPanelCoverage(rowOf3, [{}, {}, {}]) === null);
ok("MORE panels than the pixel read segmented is fine (it over-segments)",
  M.auditPanelCoverage(rowOf3, [{}, {}, {}, {}]) === null);
ok("a single-panel figure is never challenged",
  M.auditPanelCoverage({ ok: true, subplots: [{ hasAxes: true, box: {} }] }, []) === null);
ok("no local read → no coverage claim to make", M.auditPanelCoverage({ ok: false }, []) === null);
ok("panels without axis spines don't inflate the expected count",
  M.auditPanelCoverage(
    { ok: true, subplots: [...rowOf3.subplots, { hasAxes: false, box: {} }] },
    [{}, {}, {}],
  ) === null);

{
  /* A degraded subplot KEEPS ITS SLOT: silence and an honest degrade look the
   * same to a reader counting panels, and they assume the worse one. */
  const degraded = { subplotLabel: "(c)", reproduce: false, degradeReason: "This is a micrograph — shown as the paper's own figure." };
  ok("an honest degrade is shown, not dropped from the figure", M.shownPanels([degraded]).length === 1);
  ok("a degrade with no reason still says nothing", M.shownPanels([{ reproduce: false }]).length === 0);
  ok("a degrade is still not counted as something drawable", M.freePanels([degraded]).length === 0);
  const out = html(M.React.createElement(M.FreePanel, { panel: degraded, height: 200 }));
  ok("the degraded slot renders its reason", out.includes("micrograph") && out.includes("(c)"), out.slice(0, 120));
}

{
  /* The reported fault exactly: one series, three categories, three colours. */
  const tricolour = {
    subplotLabel: "(a) Detection performance",
    reproduce: true, dataSource: "reported", chartKind: "bar",
    xLabel: "Detection metric", yLabel: "Percentage [%] / Time [msec]",
    computeJs:
      "return {categories:['Sensitivity','False Alarm Rate','Detection Time']," +
      "colors:['#2b7bba','#c0392b','#2e7d32'],series:[{label:'value',data:[100,12.1,43.1]}]};",
  };
  const run = M.evalReportedPanel(tricolour);
  ok("per-category colours survive evaluation", JSON.stringify(run?.colors) === '["#2b7bba","#c0392b","#2e7d32"]');
  const out = html(M.React.createElement(M.FreePanel, { panel: tricolour, height: 220 }));
  for (const hex of ["#2b7bba", "#c0392b", "#2e7d32"]) {
    ok(`the bar drawn in ${hex} keeps that colour`, out.includes(hex));
  }
  ok("the legend names the categories, not one anonymous series", out.includes("False Alarm Rate"));

  const junk = { ...tricolour, computeJs: tricolour.computeJs.replace("'#2b7bba'", "'javascript:alert(1)'") };
  ok("a colour that isn't a hex is ignored rather than injected",
    !html(M.React.createElement(M.FreePanel, { panel: junk, height: 220 })).includes("javascript:"));

  /* And the arrangement: three panels in the measured row of three. */
  const grid = html(M.React.createElement(M.FigurePanels, {
    panels: [tricolour, tricolour, tricolour], layout: { cols: 3 },
  }));
  ok("the figure's own grid is used, not a single column", grid.includes("repeat(3, minmax(0, 1fr))"));
}

/* ---- 6. one request per subplot ----
 *
 * A single request covering every panel of a busy figure outlives Supabase's
 * 150s wall clock, so a confidently-segmented figure is read subplot by
 * subplot. Two things have to hold: the split only fires on a segmentation
 * worth trusting (a bad one crops a plot in half and gets a confident wrong
 * answer), and a request carrying one subplot has to SAY so, or the model
 * answers from the caption for panels it cannot see.
 */
console.log("\nper-subplot reads — the split, and the prompt that goes with it");

const cell = (fx0, fy0, fx1, fy1, hasAxes = true) => ({ hasAxes, box: { fx0, fy0, fx1, fy1 } });
const rowOfThree = {
  ok: true, width: 900, height: 300, layout: { rows: 1, cols: 3, count: 3 },
  subplots: [cell(0.02, 0.05, 0.32, 0.95), cell(0.35, 0.05, 0.65, 0.95), cell(0.68, 0.05, 0.98, 0.95)],
};
ok("a clean row of three is read one subplot at a time", M.splitPlan(rowOfThree)?.length === 3);
ok("a 2x2 grid splits too", M.splitPlan({
  ok: true, subplots: [cell(0, 0, 0.48, 0.48), cell(0.52, 0, 1, 0.48), cell(0, 0.52, 0.48, 1), cell(0.52, 0.52, 1, 1)],
})?.length === 4);
ok("a single-panel figure is read whole", M.splitPlan({ ok: true, subplots: [cell(0, 0, 1, 1)] }) === null);
ok("no local read → read whole", M.splitPlan({ ok: false }) === null);
ok("cells with no axis spines are not trusted enough to cut on",
  M.splitPlan({ ok: true, subplots: rowOfThree.subplots.map((s) => ({ ...s, hasAxes: false })) }) === null);
ok("label-strip slivers are not subplots",
  M.splitPlan({ ok: true, subplots: [cell(0, 0, 1, 0.06), cell(0, 0.1, 1, 0.99)] }) === null);
ok("a segmentation covering almost none of the crop is rejected",
  M.splitPlan({ ok: true, subplots: [cell(0, 0, 0.2, 0.2), cell(0.3, 0.3, 0.5, 0.5)] }) === null);
ok("an implausibly fine split is read whole instead",
  M.splitPlan({ ok: true, subplots: Array.from({ length: 12 }, (_, i) => cell(i / 12, 0, (i + 1) / 12, 1)) }) === null);

{
  const args = { paperTitle: "P", figureLabel: "Fig. 3", title: "T", explanation: "Panels (a), (b) and (c) …", field: "" };
  const whole = M.figureDigitizePrompt(args);
  const part = M.figureDigitizePrompt({ ...args, subplot: { index: 2, count: 3 } });

  ok("the whole-figure prompt still demands every subplot", whole.includes("EVERY SUBPLOT GETS AN ENTRY"));
  ok("a subplot request does NOT ask for every subplot", !part.includes("EVERY SUBPLOT GETS AN ENTRY"));
  ok("a subplot request pins the answer to one entry", part.includes("EXACTLY ONE entry"));
  ok("a subplot request says which panel it is", part.includes("subplot 2 of 3"));
  ok("a subplot request quarantines the whole-figure caption",
    part.includes("describe the WHOLE figure") && part.includes("ignore what they say about the others"));
  ok("the colour rule survives in both", whole.includes("MATCH THE COLOURS") && part.includes("MATCH THE COLOURS"));

  const first = M.figureDigitizePrompt({ ...args, subplot: { index: 1, count: 3 } });
  ok("only the first subplot may carry the figure's quiz", first.includes("only panel of the figure that may carry one"));
  ok("later subplots are told not to add one", part.includes("Do NOT add a `predict` quiz"));
}

/* ---- coverage: the family list itself must not quietly shrink ---- */
console.log("\ncoverage");
const claimed = ["line", "bar", "scatter", ...M.SPECIAL_DIGITIZED_KINDS];
const missing = claimed.filter((k) => !M.ALL_FAMILIES.includes(k));
ok(`all ${claimed.length} claimed families are covered by a fixture`, missing.length === 0, missing.join(", "));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n[31m${failures} failing[0m\n` : "\n[32mall panel families render faithfully from every entry point[0m\n");
process.exit(failures ? 1 : 0);
