/**
 * Offline check of Stage A (src/figureClassify.js) against the real figure
 * crops committed under public/figs.
 *
 * Stage A is pure functions over ImageData, so it runs here exactly as it runs
 * in the browser — @napi-rs/canvas decodes the JPEG and hands over the same
 * pixel buffer. That matters: the alternative is checking a pixel classifier by
 * clicking through the app, which is slow enough that it doesn't get done.
 *
 * GROUND TRUTH IS NOT HAND-WRITTEN HERE. It is read out of the sample specs
 * themselves — each sample's resultFigures carry the chart family every subplot
 * was verified to be, against the same crop. Hand-listing them was tried first
 * and produced three wrong expectations in fifteen (a line plot listed as a
 * heat map among them), which is exactly the kind of error that makes a test
 * suite worse than none.
 *
 * What is scored:
 *   DOMINANT  did the most common family Stage A found match the most common
 *             family the figure actually contains? This is the number that
 *             matters — it is the claim Stage B is being asked to verify.
 *   PANELS    how many panels Stage A found vs how many the spec reproduces.
 *             The spec is a LOWER bound (it may honestly degrade some), so
 *             this is reported, not graded.
 *
 *   node scripts/classify-figs.mjs             # the whole sweep
 *   node scripts/classify-figs.mjs cost-fig3   # one figure, full draft + prompt
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { classifyFigureImage, draftToPrompt } from "../src/figureClassify.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIGS = path.join(here, "..", "public", "figs");

const SAMPLES = [
  "samplePaper2", "samplePaper3", "samplePaper4",
  "samplePaper5", "samplePaper6", "samplePaper7", "samplePaper9",
];

/** The family a panel really is, as the verified sample spec records it. */
function familyOf(panel) {
  return panel?.digitized?.kind || panel?.figureFamily || panel?.chartKind || null;
}

/** Most common entry in a list. */
function dominant(xs) {
  const c = new Map();
  for (const x of xs) if (x) c.set(x, (c.get(x) || 0) + 1);
  let best = null, n = 0;
  for (const [k, v] of c) if (v > n) { n = v; best = k; }
  return best;
}

async function expectations() {
  const out = [];
  for (const name of SAMPLES) {
    let spec;
    try { spec = Object.values(await import(`../src/${name}.js`))[0]; } catch { continue; }
    for (const fig of spec?.resultFigures || []) {
      const file = String(fig.image || "").split("/").pop();
      if (!file || !fs.existsSync(path.join(FIGS, file))) continue;
      const fams = (fig.panels || []).map(familyOf).filter(Boolean);
      if (!fams.length) continue;
      out.push({ sample: name, file, label: fig.figureLabel || "", fams, want: dominant(fams) });
    }
  }
  return out;
}

async function imageData(file) {
  const img = await loadImage(path.join(FIGS, file));
  const maxEdge = 900;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

const only = process.argv[2];

if (only) {
  const file = only.endsWith(".jpg") ? only : `${only}.jpg`;
  const draft = classifyFigureImage(await imageData(file), { debug: true });
  console.log(JSON.stringify(draft, null, 2));
  console.log("\n--- what Stage B is handed ---\n");
  console.log(draftToPrompt(draft));
  process.exit(0);
}

/* Families Stage A is not built to name — a radar, a radial bar and a
 * horizontal stack have no vertical-blob signature at all. They are counted
 * separately rather than hidden: a draft that says "unclear" for one is doing
 * the right thing, and a draft that confidently says "bar" would not be. */
const OUT_OF_SCOPE = new Set(["radar", "radialBar", "kaplanMeier"]);

const rows = await expectations();
let hit = 0, top1 = 0, scored = 0, oos = 0;

for (const exp of rows) {
  const draft = classifyFigureImage(await imageData(exp.file));
  const got = draft.ok ? draft.subplots.map((s) => s.family) : ["FAILED"];
  const gotDom = dominant(got);
  /* Scored on the TOP-2, because that is what Stage A actually delivers: a
   * ranked prior with its evidence, which the online pass then confirms or
   * overturns against the image. A correct runner-up is a useful draft; only a
   * family that appears nowhere in the ranking is a miss. */
  const cands = new Set();
  for (const s of draft.subplots || []) {
    cands.add(s.family);
    for (const a of s.alternatives || []) cands.add(a.family);
  }
  const outOfScope = OUT_OF_SCOPE.has(exp.want);
  let mark;
  if (outOfScope) { oos++; mark = " –  "; }
  else {
    scored++;
    if (gotDom === exp.want) { hit++; top1++; mark = " ok " ; }
    else if (cands.has(exp.want)) { hit++; mark = " ~2 "; }
    else mark = " XX ";
  }
  const conf = (draft.subplots || []).map((s) => s.confidence);
  console.log(
    `${mark}${exp.file.padEnd(15)} want ${String(exp.want).padEnd(12)} got ${String(gotDom).padEnd(12)} ` +
    `panels ${String(draft.subplots?.length ?? 0).padStart(2)}/${String(exp.fams.length).padStart(2)}` +
    ` conf ${conf.length ? (conf.reduce((a, b) => a + b, 0) / conf.length).toFixed(2) : "-"}  ${got.join(",")}`,
  );
}

console.log(`\ndominant family ${hit}/${scored} correct (${oos} figures out of Stage A's scope, not graded)`);
