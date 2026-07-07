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
        required: ["page", "title", "explanation", "bbox"],
        properties: {
          page:  { type: "integer", description: "1-indexed PDF page where this conceptual/architecture figure appears" },
          title: { type: "string", description: "e.g. 'Fig. 1 — System overview'" },
          explanation: {
            type: "string",
            description: "3-6 sentences a newcomer can follow: what the figure shows and why it matters for the method. This replaces reading the paper.",
          },
          bbox: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "w", "h"],
            properties: {
              x: { type: "number", description: "Left edge of the figure region as a fraction of page width (0-1)" },
              y: { type: "number", description: "Top edge as a fraction of page height (0-1, origin top-left)" },
              w: { type: "number", description: "Width as a fraction of page width" },
              h: { type: "number", description: "Height as a fraction of page height; include the caption" },
            },
            description: "Tight bounding box of just the figure (plus caption) so it can be cropped out of the page. Pad generously.",
          },
        },
      },
      description: "The introductory/conceptual figures that explain the idea (NOT results plots). Usually 1-3 figures from the first half of the paper.",
    },
    resultFigures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["figureLabel", "page", "bbox", "title", "explanation", "panels"],
        properties: {
          figureLabel: { type: "string", description: "The paper's own label, e.g. 'Fig. 6'" },
          page:  { type: "integer", description: "1-indexed PDF page where this results figure appears" },
          bbox: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "w", "h"],
            properties: {
              x: { type: "number" }, y: { type: "number" },
              w: { type: "number" }, h: { type: "number" },
            },
            description: "Fractional bounding box of the WHOLE original figure on its page (0-1, top-left origin), caption included",
          },
          title: { type: "string", description: "What this figure demonstrates, e.g. 'Push-recovery response of the whole-body controller'" },
          explanation: {
            type: "string",
            description: "3-5 sentences: what the original figure shows (name its subplots and curves), and which sliders visibly change the reproduction",
          },
          panels: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["subplotLabel", "xLabel", "yLabel", "computeJs"],
              properties: {
                subplotLabel: { type: "string", description: "The subplot's own label/title, e.g. '(a) CoM lateral position' — match the paper" },
                xLabel: { type: "string" },
                yLabel: { type: "string" },
                computeJs: {
                  type: "string",
                  description: "Body of function(outputs, params, helpers) => {x?: number[], series: [{label, data: number[]}]}. Reproduce EVERY curve shown in this subplot. See rules in the prompt.",
                },
              },
            },
            description: "One entry per subplot in the original figure. A figure with subplots (a)(b)(c)(d) MUST have 4 panels. Reproduce ALL subplots and ALL curves.",
          },
        },
      },
      description: "Faithful reproductions of the paper's KEY RESULT figures (3-6 of them) — the experimental/simulation plots the conclusions rest on. Reproduce each figure with ALL its subplots and ALL its curves.",
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

RULES FOR resultFigures (THE MOST IMPORTANT PART — these are faithful, interactive reproductions of the paper's REAL plots):
Your job here is to DUPLICATE the paper's result figures, not to draw a vague single-curve sketch. Treat this like being asked to reproduce every figure of the paper from its equations.
- Reproduce the 3-6 KEY RESULT figures the conclusions rest on. For EACH figure, look at it carefully and reproduce ALL of its subplots and ALL of the curves within each subplot. If a figure has subplots (a),(b),(c),(d), emit 4 panels. If a subplot overlays 3 curves (e.g. reference, measured, commanded), emit all 3 series with the paper's own labels. Never collapse a multi-curve figure into one curve.
- Each panel's computeJs is the BODY of: function(outputs, params, helpers) { ... } returning { series: [{label, data}, ...], x?: number[] }.
    * "outputs" = every pipeline block's output array by key (e.g. outputs.resp) at the CURRENT slider values.
    * "params" = current slider values.
    * "helpers" = { n, dt, t, T, noise, clamp, step, AND simulate }.
- helpers.simulate(overrides) RE-RUNS THE WHOLE PIPELINE with parameter overrides and returns its output map. USE THIS to reproduce comparison/ablation/sweep curves the way the paper does:
    * "with vs without controller":  const off = helpers.simulate({ Kp:0, Ki:0, Kd:0 });  plot off.resp against outputs.resp.
    * "response to small vs large perturbation": call simulate with different disturbance-related params for each curve.
    * "gain sweep / robustness": loop over a few values, simulate each, plot each as its own series.
  This is the key to matching real figures — most paper figures compare several conditions, and simulate() is how you generate each condition's curve so the sliders still reshape everything.
- Every series in a panel must share one length. Return x (same length) when the x-axis is not time (e.g. step index, frequency, phase, a swept parameter); otherwise omit x and use length helpers.n.
- At default params the reproduction MUST qualitatively match the ORIGINAL: same subplots, same number of curves, same trends, comparable axis ranges, same legend names. Set xLabel/yLabel from the original axes.
- Derive everything from the pipeline (outputs / simulate) so moving a slider visibly changes the real figure. Small auxiliary quantities (reference commands, bounds, thresholds, envelopes) may be computed inline.
- Same determinism/safety rules as block computeJs: only Math, basic JS, and helpers. No imports, no randomness beyond helpers.noise, keep numerics stable.
- If the paper reports a scalar metric per condition as a bar/scatter figure, reproduce it by returning x = condition index and one point per condition computed via simulate().

RULES FOR FIGURE BOUNDING BOXES (bbox):
- Look at the actual page image. Give the figure's region as fractions of the page: x = left edge / page width, y = top edge / page height (origin top-left), w and h likewise.
- Include the caption; exclude unrelated text columns. When unsure, err on the larger side — cropping slightly too much is fine, cutting the figure is not.

OTHER FIELDS
- equation: plain unicode math (α, Σ, ∫, subscripts), never LaTeX.
- theory: quote or closely paraphrase the paper's own paragraph for that step, with the section number.
- pythonCode: clean NumPy translation of the same block.
- conceptFigures: pick the 1-3 INTRODUCTORY/architecture figures (not results plots), give their 1-indexed PDF page and bbox, and explain each in 3-6 sentences so the reader can follow the idea without the paper.
- conclusion: the paper's core finding, naming the coefficient values it depends on.

FINAL CHECK before you answer: would a reader who never opened the PDF see, in resultFigures, the same set of plots — same subplots, same overlaid curves, same shapes — that the paper actually shows? If any key figure is missing, or any multi-curve subplot was reduced to one curve, fix it before responding. Completeness of the result-figure reproduction is the single most important quality of your output.`;

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

  // onProgress receives { pct, label }. Streaming can't know the total length
  // ahead of time, so streaming maps extracted-kB onto a 8→80% band that eases
  // toward (but never reaches) 80% until the response completes.
  const report = (pct, label) => onProgress?.({ pct, label });
  report(6, `${tier.label} analysis — reading the paper (text + figures)…`);

  const outputConfig = { format: { type: "json_schema", schema: SPEC_SCHEMA } };
  if (tier.effort) outputConfig.effort = tier.effort;

  // Stream with a large output budget: reasoning tokens and the extracted
  // JSON share max_tokens, so a small cap truncates mid-analysis (wasting the
  // whole request). Streaming also avoids HTTP timeouts on long analyses and
  // lets us show live progress.
  const maxTokens = tier.id === "fast" ? 48000 : 96000; // faithful figure sets are long; Fast (Haiku) caps at 64K output
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
  let thinking = true;
  stream.on("text", (delta) => {
    thinking = false;
    chars += delta.length;
    const now = Date.now();
    if (now - lastUpdate > 400) {
      lastUpdate = now;
      const kb = chars / 1024;
      const pct = 8 + 72 * (1 - Math.exp(-kb / 30)); // eases toward 80%
      report(Math.min(80, pct), `Reconstructing the paper — ${kb.toFixed(1)} kB extracted so far…`);
    }
  });
  stream.on("thinking", () => {
    if (thinking && Date.now() - lastUpdate > 400) {
      lastUpdate = Date.now();
      report(7, `${tier.label} analysis — studying the methodology and figures…`);
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

  report(82, "Parsing the extracted methodology…");
  const textBlock = response.content.find((b) => b.type === "text" && b.text);
  if (!textBlock) throw new Error("Empty response from the analyzer.");
  return JSON.parse(textBlock.text);
}
