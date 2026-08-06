#!/usr/bin/env node
/**
 * Run the app's own quality gate against a recorded (or candidate) phase.
 *
 * App.jsx hands analyzePaper a `validators` map, and a phase that fails it is
 * regenerated once with the problems fed back. A phase recorded offline never
 * passes through that gate — priming the phase cache skips validation, exactly
 * as a resumed run does — so without this the first sign of a dead slider or a
 * flat kernel would be the dashboard itself.
 *
 * The audits are imported from src/engine.js, the same module the browser
 * uses. Nothing about "what counts as broken" is restated here.
 *
 * Usage:
 *   node scripts/fixture-check.mjs --pdf papers/foo.pdf --phase foundations --in answer.json
 *   node scripts/fixture-check.mjs --pdf papers/foo.pdf            (check everything recorded)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditFoundations, auditPipeline, auditExplorables,
  auditFigureFidelity, auditResultFiguresQuality,
  buildHelpers, compileSpec, defaultsFromSpec,
} from "../src/engine.js";
import { PHASES, mergePhase, phaseById } from "../src/phases.js";
import { fixtureKey } from "../src/fixtureKey.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
}

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }

const pdfPath = arg("pdf");
const only = arg("phase");
const inPath = arg("in");
const codePath = arg("code");
if (!pdfPath) die("usage: --pdf <file.pdf> [--phase <id>] [--in <candidate.json>]");
if (inPath && !only) die("--in needs --phase so the candidate can be merged in the right slot");

const pdfBase64 = fs.readFileSync(pdfPath).toString("base64");
const codeText = codePath ? fs.readFileSync(codePath, "utf8") : null;
const dir = path.join(ROOT, "public", "fixtures", fixtureKey(pdfBase64, codeText));

/* Build the spec exactly as the browser would: every recorded phase merged in
 * order, with the candidate standing in for its own phase when given. */
const spec = {};
const have = [];
for (const p of PHASES) {
  let slice = null;
  if (inPath && p.id === only) {
    slice = JSON.parse(fs.readFileSync(inPath, "utf8"));
  } else {
    const file = path.join(dir, `${p.id}.json`);
    if (fs.existsSync(file)) slice = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  if (!slice) continue;
  mergePhase(spec, p, slice);
  have.push(p.id);
}
if (!have.length) die(`nothing recorded for ${path.basename(pdfPath)} and no --in given`);
if (only && !phaseById(only)) die(`unknown phase "${only}"`);

/** Which audits App.jsx runs for which phase. */
function auditsFor(phaseId) {
  if (phaseId === "foundations") return auditFoundations(spec) || [];
  if (phaseId === "method") {
    const h = buildHelpers(spec.protocol);
    return [...auditPipeline(spec, compileSpec(spec), h, defaultsFromSpec(spec)),
            ...auditExplorables(spec)];
  }
  if (phaseId === "results") {
    const out = [...auditFigureFidelity(spec)];
    try {
      const h = buildHelpers(spec.protocol);
      out.push(...auditResultFiguresQuality(spec, compileSpec(spec), h, defaultsFromSpec(spec)));
    } catch (e) {
      out.push(`(pipeline audit skipped: ${e.message})`);
    }
    return out;
  }
  return null; // overview and model have no gate in App.jsx
}

const targets = only ? [only] : have;
let failed = 0;
for (const phaseId of targets) {
  let problems;
  try { problems = auditsFor(phaseId); }
  catch (e) { console.log(`${phaseId}: audit threw — ${e.message}`); failed++; continue; }

  if (problems === null) { console.log(`${phaseId}: no gate for this phase`); continue; }
  if (!problems.length) { console.log(`${phaseId}: PASS`); continue; }
  failed++;
  console.log(`${phaseId}: ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  - ${p}`);
}
process.exit(failed ? 1 : 0);
