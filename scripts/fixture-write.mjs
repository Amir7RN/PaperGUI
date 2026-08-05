#!/usr/bin/env node
/**
 * Record one phase's output into public/fixtures/<key>/<phase>.json.
 *
 * The key is content-addressed from the PDF (see src/fixtureKey.js) so the
 * browser finds the recording without a manifest, a filename convention, or
 * anything else to keep in sync.
 *
 * Parsing is lenient in the same spirit as parseSpecJson in analyze-paper:
 * fenced output and stray prose either side of the object are recoverable, and
 * a recording is worth having even when the answer arrived slightly untidy.
 * Unlike the edge function this does NOT repair truncated JSON — a cut-off
 * recording should be re-run, not patched into a fixture that silently
 * misrepresents what the analyzer produces.
 *
 * Usage:
 *   node scripts/fixture-write.mjs --pdf papers/foo.pdf --phase overview --in answer.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PHASES, phaseById } from "../src/phases.js";
import { fixtureKey } from "../src/fixtureKey.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

/** Tolerate fences and surrounding prose; refuse anything unparseable. */
function parseLenient(text) {
  const raw = text.trim();
  try { return JSON.parse(raw); } catch { /* fall through */ }

  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try { return JSON.parse(unfenced); } catch { /* fall through */ }

  // Walk from the first "{" tracking string/escape state so braces inside
  // string values don't close the object early.
  const from = unfenced.indexOf("{");
  if (from === -1) die("no JSON object in the input file");
  const body = unfenced.slice(from);

  let depth = 0, inStr = false, esc = false, endedAt = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { endedAt = i; break; } }
  }
  if (endedAt === -1) {
    die("the JSON object is never closed — the answer was truncated. Re-run this phase rather than recording a partial one.");
  }
  try { return JSON.parse(body.slice(0, endedAt + 1)); }
  catch (e) { die(`could not parse the JSON object: ${e.message}`); }
}

const pdfPath = arg("pdf");
const phaseId = arg("phase");
const inPath = arg("in");
const codePath = arg("code");

if (!pdfPath || !phaseId || !inPath) {
  die("usage: --pdf <file.pdf> --phase <id> --in <answer.json> [--code <file>]");
}
const phase = phaseById(phaseId);
if (!phase) die(`unknown phase "${phaseId}" (expected one of ${PHASES.map((p) => p.id).join(", ")})`);
if (!fs.existsSync(pdfPath)) die(`no such PDF: ${pdfPath}`);
if (!fs.existsSync(inPath)) die(`no such answer file: ${inPath}`);

const pdfBase64 = fs.readFileSync(pdfPath).toString("base64");
const codeText = codePath ? fs.readFileSync(codePath, "utf8") : null;
const key = fixtureKey(pdfBase64, codeText);

const parsed = parseLenient(fs.readFileSync(inPath, "utf8"));
if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
  die("the answer must be a single JSON object");
}

/* The browser copies only this phase's declared keys (mergePhase), so anything
 * else in the answer is dead weight — and a MISSING key is a phase that will
 * look like it replayed while quietly dropping part of the spec. */
const present = phase.keys.filter((k) => parsed[k] !== undefined);
const absent = phase.keys.filter((k) => parsed[k] === undefined);
const extra = Object.keys(parsed).filter((k) => !phase.keys.includes(k));

const dir = path.join(ROOT, "public", "fixtures", key);
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${phase.id}.json`);
fs.writeFileSync(out, JSON.stringify(parsed, null, 2), "utf8");

/* A note of what this directory is a recording OF — the key alone is opaque,
 * and a fixtures folder nobody can identify six months later gets deleted. */
const metaPath = path.join(dir, "meta.json");
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : { phases: {} };
meta.pdf = path.relative(ROOT, path.resolve(pdfPath));
meta.pdfBytes = fs.statSync(pdfPath).size;
if (codePath) meta.code = path.relative(ROOT, path.resolve(codePath));
meta.phases[phase.id] = { recordedAt: new Date().toISOString(), keys: present };
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");

console.log(`wrote    ${path.relative(ROOT, out)}`);
console.log(`keys     ${present.join(", ") || "(none!)"}`);
if (absent.length) console.log(`MISSING  ${absent.join(", ")} — the spec will be short these fields`);
if (extra.length) console.log(`ignored  ${extra.join(", ")} — not owned by this phase, mergePhase drops them`);

const done = PHASES.filter((p) => fs.existsSync(path.join(dir, `${p.id}.json`))).map((p) => p.id);
const todo = PHASES.filter((p) => !done.includes(p.id)).map((p) => p.id);
console.log(`recorded ${done.length}/${PHASES.length}: ${done.join(", ")}`);
if (todo.length) console.log(`next     ${todo[0]}`);
else console.log(`complete — run the app with VITE_FIXTURES=1 (or ?fixtures=1) to replay it free`);
