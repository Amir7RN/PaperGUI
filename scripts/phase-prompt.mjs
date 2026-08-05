#!/usr/bin/env node
/**
 * Build the EXACT prompt one analysis phase would send, for running offline.
 *
 * Why this exists: analyze-paper deliberately does not use structured outputs
 * (see the note at analyze-paper/index.ts — SPEC_SCHEMA is too big to compile
 * into a grammar, so the schema is embedded in the prompt and the response is
 * parsed leniently). That means a phase call is nothing but a PDF plus a text
 * prompt, so anything able to read a PDF and write JSON can stand in for the
 * API — which is what lets a developer test a new paper on a Claude Code
 * subscription instead of metered API credit.
 *
 * The prompt is assembled from the same paperSpec.js exports and the same
 * phases.js definitions the edge function and the browser use, in the same
 * order as index.ts. Nothing about the analyzer is restated here, so editing
 * the prompt still means editing paperSpec.js — and prod changes with it.
 *
 * ONE known departure from the wire format: the API sends the code, the shared
 * prompt and the phase prompt as three separate content blocks. A file is one
 * string, so they are joined with a blank line. Everything inside each block is
 * byte-identical.
 *
 * Usage:
 *   node scripts/phase-prompt.mjs --pdf papers/foo.pdf --phase overview
 *   node scripts/phase-prompt.mjs --pdf papers/foo.pdf --phase results
 *
 * Earlier phases are read back from the fixture directory automatically, so
 * `results` gets the same contextSpec (pipeline, archetype, field) a real run
 * would have handed it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PHASE_SCHEMAS,
  SYSTEM_PROMPT,
  hintsBlock,
  phaseInstruction,
} from "../supabase/functions/_shared/paperSpec.js";
import { PHASES, mergePhase, contextSpecFor, phaseById } from "../src/phases.js";
import { fixtureKey } from "../src/fixtureKey.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Same cap the edge function applies, so a big repo dump truncates here too. */
const MAX_CODE_CHARS = 160_000;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const pdfPath = arg("pdf");
const phaseId = arg("phase");
const codePath = arg("code");
const hintsPath = arg("hints");
const outPath = arg("out");

if (!pdfPath || !phaseId) {
  die("usage: --pdf <file.pdf> --phase <overview|foundations|model|method|results> [--code <file>] [--hints <file.json>] [--out <file.txt>]");
}
const phase = phaseById(phaseId);
if (!phase) die(`unknown phase "${phaseId}" (expected one of ${PHASES.map((p) => p.id).join(", ")})`);
if (!fs.existsSync(pdfPath)) die(`no such PDF: ${pdfPath}`);

const pdfBase64 = fs.readFileSync(pdfPath).toString("base64");
const codeText = codePath ? fs.readFileSync(codePath, "utf8") : null;
const hints = hintsPath ? JSON.parse(fs.readFileSync(hintsPath, "utf8")) : null;

const key = fixtureKey(pdfBase64, codeText);
const fixtureDir = path.join(ROOT, "public", "fixtures", key);

/* Rebuild the spec exactly as far as a real run would have it at this point:
 * every phase BEFORE this one, merged in order through the same mergePhase. */
const spec = {};
const missing = [];
for (const p of PHASES) {
  if (p.id === phase.id) break;
  const file = path.join(fixtureDir, `${p.id}.json`);
  if (!fs.existsSync(file)) { missing.push(p.id); continue; }
  mergePhase(spec, p, JSON.parse(fs.readFileSync(file, "utf8")));
}
const contextSpec = contextSpecFor(phase.id, spec);

/* Mirrors analyze-paper/index.ts. Keep the concatenation order identical. */
const code =
  codeText && codeText.trim()
    ? codeText.length > MAX_CODE_CHARS
      ? codeText.slice(0, MAX_CODE_CHARS) + "\n\n[... code truncated at 160k characters ...]"
      : codeText
    : null;

const codeBlock = code
  ? "THE PAPER'S ACTUAL CODE (uploaded by the reader — this is the METHOD'S GROUND TRUTH; " +
    "derive every computeJs kernel, constant and update rule from it rather than guessing " +
    "from the paper's prose):\n\n" + code
  : null;

const schemaBlock =
  "\n\nOUTPUT FORMAT (critical):\n" +
  "Respond with ONLY one JSON object — no markdown fences, no commentary before or after. " +
  "Valid JSON syntax: escape all newlines inside strings as \\n. " +
  "Keep it focused: for dense papers prefer 3-4 result figures and 3-4 blocks over exhaustive coverage. " +
  "It must validate against this JSON Schema:\n" +
  JSON.stringify(PHASE_SCHEMAS[phase.id]);

const sharedPrompt = SYSTEM_PROMPT + hintsBlock(hints);
const phasePrompt = phaseInstruction(phase.id, contextSpec) + schemaBlock;

const prompt = [codeBlock, sharedPrompt, phasePrompt].filter(Boolean).join("\n\n");

const out = outPath || path.join(ROOT, "scratch", "prompts", `${key}.${phase.id}.txt`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, prompt, "utf8");

console.log(`phase       ${phase.id} — ${phase.title}`);
console.log(`paper       ${pdfPath}`);
console.log(`fixture key ${key}`);
console.log(`context     ${contextSpec ? Object.keys(contextSpec).join(", ") : "(none — first phase)"}`);
if (missing.length) {
  console.log(`WARNING     earlier phases not recorded yet: ${missing.join(", ")}`);
  console.log(`            this phase will run with less context than a real one would have.`);
}
console.log(`prompt      ${path.relative(ROOT, out)} (${prompt.length.toLocaleString()} chars)`);
console.log(`expects     top-level keys: ${phase.keys.join(", ")}`);
console.log("");
console.log("Next: read the PDF and that prompt, then write the phase JSON to a file and run");
console.log(`  node scripts/fixture-write.mjs --pdf ${pdfPath} --phase ${phase.id} --in <answer.json>`);
