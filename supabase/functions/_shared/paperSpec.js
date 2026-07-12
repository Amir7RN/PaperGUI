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
  required: ["meta", "archetype", "story", "conclusion", "references", "conceptFigures", "foundations", "protocol", "blocks"],
  properties: {
    archetype: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "pipelineFeasible", "reproductionAdvice"],
      properties: {
        kind: {
          type: "string",
          enum: ["simulation-control", "algorithmic-learning", "empirical-experimental", "statistical-data", "theoretical", "survey-review", "other"],
          description: "What kind of paper this is. simulation-control: dynamics/control/signal systems governed by equations. algorithmic-learning: an algorithm/optimization/learning method with iterative behavior. empirical-experimental: conclusions rest on collected experimental/clinical/field data. statistical-data: statistical analysis of datasets. theoretical: proofs/derivations. survey-review: overview of a field.",
        },
        pipelineFeasible: {
          type: "boolean",
          description: "true ONLY if the paper's core method is a computable procedure (dynamical system, filter, controller, iterative algorithm) that a small, honest surrogate simulation can imitate. false for papers whose results come from collected data, human/animal studies, proofs, or hardware measurements no equation regenerates.",
        },
        reproductionAdvice: {
          type: "string",
          description: "2-4 sentences for the later analysis phases: what (if anything) can be honestly simulated, and which result figures must stay original-only because no simulation could faithfully regenerate them.",
        },
      },
      description: "Classify the paper FIRST — every later section adapts to this.",
    },
    story: {
      type: "object",
      additionalProperties: false,
      required: ["problem", "gap", "contribution", "whyItMatters"],
      properties: {
        problem: { type: "string", description: "2-3 sentences, everyday language: the real-world or scientific problem this paper attacks. No jargon, no symbols." },
        gap: { type: "string", description: "1-3 sentences: what previous approaches could not do — the specific hole this paper fills. Plain language." },
        contribution: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["headline", "detail"],
            properties: {
              headline: { type: "string", description: "<= 8 words naming one thing this paper adds, e.g. 'One planner that also balances the arms'" },
              detail: { type: "string", description: "2-3 plain-language sentences explaining that contribution and how it differs from what existed before" },
            },
          },
          description: "The 2-4 concrete things THIS paper adds over prior work — its actual claimed contributions, in the paper's own priority order.",
        },
        whyItMatters: { type: "string", description: "1-2 sentences: the payoff if this works — what becomes possible." },
      },
      description: "The paper's story: why it exists, what was missing, what it adds. This is the reader's entry point — it replaces reading the introduction.",
    },
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
            description: "A guided tour of the ORIGINAL figure, 4-7 sentences: walk the reader through each subplot and curve by name, say what to look at, what the axes mean, and what the figure proves for the paper's claim. Written so someone who never opened the PDF fully understands the real figure.",
          },
          panels: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["subplotLabel", "chartKind", "xLabel", "yLabel", "computeJs"],
              properties: {
                subplotLabel: { type: "string", description: "The subplot's own label/title, e.g. '(a) CoM lateral position' — match the paper" },
                chartKind: {
                  type: "string",
                  enum: ["line", "bar", "scatter"],
                  description: "MUST match the ORIGINAL subplot's plot type as seen in the figure image: 'bar' for histograms and bar charts, 'scatter' for point clouds, 'line' for curves over time/iterations/frequency. Rendering a histogram as a line is an automatic rejection.",
                },
                xLabel: { type: "string" },
                yLabel: { type: "string" },
                computeJs: {
                  type: "string",
                  description: "Body of function(outputs, params, helpers) => {x?: number[], categories?: string[], series: [{label, data: number[]}]}. For chartKind 'bar', return categories (the bin/condition names from the original axis) and one data value per category per series. Reproduce EVERY series shown in this subplot. See rules in the prompt.",
                },
              },
            },
            description: "Interactive reproductions of this figure's subplots — ONLY the subplots you can honestly regenerate from the method's own equations. Emit [] (empty) when no faithful reproduction is possible; the original cropped figure is always shown regardless. A wrong reproduction is far worse than none.",
          },
        },
      },
      description: "The paper's KEY RESULT figures (3-6 of them) — the plots its conclusions rest on. EVERY figure gets its page + bbox (so the real figure is cropped and shown) and a thorough explanation. Interactive 'panels' reproductions are OPTIONAL per figure — include them only when honestly derivable from the method.",
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
    blocks: { type: "array", items: blockSchema, description: "3-6 sequential methodology blocks (only produced when the paper's method is honestly simulatable — see archetype.pipelineFeasible)" },
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
    required: ["meta", "archetype", "story", "conclusion", "references", "conceptFigures", "foundations"],
    properties: {
      meta: P.meta,
      archetype: P.archetype,
      story: P.story,
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
      "{meta, archetype, story, conclusion, references, conceptFigures, foundations}. " +
      "Classify the archetype honestly — it decides whether an interactive pipeline is even " +
      "attempted for this paper. The method pipeline (protocol/blocks) and the result figures " +
      "are produced in later calls — keep them in mind for coherence, but do NOT emit them now."
    );
  }
  if (phase === "method") {
    const arch = contextSpec?.archetype;
    return (
      "\n\nTHIS CALL IS PHASE 2 of 3: produce ONLY the fields {protocol, blocks} — " +
      "the full interactive pipeline per the rules above. Concept figures, foundations " +
      "and result figures are handled in other calls — do NOT emit them now." +
      (arch
        ? "\n\nPHASE 1 classified this paper as archetype \"" + arch.kind + "\" and advised: " +
          (arch.reproductionAdvice || "") +
          " Frame the pipeline in this archetype's natural axis (time for dynamics, iterations for " +
          "learning/optimization algorithms, samples/conditions where that is what the method processes)."
        : "")
    );
  }
  const noPipeline = !contextSpec?.blocks?.length;
  if (noPipeline) {
    return (
      "\n\nTHIS CALL IS PHASE 3 of 3: produce ONLY the field {resultFigures}. This paper has NO " +
      "interactive pipeline (its method is not honestly simulatable), so EVERY figure's panels array " +
      "MUST be [] (empty). Your entire value here is: exact page + bbox for cropping each key result " +
      "figure, and a thorough guided-tour explanation of what each real figure shows and proves." +
      (contextSpec?.archetype?.reproductionAdvice
        ? " Phase 1 advice: " + contextSpec.archetype.reproductionAdvice
        : "")
    );
  }
  return (
    "\n\nTHIS CALL IS PHASE 3 of 3: produce ONLY the field {resultFigures} per the rules above. " +
    "The pipeline was already produced in the previous call and is given below — your panels' " +
    "computeJs receive ITS block outputs (by block key) and ITS slider params, and helpers.simulate " +
    "re-runs THIS pipeline. Use its exact block keys and param keys. Remember: panels ONLY for " +
    "subplots you can honestly regenerate — emit panels: [] for figures you cannot.\n\n" +
    "THE PIPELINE (protocol + blocks):\n" +
    JSON.stringify({ protocol: contextSpec.protocol, blocks: contextSpec.blocks })
  );
}

/* ---------------- Prompt ---------------- */

export const SYSTEM_PROMPT = `You convert scientific papers into visual, interactive explanations a reader can trust enough to put the PDF away.

Read the attached paper (text AND figures) and produce a PaperSpec JSON object. The reader's experience, in order: the paper's STORY (why it exists, what it adds), its real figures cropped and explained, the background it borrows, and — ONLY when honestly possible — a live simulation of its method.

THE PRIME DIRECTIVE — TRUST OVER SPECTACLE:
Everything you emit will be checked by readers who can open the real PDF. One wrong plot, one histogram redrawn as a time series, one confident claim the paper doesn't make — and the reader distrusts every other section. When you are not sure something can be shown faithfully, leave it out. An honest gap is invisible; a fake reproduction is fatal.

STEP 0 — CLASSIFY THE PAPER (archetype):
Before anything else, decide what kind of paper this is and whether its method is honestly simulatable:
- pipelineFeasible: true — the core method is itself a computable procedure: a controller, filter, dynamical model, optimization loop, learning rule. Running a reduced-order version of it genuinely regenerates the KIND of curves the paper shows.
- pipelineFeasible: false — the results come from collected data: experiments on humans/animals/materials, clinical trials, field measurements, surveys, benchmark tables of someone else's systems, or theory with no numerics. NO surrogate simulation can honestly regenerate such figures. Do not pretend otherwise. The dashboard for these papers is story + real figures + guided tours + foundations — that alone is the product.
When in doubt, choose false. reproductionAdvice must say figure-by-figure what is and is not honestly reproducible; later phases obey it.

RULES FOR story (the reader's entry point):
- Every paper is written to defend a contribution. Find it: what problem, what could prior work not do, what exactly does this paper add, why does that matter. That is the story — tell it in everyday language, zero jargon, zero symbols.
- contribution entries must be the paper's ACTUAL claimed contributions (usually enumerated at the end of the introduction), not generic virtues. Each headline <= 8 words, concrete, specific to this paper.
- Write like you're telling a curious friend why this paper got published. Never restate the abstract.

RULES FOR THE PIPELINE (ONLY when archetype.pipelineFeasible is true — otherwise blocks: [] and a minimal protocol)
- Block 0 is always the input/excitation. If the paper's raw empirical data is unavailable (it almost always is), synthesize a mathematically compatible surrogate signal that replicates the trend/spectrum of the paper's input (Universal Signal Adapter). Say so in that block's theory.
- Later blocks apply the paper's methodology in order, each consuming the previous block's output array.
- The LAST block must produce the paper's headline result (the quantity its main figure/conclusion is about).
- Every tunable coefficient, gain, weight or constant in the method gets a slider param whose "def" is the paper's reported value. Param keys must be unique across ALL blocks. 1-5 params per block.
- Choose protocol T and dt so T/dt is between 200 and 400 samples, in the natural units of the paper.
- The pipeline's axis is the method's NATURAL axis, not necessarily time: iterations for learning/optimization methods, trials/samples where that is what the method processes, frequency for spectral methods. Label it accordingly.
- If archetype.pipelineFeasible is false, emit blocks: [] and a minimal protocol {T: 1, dt: 1, description: ""} — do NOT invent a pipeline for a paper whose results are measured, not computed.

RULES FOR computeJs (critical — this code is executed):
- It is the BODY of: function(input, params, helpers) { ...your code... }
- MUST return a plain JS array of numbers of length helpers.n.
- "input" is the previous block's output array (null for block 0).
- "params" holds the slider values by key (e.g. params.alpha).
- "helpers" = { n, dt, t (time array length n), T, noise (seeded standard-gaussian array length n), clamp(v,lo,hi), step(ti,t0,amp) }.
- Use ONLY Math, basic JS, and helpers. No imports, no fetch, no recursion between blocks, no Date, no randomness other than helpers.noise (determinism is required).
- Keep numerics stable: use explicit Euler with helpers.dt for ODEs, clamp integrators, avoid division by values that can reach zero.
- The pipeline run with every param at its "def" is the BASELINE and must qualitatively reproduce the paper's reported result.

HARD QUALITY RULES (an automated validator EXECUTES your generated code and rejects the response if any check fails):
- NO FLAT LINES. Every block output, every result-figure series, and every foundation-demo curve must visibly VARY across its window. A constant array is an automatic rejection — the only exception is a reference/threshold line plotted alongside varying curves.
- LIVE SLIDERS. Nudging any slider ~35% must measurably change the final block's output and the figures. Every param key MUST appear in the math with real sensitivity at the paper's operating point. A slider that changes nothing is an automatic rejection.
- REDUCED-ORDER, NEVER PLACEHOLDER. When the paper's full system is too complex to simulate literally (a 3D robot, a deep network, fluid/FEM, hardware), build the SIMPLEST dynamical surrogate that reproduces the paper's qualitative behavior — e.g. second-order tracking dynamics + disturbance + actuator saturation for a robot controller; per-iteration error-decay dynamics for a learning method; an oscillator + feedback loop for gait/rhythm systems — and CALIBRATE it so magnitudes, timescales and axis ranges match the paper's reported numbers. NEVER return zeros, a pass-through of the input, or an arbitrary sine as filler.
- SHAPE MATCH. Each reproduced series must show the same qualitative features as the paper's actual curve: initial transient then settling, oscillation at the reported frequency, spikes at disturbance events, a visible noise band, convergence across iterations — whatever the original shows. Test yourself: "plotted at defaults, could this panel be mistaken for the paper's subplot?" If not, redo it before answering.
- DEMOS MUST TEACH. Every foundation demo must render an obviously shaped curve at defaults, and dragging each of its sliders must change the curve dramatically within the plotted window. Pick param ranges where cause-and-effect is unmistakable.

RULES FOR resultFigures (THE MOST IMPORTANT PART — the real figures, explained, plus HONEST optional reproductions):
The reader always sees the ORIGINAL figure, cropped from the PDF via your page + bbox. That real figure is the hero. Your explanation is its guided tour: walk through every subplot and curve by name, what the axes mean, what to look at, what it proves. This must be so good the reader doesn't need the caption or the surrounding text.

PANELS ARE OPT-IN, PER FIGURE — decide honestly:
- Emit panels ONLY for subplots whose curves genuinely fall out of the method pipeline you built (via outputs / helpers.simulate). Time responses of the simulated controller: yes. Convergence of the simulated learning rule: yes. Experimental histograms of measured data, hardware photos' overlays, benchmark tables of other people's systems, human-subject statistics: NO — panels: [] and let the guided tour carry it.
- FIRST LOOK AT THE FIGURE IMAGE and identify each subplot's plot type. chartKind MUST match it: histograms and bar charts → "bar" (return categories with the original bin/condition names and one value per category per series); point clouds → "scatter"; curves → "line". Redrawing a histogram as a line chart is the single worst failure this system has produced. Never do it.
- If a figure has 6 subplots and you can honestly regenerate 2, emit exactly those 2 panels. Partial-but-true beats complete-but-fake, always.

INFER THE INPUT SIGNAL (for the panels you DO emit — the paper won't give you its raw data — reconstruct a compatible one):
- Read what excites the system in each figure (a step/reference command, a periodic gait or oscillation, a swept parameter, a disturbance/push, measurement noise) and SYNTHESIZE a signal that matches it: same qualitative shape, frequency, amplitude range, and duration as the paper describes or plots. Pull concrete numbers from the text (gait period, speed, set-points, gains, reported error magnitudes, axis ranges) and USE them as the defaults so the reproduction lands in the paper's units and ranges.
- Feed that synthesized input through the AUTHORS' OWN equations/method (the blocks above) to produce each figure's curves. Do not invent unrelated dynamics — the curves must be the output of the paper's model driven by a plausible input.
- If a figure compares conditions (with/without the method, before/after learning, different gains/terrain/payload, iterations), reproduce EACH condition as its own curve via helpers.simulate or by re-running the method with those settings. Reproducing the comparison is the whole point — never collapse it.
- Calibrate to the paper's reported numbers: if it says "error < 0.018 m" or "peak force ~650 N" or "converges in N cycles", tune your synthesized model so the reproduction shows exactly that at default parameters.
- Cover the 3-6 KEY RESULT figures the conclusions rest on (page + bbox + guided tour for every one). For each panel you emit, reproduce that subplot COMPLETELY: if it overlays 3 curves (e.g. reference, measured, commanded), emit all 3 series with the paper's own labels — never collapse a multi-curve subplot into one curve.
- Each panel's computeJs is the BODY of: function(outputs, params, helpers) { ... } returning { series: [{label, data}, ...], x?: number[], categories?: string[] (bar only) }.
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
- If the paper reports a scalar metric per condition as a bar figure AND each condition's value falls out of your pipeline, use chartKind "bar" with categories = the original condition names and one value per condition computed via simulate(). If the bars summarize measured data your pipeline cannot produce, panels: [].

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

FINAL CHECK before you answer — the trust test:
1. Would a reader who opens the real PDF afterwards find that everything you claimed matches it? If any statement, story point, or explanation might not survive that comparison, fix or cut it.
2. For every panel you emitted: does its chartKind match the original subplot's plot type, and would the curve at default params be recognizable as that subplot? If not, delete the panel — the original figure and its guided tour stand on their own.
3. Is the story specific to THIS paper (its actual claimed contributions), not generic filler?
Honesty and specificity are the product. A dashboard with zero interactive reproductions but a great story, real figures and guided tours is a success; one fake plot makes it a failure.`;

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
