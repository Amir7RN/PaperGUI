/**
 * Single source of truth for the paper-analysis contract: model tiers +
 * pricing, the PaperSpec JSON schema, and the analysis system prompt.
 *
 * Imported by BOTH runtimes:
 *  - the Deno edge function (supabase/functions/analyze-paper/index.ts),
 *    which is the only place that actually calls the Anthropic API
 *  - the Vite frontend (src/api.js), which only needs the tier metadata to
 *    render the picker and never sees pricing details beyond the labels
 *
 * Keeping this in one file means the frontend's tier picker and the server's
 * pricing/model logic can never drift out of sync.
 */

/* ---------------- analysis model tiers ----------------
 * Four capability levels mapped onto the current Claude lineup.
 * priceIn/priceOut are USD per million tokens (input/output) — used
 * server-side to meter real cost against each account's balance.
 * Haiku 4.5 has a different API surface: no adaptive thinking, no effort
 * parameter (both 400), and a 200K context window (≈100 PDF pages max).
 */
export const MODEL_TIERS = [
  {
    id: "advanced",
    label: "Advanced",
    // Opus 4.8 — the highest-quality reproduction. Fast mode was removed:
    // this org's Anthropic plan has a fast-mode limit of 0 (gated preview),
    // so speed:"fast" 429s. At standard speed (~60 tok/s) Opus only fits the
    // hosting platform's 150s kill window at LOW effort — that's the ceiling
    // on Supabase's FREE tier. On Supabase PRO (400s window) raise this to
    // "high" for the full-quality result (see README → analysis tiers).
    model: "claude-opus-4-8",
    blurb: "Deepest, most faithful reproduction — best for dense, math-heavy papers",
    adaptive: true,
    effort: "low",
    priceIn: 5.0,
    priceOut: 25.0,
  },
  {
    id: "standard",
    label: "Standard",
    model: "claude-sonnet-5",
    blurb: "Balanced quality, speed and cost — the recommended default",
    adaptive: true,
    // "medium" fits each analysis phase inside the platform's 150s kill
    // window; on Sonnet 5, medium ≈ the previous generation's high.
    effort: "medium",
    priceIn: 3.0,
    priceOut: 15.0,
  },
  {
    id: "basic",
    label: "Basic",
    model: "claude-sonnet-4-6",
    blurb: "Lighter analysis for straightforward papers",
    adaptive: true,
    effort: "medium",
    priceIn: 3.0,
    priceOut: 15.0,
  },
  {
    id: "fast",
    label: "Fast",
    model: "claude-haiku-4-5",
    blurb: "Quickest and cheapest — papers up to ~100 pages",
    adaptive: false,
    effort: null,
    priceIn: 1.0,
    priceOut: 5.0,
  },
];

export function tierById(id) {
  return MODEL_TIERS.find((t) => t.id === id) || null;
}

/**
 * Actual USD cost of one Anthropic response given its `usage` block.
 * cache_creation is billed at ~1.25x the input price (5-minute TTL write),
 * cache_read at ~0.1x — this app doesn't use prompt caching today, but the
 * math is included so cost tracking stays correct if that changes.
 */
export function usageCostUsd(tier, usage) {
  if (!usage) return 0;
  const inTok = usage.input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cost =
    (inTok * tier.priceIn) / 1e6 +
    (outTok * tier.priceOut) / 1e6 +
    (cacheWrite * tier.priceIn * 1.25) / 1e6 +
    (cacheRead * tier.priceIn * 0.1) / 1e6;
  return cost;
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
  required: ["key", "title", "plain", "equation", "params", "theory", "pythonCode", "computeJs"],
  properties: {
    key:      { type: "string", description: "Short unique JS-identifier-safe block id" },
    title:    { type: "string", description: "e.g. 'Stage 1 — Kalman Prediction'" },
    plain:    { type: "string", description: "2-4 sentences telling this step's STORY in everyday language a curious teenager would enjoy — vivid, metaphor welcome, zero jargon, zero symbols. This is what the reader sees first; the math hides behind a toggle." },
    equation: { type: "string", description: "The governing equation in plain unicode math (no LaTeX)" },
    params:   { type: "array", items: paramSchema },
    theory:   { type: "string", description: "The paper's own explanation of this step, closely paraphrasing the relevant paragraph, with section reference" },
    pythonCode: { type: "string", description: "Clean executable Python/NumPy snippet implementing this block" },
    computeJs:  { type: "string", description: "Body of a JS function (input, params, helpers) => number[] of length helpers.n. See rules in the prompt." },
  },
};

const demoSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "T", "dt", "xLabel", "yLabel", "caption", "params", "computeJs"],
  properties: {
    kind: { type: "string", description: "'chart' (line plot) or 'frames' (animated colored grid, for inherently spatial/iterative ideas: gridworld RL, value iteration, message passing, network weights updating)" },
    T:  { type: "number", description: "Demo horizon (chart kind); e.g. 10" },
    dt: { type: "number", description: "Demo step; T/dt should be 100-400. For frames kind use T=1, dt=1." },
    xLabel: { type: "string" },
    yLabel: { type: "string" },
    caption: { type: "string", description: "One inviting sentence telling the reader what to try, e.g. 'drag the learning rate and watch the error die out'" },
    params: { type: "array", items: paramSchema, description: "1-3 sliders" },
    computeJs: {
      type: "string",
      description: "Body of function(params, helpers). chart kind: return {x?: number[], series: [{label, data: number[]}]} (1-4 series, same length, x defaults to helpers.t). frames kind: return {frames: [{grid: number[][] (<=10x10), note: string}]} with 4-25 frames showing the idea converging step by step. Only Math + helpers {n,dt,t,T,noise,clamp,step}. Deterministic.",
    },
  },
};

export const SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meta", "conclusion", "references", "conceptFigures", "foundations", "protocol", "blocks"],
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
    foundations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "source", "concept", "equation", "whyItMatters", "demo"],
        properties: {
          title: { type: "string", description: "Name of the borrowed concept, e.g. 'Centroidal momentum dynamics'" },
          source: { type: "string", description: "Where it comes from, as the paper cites it, e.g. 'Orin et al., Autonomous Robots 2013 [12]'" },
          concept: {
            type: "string",
            description: "4-7 sentences teaching this prior-work concept to a newcomer in everyday language, in this paper's context. A mini-lesson, not a citation.",
          },
          equation: { type: "string", description: "The concept's key equation in plain unicode math, or empty string if none" },
          whyItMatters: { type: "string", description: "1-2 sentences: what this paper builds on top of this concept" },
          demo: demoSchema,
        },
      },
      description: "The 2-4 core ideas the paper BORROWS from prior work — the 'wheels' it doesn't reinvent but the reader must understand (e.g. the base dynamics model, the classic control/learning principle, the standard optimization formulation).",
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

/* ---------------- Phase split ----------------
 * The hosting platform (Supabase Edge Functions) hard-kills a function at
 * 150s of wall clock, so one call can never produce the whole spec for a
 * real paper. The client instead requests the analysis in THREE sequential
 * calls — overview → method → results — each returning a slice of the
 * PaperSpec that the client merges. The PDF document block is prompt-cached
 * (5-minute TTL), so calls 2 and 3 re-read it at ~10% of the input price.
 */

const P = SPEC_SCHEMA.properties;

export const PHASE_SCHEMAS = {
  overview: {
    type: "object",
    additionalProperties: false,
    required: ["meta", "conclusion", "references", "conceptFigures", "foundations"],
    properties: {
      meta: P.meta,
      conclusion: P.conclusion,
      references: P.references,
      conceptFigures: P.conceptFigures,
      foundations: P.foundations,
    },
  },
  method: {
    type: "object",
    additionalProperties: false,
    required: ["protocol", "blocks"],
    properties: { protocol: P.protocol, blocks: P.blocks },
  },
  results: {
    type: "object",
    additionalProperties: false,
    required: ["resultFigures"],
    properties: { resultFigures: P.resultFigures },
  },
};

/** Per-phase instruction appended to the prompt. `contextSpec` is the
 *  {protocol, blocks} slice from the method phase, required by results. */
export function phaseInstruction(phase, contextSpec) {
  if (phase === "overview") {
    return (
      "\n\nTHIS CALL IS PHASE 1 of 3: produce ONLY the fields " +
      "{meta, conclusion, references, conceptFigures, foundations}. " +
      "The method pipeline (protocol/blocks) and the result-figure reproductions are " +
      "produced in later calls — keep them in mind for coherence, but do NOT emit them now."
    );
  }
  if (phase === "method") {
    return (
      "\n\nTHIS CALL IS PHASE 2 of 3: produce ONLY the fields {protocol, blocks} — " +
      "the full interactive pipeline per the rules above. Concept figures, foundations " +
      "and result figures are handled in other calls — do NOT emit them now."
    );
  }
  return (
    "\n\nTHIS CALL IS PHASE 3 of 3: produce ONLY the field {resultFigures}, reproducing " +
    "the paper's key result figures per the rules above. The pipeline was already produced " +
    "in the previous call and is given below — your panels' computeJs receive ITS block " +
    "outputs (by block key) and ITS slider params, and helpers.simulate re-runs THIS " +
    "pipeline. Use its exact block keys and param keys.\n\nTHE PIPELINE (protocol + blocks):\n" +
    JSON.stringify(contextSpec || {})
  );
}

/* ---------------- Prompt ---------------- */

export const SYSTEM_PROMPT = `You convert scientific papers into interactive computational playgrounds.

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

INFER THE INPUT SIGNAL (the paper won't give you its raw data — reconstruct a compatible one):
- Read what excites the system in each figure (a step/reference command, a periodic gait or oscillation, a swept parameter, a disturbance/push, measurement noise) and SYNTHESIZE a signal that matches it: same qualitative shape, frequency, amplitude range, and duration as the paper describes or plots. Pull concrete numbers from the text (gait period, speed, set-points, gains, reported error magnitudes, axis ranges) and USE them as the defaults so the reproduction lands in the paper's units and ranges.
- Feed that synthesized input through the AUTHORS' OWN equations/method (the blocks above) to produce each figure's curves. Do not invent unrelated dynamics — the curves must be the output of the paper's model driven by a plausible input.
- If a figure compares conditions (with/without the method, before/after learning, different gains/terrain/payload, iterations), reproduce EACH condition as its own curve via helpers.simulate or by re-running the method with those settings. Reproducing the comparison is the whole point — never collapse it.
- Calibrate to the paper's reported numbers: if it says "error < 0.018 m" or "peak force ~650 N" or "converges in N cycles", tune your synthesized model so the reproduction shows exactly that at default parameters.
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

RULES FOR foundations (the borrowed background — TEACH IT INTERACTIVELY):
- No paper reinvents everything. Identify the 2-4 PRIOR-WORK concepts this paper builds on and that the reader must understand first (the base dynamics model, the classic control/learning/statistical principle, the standard optimization or filtering formulation, the canonical benchmark model).
- For each: teach it in 4-7 sentences of everyday language as a mini-lesson in this paper's context, give its key equation in plain unicode (or empty string), cite the source the way the paper does, and say in 1-2 sentences what THIS paper adds on top.
- EVERY foundation gets a "demo": a small interactive experiment that makes the concept CLICK, with 1-3 sliders. Pick the visualization that teaches best — you decide:
    * kind "chart" for signal/response/tradeoff ideas: e.g. a filter demo where a noise slider and a smoothing slider fight; a feedback demo where a gain slider trades speed against overshoot; a learning-rate slider making error die out over iterations.
    * kind "frames" for inherently spatial or iterative ideas: an animated colored grid stepping through time — value iteration filling a gridworld from the goal outward, activations/weights updating in a small network, information propagating across cells. 4-25 frames, grid <= 10x10, each frame with a one-line note narrating what just happened.
- The demo must be about the CONCEPT (a minimal toy), not the paper's full system — small, punchy, obvious cause-and-effect within 2 seconds of dragging a slider.
- These must be genuinely from prior literature (the paper's related-work / preliminaries), distinct from the paper's own contribution blocks.

RULES FOR blocks.plain (the story layer — this is what makes the platform addictive):
- Every block's "plain" field is the FIRST thing the reader sees; the equation hides behind a "show the math" toggle. Write it like a great teacher hooked on the subject: everyday words, one vivid metaphor, cause-and-effect, zero symbols, zero jargon. Example register: "Reality never matches the blueprint — motors drag, ground gives. This block bundles everything the model got wrong into one signal that keeps shoving the leg off its rhythm."

OTHER FIELDS
- equation: plain unicode math (α, Σ, ∫, subscripts), never LaTeX.
- theory: closely paraphrase the paper's explanation for that step, with the section number.
- pythonCode: clean NumPy translation of the same block.
- conceptFigures: pick the 1-3 INTRODUCTORY/architecture figures (not results plots), give their 1-indexed PDF page and bbox, and explain each in 3-6 sentences so the reader can follow the idea without the paper.
- conclusion: the paper's core finding, naming the coefficient values it depends on.

FINAL CHECK before you answer: would a reader who never opened the PDF see, in resultFigures, the same set of plots — same subplots, same overlaid curves, same shapes — that the paper actually shows? If any key figure is missing, or any multi-curve subplot was reduced to one curve, fix it before responding. Completeness of the result-figure reproduction is the single most important quality of your output.`;

/** Build the optional user-guidance block appended to the analysis prompt. */
export function hintsBlock(hints) {
  if (!hints) return "";
  const parts = [];
  if (hints.domain?.trim())  parts.push(`- Field / domain: ${hints.domain.trim()}`);
  if (hints.focus?.trim())   parts.push(`- Figures or results to prioritize reproducing: ${hints.focus.trim()}`);
  if (hints.signal?.trim())  parts.push(`- What drives the system / experimental setup, per the reader: ${hints.signal.trim()}`);
  if (hints.notes?.trim())   parts.push(`- Additional context from the reader: ${hints.notes.trim()}`);
  if (!parts.length) return "";
  return `\n\nREADER-PROVIDED GUIDANCE (use it to sharpen the reproduction — it comes from the person who knows this paper):\n${parts.join("\n")}`;
}
