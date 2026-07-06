/**
 * Claude-powered paper analysis.
 *
 * Runs entirely in the browser: the user's API key lives in localStorage and
 * requests go directly to the Anthropic API (this is what makes the app
 * deployable as a static GitHub Pages site — there is no server to hold the
 * key). The key is NEVER committed to the repository.
 *
 * The PDF is sent as a base64 document block; Claude reads text AND figures.
 * The response is constrained to the PaperSpec JSON schema via structured
 * outputs, so it always parses.
 */

import Anthropic from "@anthropic-ai/sdk";

const KEY_STORAGE = "paper-playground-api-key";
const TIER_STORAGE = "paper-playground-model-tier";

export function getApiKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ""; } catch { return ""; }
}

export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch { /* storage unavailable — key just won't persist */ }
}

/* ---------------- analysis model tiers ----------------
 * Four capability levels mapped onto the current Claude lineup.
 * Haiku 4.5 has a different API surface: no adaptive thinking, no effort
 * parameter (both 400), and a 200K context window (≈100 PDF pages max).
 */
export const MODEL_TIERS = [
  {
    id: "advanced",
    label: "Advanced",
    model: "claude-opus-4-8",
    blurb: "Deepest analysis — best for dense, math-heavy papers",
    adaptive: true,
    effort: "high",
  },
  {
    id: "standard",
    label: "Standard",
    model: "claude-sonnet-5",
    blurb: "Balanced quality, speed and cost — the recommended default",
    adaptive: true,
    effort: "high",
  },
  {
    id: "basic",
    label: "Basic",
    model: "claude-sonnet-4-6",
    blurb: "Lighter analysis for straightforward papers",
    adaptive: true,
    effort: "high",
  },
  {
    id: "fast",
    label: "Fast",
    model: "claude-haiku-4-5",
    blurb: "Quickest and cheapest — papers up to ~100 pages",
    adaptive: false,
    effort: null,
  },
];

export function getModelTier() {
  try {
    const saved = localStorage.getItem(TIER_STORAGE);
    return MODEL_TIERS.find((t) => t.id === saved) || MODEL_TIERS[0];
  } catch {
    return MODEL_TIERS[0];
  }
}

export function setModelTier(id) {
  try { localStorage.setItem(TIER_STORAGE, id); } catch { /* non-fatal */ }
}

/* ---------------- PaperSpec JSON schema (structured outputs) -------------- */

const paramSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "sym", "label", "min", "max", "step", "def"],
  properties: {
    key:   { type: "string", description: "Unique JS-identifier-safe parameter name, unique across ALL blocks" },
    sym:   { type: "string", description: "Display symbol, unicode ok (e.g. α, Kₚ)" },
    label: { type: "string" },
    min:   { type: "number" },
    max:   { type: "number" },
    step:  { type: "number" },
    def:   { type: "number", description: "The value the paper reports/uses — the baseline" },
  },
};

const blockSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "title", "equation", "params", "theory", "pythonCode", "computeJs"],
  properties: {
    key:      { type: "string", description: "Short unique JS-identifier-safe block id" },
    title:    { type: "string", description: "e.g. 'Stage 1 — Kalman Prediction'" },
    equation: { type: "string", description: "The governing equation in plain unicode math (no LaTeX)" },
    params:   { type: "array", items: paramSchema },
    theory:   { type: "string", description: "The paper's own explanation of this step, quoting or closely paraphrasing the relevant paragraph, with section reference" },
    pythonCode: { type: "string", description: "Clean executable Python/NumPy snippet implementing this block" },
    computeJs:  { type: "string", description: "Body of a JS function (input, params, helpers) => number[] of length helpers.n. See rules in the prompt." },
  },
};

const SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meta", "conclusion", "references", "conceptFigures", "protocol", "blocks"],
  properties: {
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["title", "authors", "venue", "abstract"],
      properties: {
        title:    { type: "string" },
        authors:  { type: "string" },
        venue:    { type: "string", description: "Journal/conference + year if identifiable, else empty string" },
        abstract: { type: "string", description: "The paper's abstract, condensed to <= 120 words" },
      },
    },
    conclusion: {
      type: "string",
      description: "The paper's core scientific finding in 2-4 sentences, naming the key coefficient values it depends on",
    },
    references: {
      type: "array",
      items: { type: "string" },
      description: "Up to 12 of the paper's most important references, full citation strings",
    },
    conceptFigures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["page", "title", "explanation"],
        properties: {
          page:  { type: "integer", description: "1-indexed PDF page where this conceptual/architecture figure appears" },
          title: { type: "string", description: "e.g. 'Fig. 1 — System overview'" },
          explanation: {
            type: "string",
            description: "3-6 sentences a newcomer can follow: what the figure shows and why it matters for the method. This replaces reading the paper.",
          },
        },
      },
      description: "The introductory/conceptual figures that explain the idea (NOT results plots). Usually 1-3 figures from the first half of the paper.",
    },
    protocol: {
      type: "object",
      additionalProperties: false,
      required: ["T", "dt", "description"],
      properties: {
        T:  { type: "number", description: "Simulation horizon in the signal's natural units (aim for 200-400 samples total)" },
        dt: { type: "number", description: "Sample step; T/dt should be 200-400" },
        description: { type: "string", description: "One paragraph naming the fixed protocol constants and their paper-reported values" },
      },
    },
    blocks: { type: "array", items: blockSchema, description: "3-6 sequential methodology blocks" },
  },
};

/* ---------------- Prompt ---------------- */

const SYSTEM_PROMPT = `You convert scientific papers into interactive computational playgrounds.

Read the attached paper (text AND figures) and produce a PaperSpec JSON object that recreates the paper's methodology as a sequential pipeline of 3-6 computational blocks, each with live coefficient sliders, so a reader can reproduce and perturb the paper's headline result without reading the paper.

RULES FOR THE PIPELINE
- Block 0 is always the input/excitation. If the paper's raw empirical data is unavailable (it almost always is), synthesize a mathematically compatible surrogate signal that replicates the trend/spectrum of the paper's input (Universal Signal Adapter). Say so in that block's theory.
- Later blocks apply the paper's methodology in order, each consuming the previous block's output array.
- The LAST block must produce the paper's headline result (the quantity its main figure/conclusion is about).
- Every tunable coefficient, gain, weight or constant in the method gets a slider param whose "def" is the paper's reported value. Param keys must be unique across ALL blocks. 1-5 params per block.
- Choose protocol T and dt so T/dt is between 200 and 400 samples, in the natural units of the paper.

RULES FOR computeJs (critical — this code is executed):
- It is the BODY of: function(input, params, helpers) { ...your code... }
- MUST return a plain JS array of numbers of length helpers.n.
- "input" is the previous block's output array (null for block 0).
- "params" holds the slider values by key (e.g. params.alpha).
- "helpers" = { n, dt, t (time array length n), T, noise (seeded standard-gaussian array length n), clamp(v,lo,hi), step(ti,t0,amp) }.
- Use ONLY Math, basic JS, and helpers. No imports, no fetch, no recursion between blocks, no Date, no randomness other than helpers.noise (determinism is required).
- Keep numerics stable: use explicit Euler with helpers.dt for ODEs, clamp integrators, avoid division by values that can reach zero.
- The pipeline run with every param at its "def" is the BASELINE and must qualitatively reproduce the paper's reported result.

OTHER FIELDS
- equation: plain unicode math (α, Σ, ∫, subscripts), never LaTeX.
- theory: quote or closely paraphrase the paper's own paragraph for that step, with the section number.
- pythonCode: clean NumPy translation of the same block.
- conceptFigures: pick the 1-3 INTRODUCTORY/architecture figures (not results plots), give their 1-indexed PDF page, and explain each in 3-6 sentences so the reader can follow the idea without the paper.
- conclusion: the paper's core finding, naming the coefficient values it depends on.`;

/**
 * Analyze a paper PDF (base64 string, no newlines) with the given model tier
 * (defaults to the stored/most-capable tier).
 * onProgress(stageString) is called as the request advances.
 * Returns the parsed PaperSpec.
 */
export async function analyzePaper(pdfBase64, onProgress, tier = getModelTier()) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No API key set. Open Settings and paste your Anthropic API key.");

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true, // key is the user's own, stored only in their browser
  });

  onProgress?.(`${tier.label} analysis — reading the paper (text + figures)…`);

  const outputConfig = { format: { type: "json_schema", schema: SPEC_SCHEMA } };
  if (tier.effort) outputConfig.effort = tier.effort;

  // Stream with a large output budget: reasoning tokens and the extracted
  // JSON share max_tokens, so a small cap truncates mid-analysis (wasting the
  // whole request). Streaming also avoids HTTP timeouts on long analyses and
  // lets us show live progress.
  const maxTokens = tier.id === "fast" ? 32000 : 64000; // Haiku caps at 64K total; leave input headroom
  const stream = client.messages.stream({
    model: tier.model,
    max_tokens: maxTokens,
    ...(tier.adaptive ? { thinking: { type: "adaptive" } } : {}),
    output_config: outputConfig,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: SYSTEM_PROMPT },
        ],
      },
    ],
  });

  let chars = 0;
  let lastUpdate = 0;
  stream.on("text", (delta) => {
    chars += delta.length;
    const now = Date.now();
    if (now - lastUpdate > 500) {
      lastUpdate = now;
      onProgress?.(`${tier.label} analysis in progress — ${(chars / 1024).toFixed(1)} kB extracted…`);
    }
  });

  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new Error("The analyzer declined to process this document.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "The analysis ran longer than the output budget allows. Try the Standard or Advanced level, or a shorter paper."
    );
  }

  onProgress?.("Parsing extracted methodology…");
  const textBlock = response.content.find((b) => b.type === "text" && b.text);
  if (!textBlock) throw new Error("Empty response from the analyzer.");
  return JSON.parse(textBlock.text);
}
