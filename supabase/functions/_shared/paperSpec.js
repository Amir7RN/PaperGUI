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
    chartKind: { type: "string", enum: ["line", "bar", "scatter"], description: "For kind 'chart': the plot type. 'bar' for per-condition/per-bin values (return categories), 'scatter' for point clouds, 'line' (default) for curves." },
    T:  { type: "number", description: "Demo horizon (chart kind); e.g. 10" },
    dt: { type: "number", description: "Demo step; T/dt should be 100-400. For frames kind use T=1, dt=1." },
    xLabel: { type: "string" },
    yLabel: { type: "string" },
    caption: { type: "string", description: "One inviting sentence telling the reader what to try, e.g. 'drag the learning rate and watch the error die out'" },
    params: { type: "array", items: paramSchema, description: "0-3 sliders (0 only for reported-data charts with nothing honest to vary)" },
    computeJs: {
      type: "string",
      description: "Body of function(params, helpers). chart kind: return {x?: number[], categories?: string[] (bar), series: [{label, data: number[]}]} (1-4 series, same length, x defaults to helpers.t). frames kind: return {frames: [{grid: number[][] (<=10x10), note: string}]} with 4-25 frames showing the idea converging step by step. Only Math + helpers {n,dt,t,T,noise,clamp,step}. Deterministic.",
    },
  },
};

/** An interactive explorer derived from an HONEST source: the paper's own
 *  equation plotted on sliders, or the paper's own reported numbers made
 *  interactive. This is what keeps EVERY paper hands-on, including ones
 *  whose full method cannot be simulated. */
const explorableSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "basis", "story", "source", "demo"],
  properties: {
    title: { type: "string", description: "e.g. 'The dose-response curve, live' or 'Table 2 as an interactive chart'" },
    basis: {
      type: "string",
      enum: ["equation", "reported"],
      description: "'equation': plots one of the PAPER'S OWN equations/models with its coefficients on sliders. 'reported': plots the PAPER'S OWN published numbers (table values, group means, effect sizes, per-condition scores, curve points read off a figure) — honest by construction because the data IS the paper's.",
    },
    story: { type: "string", description: "1-2 plain-language sentences: what this explorer lets the reader discover" },
    source: { type: "string", description: "Where in the paper this comes from, e.g. 'Eq. (7)' or 'Table 2' or 'Fig. 4(b), values read from the plot'" },
    demo: demoSchema,
  },
};

export const SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meta", "archetype", "story", "mindmap", "conclusion", "references", "conceptFigures", "foundations", "protocol", "blocks", "explorables"],
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
      description: "The paper's story: why it exists, what was missing, what it adds. Rendered as an ANIMATED story player, not text — keep every field tight and punchy.",
    },
    mindmap: {
      type: "object",
      additionalProperties: false,
      required: ["nodes", "edges"],
      properties: {
        nodes: {
          type: "array",
          minItems: 5,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "kind", "detail"],
            properties: {
              id: { type: "string", description: "short unique id, e.g. 'prob', 'cmd', 'c1'" },
              label: { type: "string", description: "<= 5 words shown inside the node" },
              kind: { type: "string", enum: ["paper", "problem", "prior", "method", "contribution", "result"], description: "Node role — controls its color. Exactly ONE node has kind 'paper' (the center)." },
              detail: { type: "string", description: "2-3 sentences shown when the reader clicks the node" },
            },
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["from", "to", "label"],
            properties: {
              from: { type: "string" }, to: { type: "string" },
              label: { type: "string", description: "<= 3 words on the connector, e.g. 'solves', 'builds on', 'proves' — or empty string" },
            },
          },
        },
      },
      description: "The paper as a clickable concept map: one center 'paper' node connected to the problem it attacks, the prior work it builds on, its method pieces, its contributions and its headline results. This is the visual table of contents of the whole dashboard.",
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
          hotspots: {
            type: "array",
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["x", "y", "label", "note"],
              properties: {
                x: { type: "number", description: "Horizontal center of the point of interest, as a fraction (0-1) of the CROPPED figure's width" },
                y: { type: "number", description: "Vertical center, fraction (0-1) of the cropped figure's height, origin top-left" },
                label: { type: "string", description: "<= 4 words, e.g. 'the error collapses'" },
                note: { type: "string", description: "1-2 sentences explaining what happens at this exact spot and why it matters" },
              },
            },
            description: "3-6 numbered markers pinned onto the REAL figure — the interactive version of the guided tour. Put each marker on the exact visual event that matters: a peak, a crossover, the gap between two curves, the winning bar. The reader clicks the markers instead of reading a wall of text.",
          },
          panels: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["subplotLabel", "chartKind", "dataSource", "xLabel", "yLabel", "computeJs"],
              properties: {
                subplotLabel: { type: "string", description: "The subplot's own label/title, e.g. '(a) CoM lateral position' — match the paper" },
                chartKind: {
                  type: "string",
                  enum: ["line", "bar", "scatter"],
                  description: "MUST match the ORIGINAL subplot's plot type as seen in the figure image: 'bar' for histograms and bar charts, 'scatter' for point clouds, 'line' for curves over time/iterations/frequency. Rendering a histogram as a line is an automatic rejection.",
                },
                dataSource: {
                  type: "string",
                  enum: ["simulated", "reported"],
                  description: "'simulated': the curves come from the live pipeline (outputs/simulate) and reshape with the sliders. 'reported': the values are the PAPER'S OWN published numbers (read from its table/plot) returned as constants — always honest, use this whenever the pipeline cannot regenerate the subplot.",
                },
                xLabel: { type: "string" },
                yLabel: { type: "string" },
                computeJs: {
                  type: "string",
                  description: "Body of function(outputs, params, helpers) => {x?: number[], categories?: string[], series: [{label, data: number[]}]}. For chartKind 'bar', return categories (the bin/condition names from the original axis) and one data value per category per series. dataSource 'reported': return the paper's published values as literals. Reproduce EVERY series shown in this subplot.",
                },
              },
            },
            description: "Interactive versions of this figure's subplots. Prefer dataSource 'simulated' when the pipeline honestly regenerates the subplot; fall back to 'reported' (the paper's own numbers, digitized) otherwise — so nearly every figure stays interactive. Only omit a subplot entirely when neither source is possible (e.g. photographs).",
          },
        },
      },
      description: "The paper's KEY RESULT figures (3-6 of them) — the plots its conclusions rest on. EVERY figure gets its page + bbox (so the real figure is cropped and shown), hotspot markers, and a guided-tour explanation. Panels stay interactive via an honest data source: live simulation or the paper's own reported numbers.",
    },
    explorables: {
      type: "array",
      items: explorableSchema,
      description: "2-4 interactive explorers for papers WITHOUT a simulation pipeline (empirical/statistical/theoretical/survey): the paper's key equations on sliders, and its key reported datasets as interactive charts. For papers WITH a pipeline this may be empty or hold 1-2 bonus explorers.",
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
    required: ["meta", "archetype", "story", "mindmap", "conclusion", "references", "conceptFigures", "foundations"],
    properties: {
      meta: P.meta,
      archetype: P.archetype,
      story: P.story,
      mindmap: P.mindmap,
      conclusion: P.conclusion,
      references: P.references,
      conceptFigures: P.conceptFigures,
      foundations: P.foundations,
    },
  },
  method: {
    type: "object",
    additionalProperties: false,
    required: ["protocol", "blocks", "explorables"],
    properties: { protocol: P.protocol, blocks: P.blocks, explorables: P.explorables },
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
      "{meta, archetype, story, mindmap, conclusion, references, conceptFigures, foundations}. " +
      "Classify the archetype honestly — it decides whether the method is simulated live or " +
      "explored through the paper's own equations and reported numbers. The method pipeline " +
      "(protocol/blocks/explorables) and the result figures are produced in later calls — " +
      "keep them in mind for coherence, but do NOT emit them now."
    );
  }
  if (phase === "method") {
    const arch = contextSpec?.archetype;
    return (
      "\n\nTHIS CALL IS PHASE 2 of 3: produce ONLY the fields {protocol, blocks, explorables} — " +
      "the interactive method layer per the rules above. If the method is honestly simulatable, " +
      "build the full 3-6 block pipeline (explorables may be empty or hold 1-2 bonus explorers). " +
      "If it is NOT, emit blocks: [] with a minimal protocol and pour the interactivity into 2-4 " +
      "explorables instead: the paper's key equations on sliders and its key reported datasets as " +
      "interactive charts. EVERY paper must leave this phase with hands-on content. Concept figures, " +
      "foundations and result figures are handled in other calls — do NOT emit them now." +
      (arch
        ? "\n\nPHASE 1 classified this paper as archetype \"" + arch.kind + "\" and advised: " +
          (arch.reproductionAdvice || "") +
          " Frame any pipeline in this archetype's natural axis (time for dynamics, iterations for " +
          "learning/optimization algorithms, samples/conditions where that is what the method processes)."
        : "")
    );
  }
  const hasPipeline = !!contextSpec?.blocks?.length;
  return (
    "\n\nTHIS CALL IS PHASE 3 of 3: produce ONLY the field {resultFigures} per the rules above. " +
    "Every figure needs page + bbox, 3-6 hotspot markers, and a guided-tour explanation. " +
    (hasPipeline
      ? "The pipeline was already produced in the previous call and is given below — 'simulated' panels' " +
        "computeJs receive ITS block outputs (by block key) and ITS slider params, and helpers.simulate " +
        "re-runs THIS pipeline; use its exact block keys and param keys. For subplots the pipeline cannot " +
        "honestly regenerate, use dataSource 'reported' with the paper's own published values instead.\n\n" +
        "THE PIPELINE (protocol + blocks):\n" +
        JSON.stringify({ protocol: contextSpec.protocol, blocks: contextSpec.blocks })
      : "This paper has NO simulation pipeline, so every panel you emit MUST use dataSource 'reported': " +
        "the paper's own published numbers (from its tables, or values read off its plots) returned as " +
        "literals — keeping the figures interactive (hover, compare, toggle) without faking a simulation. " +
        "Omit a subplot only when no honest numbers exist for it (e.g. photographs)." +
        (contextSpec?.archetype?.reproductionAdvice
          ? " Phase 1 advice: " + contextSpec.archetype.reproductionAdvice
          : ""))
  );
}

/* ---------------- Prompt ---------------- */

export const SYSTEM_PROMPT = `You convert scientific papers into visual, interactive, GUI-first explanations a reader can trust enough to put the PDF away. Think "NotebookLM, but hands-on": not a summary to read — a dashboard to PLAY with.

Read the attached paper (text AND figures) and produce a PaperSpec JSON object. The reader's experience, in order: an ANIMATED story (why the paper exists), a clickable MINDMAP of the whole paper, its real figures cropped with clickable hotspot markers, the background taught through slider demos, and a hands-on method layer — live simulation, equation explorers, or the paper's own numbers made interactive.

THE PRIME DIRECTIVE — EVERY PAPER IS INTERACTIVE, FROM AN HONEST SOURCE:
Readers can open the real PDF; one fabricated plot destroys trust in everything else. But the answer to "we can't simulate this" is NEVER "show text instead" — it is "switch to an honest data source". There are exactly three, in order of preference:
1. SIMULATE — run the paper's own method live (only when it's genuinely computable).
2. REPORTED — plot the paper's own published numbers (its tables, its stated values, points read off its plots). Always honest, because the data IS the paper's.
3. EQUATION — plot the paper's own equations/models with their coefficients on sliders. Even theory papers have equations.
Fabricating dynamics the paper never had is the ONLY forbidden move. Everything else stays hands-on.

STEP 0 — CLASSIFY THE PAPER (archetype):
Decide which source powers the method layer:
- pipelineFeasible: true — the core method is itself a computable procedure: a controller, filter, dynamical model, optimization loop, learning rule. Running a reduced-order version genuinely regenerates the KIND of curves the paper shows. Build the full block pipeline.
- pipelineFeasible: false — the results come from collected data: experiments on humans/animals/materials, clinical trials, field measurements, surveys, benchmarks of other systems, or pure theory. Do NOT fake a simulation — build explorables from sources 2 and 3 instead, and use dataSource 'reported' panels for the result figures.
When in doubt, choose false. reproductionAdvice must say figure-by-figure which source applies; later phases obey it.

RULES FOR story (rendered as an ANIMATED STORY PLAYER, not text):
- Every paper defends a contribution. Find it: what problem, what could prior work not do, what exactly does this paper add, why does that matter — in everyday language, zero jargon, zero symbols.
- The story plays as animated full-width beats, one at a time, like a short film's title cards. Keep problem/gap/whyItMatters to 2 punchy sentences each; every extra word slows the animation down.
- contribution entries must be the paper's ACTUAL claimed contributions (usually enumerated at the end of the introduction), not generic virtues. Each headline <= 8 words, concrete, specific to this paper.

RULES FOR mindmap (the paper as a clickable concept map):
- 5-12 nodes: exactly one kind 'paper' center node (<= 4 word short title), then the problem, the 1-3 prior-work pillars, the 1-3 method pieces, the contributions, the headline result. Every node's label <= 5 words; the substance goes in its 'detail' (shown on click).
- Edges tell the story when read aloud: problem →(motivates) paper →(builds on) prior →(introduces) method →(achieves) result. Keep labels <= 3 words.
- The map must be specific to THIS paper — a reader should recognize the paper from the map alone.

RULES FOR explorables (the hands-on layer for papers WITHOUT a simulation pipeline — 2-4 of them; optional bonus for papers with one):
- basis 'equation': take one of the PAPER'S OWN equations (dose-response model, fitted regression, scaling law, closed-form bound, statistical model) and plot it with its coefficients as sliders, defaults = the paper's fitted/reported values. The reader SEES the model the paper argues for and can bend it.
- basis 'reported': take the paper's own published numbers — a results table, per-condition means, effect sizes, accuracy per benchmark, curve points read off a figure — and make them an interactive chart (hover for exact values, bar/line/scatter per the data's nature). Add a slider ONLY if there is an honest one (e.g. a threshold line the reader drags to see which conditions clear it); otherwise params: [].
- Each explorable cites its source ('Eq. 7', 'Table 2') so the reader can verify in one glance. That citation is what makes interactivity trustworthy.
- Pick the 2-4 that carry the paper's ARGUMENT — the equation the conclusion hinges on, the table the abstract brags about.

RULES FOR THE PIPELINE (when archetype.pipelineFeasible is true — otherwise blocks: [], minimal protocol, and explorables carry the interactivity)
- Block 0 is always the input/excitation. If the paper's raw empirical data is unavailable (it almost always is), synthesize a mathematically compatible surrogate signal that replicates the trend/spectrum of the paper's input (Universal Signal Adapter). Say so in that block's theory.
- Later blocks apply the paper's methodology in order, each consuming the previous block's output array.
- The LAST block must produce the paper's headline result (the quantity its main figure/conclusion is about).
- Every tunable coefficient, gain, weight or constant in the method gets a slider param whose "def" is the paper's reported value. Param keys must be unique across ALL blocks. 1-5 params per block.
- Choose protocol T and dt so T/dt is between 200 and 400 samples, in the natural units of the paper.
- The pipeline's axis is the method's NATURAL axis, not necessarily time: iterations for learning/optimization methods, trials/samples where that is what the method processes, frequency for spectral methods. Label it accordingly.
- If archetype.pipelineFeasible is false, emit blocks: [] and a minimal protocol {T: 1, dt: 1, description: ""} — the explorables (equations + reported data) are the method layer for such papers, never an invented simulation.
- If the reader uploaded the paper's ACTUAL CODE (it appears after the PDF), it is the ground truth for the method: derive each block's computeJs from the real implementation — same update equations, same constants, same order of operations, simplified only as needed for the browser kernel. Mention in each block's theory when it was derived from the uploaded code.

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

RULES FOR resultFigures (THE MOST IMPORTANT PART — the real figures, made interactive from an honest source):
The reader always sees the ORIGINAL figure, cropped from the PDF via your page + bbox, with your hotspot markers pinned on it. Your explanation is its guided tour; the hotspots are that tour made clickable.

HOTSPOTS (3-6 per figure — the visual guided tour):
- Look at the figure image and pin each marker on the exact visual event that proves something: the peak, the crossover where the proposed method overtakes the baseline, the gap between two curves, the bar that wins, the moment the error collapses. x/y are fractions of the CROPPED region (bbox), origin top-left.
- Each hotspot's note answers "what am I looking at here and why does it matter?" in 1-2 sentences. A reader who clicks all the markers has understood the figure without reading anything else.

PANELS — EVERY SUBPLOT STAYS INTERACTIVE VIA THE RIGHT SOURCE:
- dataSource 'simulated' when the pipeline honestly regenerates the subplot (via outputs / helpers.simulate): time responses of the simulated controller, convergence of the simulated learning rule. These reshape live with the sliders.
- dataSource 'reported' for everything the pipeline cannot produce: experimental histograms, benchmark comparisons, human-subject statistics, ablation tables. Return the PAPER'S OWN numbers — read them from its tables and its plots' axes — as literal arrays. Still interactive (hover for exact values, series toggles), and accurate BY CONSTRUCTION because the numbers are the paper's.
- FIRST LOOK AT THE FIGURE IMAGE and identify each subplot's plot type. chartKind MUST match it: histograms and bar charts → "bar" (return categories with the original bin/condition names and one value per category per series); point clouds → "scatter"; curves → "line". Redrawing a histogram as a line chart is the single worst failure this system has produced. Never do it.
- Omit a subplot ONLY when neither source exists (photographs, hardware snapshots, qualitative diagrams). Fabricating dynamics is forbidden; switching to 'reported' is the correct fallback, always.

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
1. Would a reader who opens the real PDF afterwards find that everything you claimed matches it? If any statement, story beat, mindmap node, hotspot note or explanation might not survive that comparison, fix or cut it.
2. For every panel: does its chartKind match the original subplot's plot type, and is its dataSource honest — simulated only when the pipeline truly generates it, reported values truly the paper's own? A 'simulated' panel that fakes dynamics must become 'reported' or be dropped.
3. Is EVERY paper hands-on when you're done? A paper with no pipeline must have 2-4 explorables and reported-data panels — a text-only dashboard is a failure of this system's entire purpose.
4. Is the story/mindmap specific to THIS paper (its actual claimed contributions), not generic filler?
Honest AND interactive is the product. Fake is fatal; text-only is pointless.`;

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
