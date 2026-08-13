/**
 * Every schema handed to the structured-output decoder, checked against what
 * the decoder actually accepts.
 *
 * The decoder compiles the schema into a grammar and rejects the whole request
 * with a 400 for a keyword it does not support — and because each of these
 * call sites has a schema-in-the-prompt fallback, a schema it won't take does
 * not fail loudly. It quietly downgrades every call to the weaker path. This
 * is the check that keeps that from happening silently.
 */
import {
  LESSON_PLAN_SCHEMA, LESSON_SECTION_SCHEMA, FIGURE_PANELS_SCHEMA,
  DIGITIZE_ASSIST_SCHEMA, forStructuredOutput,
} from "../supabase/functions/_shared/paperSpec.js";

const BANNED = [
  "minItems", "maxItems", "uniqueItems", "contains", "minContains", "maxContains",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength",
];

function scan(node, path, hits) {
  if (Array.isArray(node)) { node.forEach((n, i) => scan(n, `${path}[${i}]`, hits)); return; }
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) {
    if (BANNED.includes(k)) hits.push(`${path}.${k}`);
    scan(v, `${path}.${k}`, hits);
  }
}

let bad = 0;
for (const [name, schema] of Object.entries({
  LESSON_PLAN_SCHEMA, LESSON_SECTION_SCHEMA, FIGURE_PANELS_SCHEMA, DIGITIZE_ASSIST_SCHEMA,
})) {
  const before = [];
  scan(schema, name, before);
  const after = [];
  const clean = forStructuredOutput(schema);
  scan(clean, name, after);

  // Sanitizing must not damage the schema: same required fields, same shape.
  const sameShape = JSON.stringify(Object.keys(clean).sort()) === JSON.stringify(Object.keys(schema).sort());

  console.log(
    `${after.length === 0 && sameShape ? "ok  " : "FAIL"} ${name.padEnd(22)} ` +
    `stripped ${String(before.length).padStart(2)} · remaining ${after.length}` +
    (sameShape ? "" : " · TOP-LEVEL KEYS CHANGED"),
  );
  if (after.length) { bad++; console.log("      still present:", after.join(", ")); }
  if (!sameShape) bad++;
}

// The bounds must survive as prose, or the model loses the instruction.
const plan = forStructuredOutput(LESSON_PLAN_SCHEMA);
const note = plan.properties.sections.description || "";
console.log(`${note.includes("1-8 items") ? "ok  " : "FAIL"} bound folded into description: ${JSON.stringify(note.slice(-30))}`);
if (!note.includes("1-8 items")) bad++;

process.exit(bad ? 1 : 0);
