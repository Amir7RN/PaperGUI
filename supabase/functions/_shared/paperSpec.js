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

/** Traceability stamp shown ON a plot/equation: which figure/equation/section
 *  of the paper it comes from. Ungrounded plots in the Background & Model
 *  sections were THE thing paper authors rejected, so this is now first-class. */
const provenanceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    figure: { type: "string", description: "The paper's figure this derives from, e.g. 'FIG. 2' or 'Fig. 4(d)'. Empty if none." },
    equation: { type: "string", description: "The paper's equation this derives from, e.g. 'Eq. (3)' or 'Eqs. (1)–(2)'. Empty if none." },
    section: { type: "string", description: "The paper section, e.g. 'Sec. II.A' or 'Introduction'. Empty if none." },
  },
  description: "Where in the paper this element comes from. At least one field must be non-empty.",
};

/** A reference to a REAL figure region in the PDF (same page+bbox mechanism as
 *  result figures). The client crops it and fills `image` — so a Background
 *  concept or a Model equation can show the paper's OWN figure beside the live
 *  plot, which is what makes these sections read as faithful, not invented. */
const figureRefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["page", "bbox", "label", "caption"],
  properties: {
    page: { type: "integer", description: "1-indexed PDF page where the figure appears" },
    bbox: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "w", "h"],
      properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
      description: "Fractional bounding box (0-1, top-left origin) of the figure/panel on its page.",
    },
    label: { type: "string", description: "Short label, e.g. 'FIG. 2(a) — power vs LED bias'" },
    caption: { type: "string", description: "1-2 sentences tying this real figure to the concept/equation and to the live plot beside it." },
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
    xLabel: { type: "string", description: "MANDATORY quantity + unit, e.g. 'LED voltage (V)', 'iteration', 'frequency (Hz)'. If the axis is logarithmic, say so in the label: 'log₁₀ power density (W/m²)'. A bare word without a unit is a rejection." },
    yLabel: { type: "string", description: "Same rules as xLabel: quantity + unit, log scales named as log₁₀. These labels are drawn ON the chart's axes." },
    caption: { type: "string", description: "One inviting sentence telling the reader what to try, e.g. 'drag the learning rate and watch the error die out'" },
    params: { type: "array", items: paramSchema, description: "0-3 sliders (0 only for reported-data charts with nothing honest to vary)" },
    computeJs: {
      type: "string",
      description: "Body of function(params, helpers). chart kind: return {x?: number[], categories?: string[] (bar), series: [{label, data: number[]}]} (1-4 series, same length, x defaults to helpers.t). frames kind: return {frames: [{grid: number[][] (<=10x10), note: string}]} with 4-25 frames showing the idea converging step by step. Only Math + helpers {n,dt,t,T,noise,clamp,step}. Deterministic.",
    },
    insightJs: {
      type: "string",
      description: "OPTIONAL but strongly encouraged for demos with sliders: body of function(params, result, helpers) => string — ONE plain-language sentence, computed from the CURRENT slider values (and optionally the computed result.series), stating what the reader is seeing and tying it to the paper's own numbers (e.g. 'At Γ=0.4 the repeating error falls 90% in 5 cycles — the paper's per-joint law does this at every joint'). This line is what turns a slider toy into a lesson. Include concrete computed numbers.",
    },
    provenance: provenanceSchema,
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

/** "The physics & the model" section — the methodology at the depth authors
 *  expect: experiment vs simulation, the real toolchain, the governing
 *  equations term by term, the assumptions, and how results were validated.
 *  Added after author feedback that this exact information was missing. */
const modelSchema = {
  type: "object",
  additionalProperties: false,
  required: ["approach", "summary", "toolchain", "equations", "assumptions", "validation"],
  properties: {
    approach: {
      type: "string",
      enum: ["experiment", "simulation", "hybrid"],
      description: "Is this an experimental study, a computational/theory study, or both? Decide from the methods section, not the abstract.",
    },
    summary: {
      type: "string",
      description: "3-5 sentences: what the authors actually DID, methodologically — what was measured or computed, with what, and how the pieces connect. Written for a reader asking 'was this simulation or experiment, and how does it work?'",
    },
    toolchain: {
      type: "array",
      minItems: 2,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role"],
        properties: {
          name: { type: "string", description: "The instrument, software package, algorithm or formalism, AS THE PAPER NAMES IT (e.g. 'LAMMPS', '3ω method', 'scattering-matrix optics', 'COMSOL'). If the paper names no software, name the mathematical machinery instead. NEVER invent a tool the paper doesn't mention." },
          role: { type: "string", description: "1-2 sentences: what this tool did in THIS study, with the paper's own key numbers/settings where given (sample counts, timesteps, temperatures, calibration values)." },
        },
      },
      description: "The actual instruments and software behind the results — the 'Python or MATLAB? what machine?' answer authors look for first.",
    },
    equations: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "eq", "source", "plain", "terms"],
        properties: {
          name: { type: "string", description: "Short handle, e.g. 'Landauer heat current'" },
          eq: { type: "string", description: "The governing equation in plain unicode math (no LaTeX), faithful to the paper's own form" },
          source: { type: "string", description: "Where it lives in the paper, e.g. 'Eq. (3), Sec. II.A' or 'Methods, transport model'" },
          plain: { type: "string", description: "2-4 sentences explaining what the equation says and why it matters to this paper's argument — plain language first" },
          terms: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sym", "meaning"],
              properties: {
                sym: { type: "string", description: "The symbol, e.g. 'τ(ω)'" },
                meaning: { type: "string", description: "What it is, its unit if any, and which knob/quantity of the paper it corresponds to" },
              },
            },
            description: "Term-by-term glossary — the reader hovers each symbol instead of guessing",
          },
          provenance: provenanceSchema,
          figure: figureRefSchema,
        },
      },
      description: "The 1-4 GOVERNING equations the method rests on, each with a term glossary. Papers with no explicit equations (pure surveys): give the field's canonical relation the paper reasons with. Where an equation directly produces a paper figure, attach that figure (page+bbox) so the reader sees the real result the math yields.",
    },
    assumptions: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: { type: "string" },
      description: "The assumptions the results rest on, one sentence each, from the paper's own caveats/methods (idealizations, boundary conditions, data-selection criteria, model reductions).",
    },
    validation: {
      type: "string",
      description: "2-4 sentences: how the authors checked their method — cross-validation against prior results, control experiments, convergence tests, error budgets. Empty string ONLY if the paper truly reports none.",
    },
    takeaways: {
      type: "array",
      maxItems: 4,
      items: { type: "string" },
      description: "OPTIONAL 2-4 one-line 'if you remember nothing else' points about the methodology — the learn layer beside the equations.",
    },
    glossary: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sym", "meaning"],
        properties: { sym: { type: "string" }, meaning: { type: "string" } },
      },
      description: "OPTIONAL cross-equation symbol glossary for the whole model section.",
    },
    material: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "url"],
        properties: { label: { type: "string" }, url: { type: "string" } },
      },
      description: "OPTIONAL links to useful external material (the paper's DOI, a canonical reference/textbook) — only real, well-known URLs; never invent a link.",
    },
  },
};

/** The narrated 'explainer video' script for sections 4 (foundations) & 5
 *  (model). Scenes are read aloud (OpenAI TTS, client-side) over the paper's
 *  own figures/equations — a self-contained tutorial with no external service. */
const explainerSectionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scenes"],
  properties: {
    voice: { type: "string", enum: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"], description: "TTS voice; default 'onyx'." },
    scenes: {
      type: "array",
      minItems: 3,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["caption", "narration", "visual"],
        properties: {
          caption: { type: "string", description: "Short on-screen title for the scene, e.g. 'The LED as a photon pump'." },
          narration: { type: "string", description: "2-3 sentences READ ALOUD. Spoken style, plain language, spell tricky symbols phonetically (e.g. 'exp of q V over k T'). <= 460 chars." },
          visual: {
            type: "object",
            additionalProperties: false,
            required: ["type"],
            properties: {
              type: { type: "string", enum: ["intro", "figure", "demo", "equation", "validation"], description: "What fills the stage: a title card (intro/validation), the paper's real figure, a live foundation demo, or a governing equation." },
              foundationIdx: { type: "integer", description: "For type 'demo' or 'figure' in the foundations explainer: index into foundations[]." },
              equationIdx: { type: "integer", description: "For type 'equation': index into model.equations[]." },
              image: { type: "string", description: "Leave empty — the client fills figure images from the referenced foundation/equation." },
              label: { type: "string", description: "For type 'figure': the figure label to show." },
            },
          },
        },
      },
    },
  },
};

const explainerSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    foundations: explainerSectionSchema,
    model: explainerSectionSchema,
  },
  description: "OPTIONAL narrated walkthroughs for the Background (foundations) and Model sections. If omitted, the client synthesizes one from the section content.",
};

export const SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meta", "archetype", "story", "mindmap", "conclusion", "references", "conceptFigures", "foundations", "model", "protocol", "blocks", "explorables"],
  properties: {
    model: modelSchema,
    explainer: explainerSchema,
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
      required: ["title", "authors", "venue", "abstract", "field"],
      properties: {
        title:    { type: "string" },
        authors:  { type: "string" },
        venue:    { type: "string", description: "Journal/conference + year if identifiable, else empty string" },
        abstract: { type: "string", description: "The paper's abstract, condensed to <= 120 words" },
        field: {
          type: "string",
          enum: [
            "medicine-clinical", "biology-life-sciences", "genomics-omics",
            "epidemiology-public-health", "neuroscience", "psychology-behavioral",
            "economics-finance", "policy-social-science", "physics", "chemistry-materials",
            "engineering-control-signals", "engineering-mechanical-fluids", "electrical-engineering",
            "computer-science-ML", "earth-climate", "mathematics-statistics", "other",
          ],
          description: "The paper's primary discipline — decides which figure families to expect and how to read them (a clinician reads censoring on a survival curve; a geneticist reads the FDR line on a volcano plot). Pick the closest.",
        },
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
            description: "4-8 sentences a newcomer can follow — and it must DISCUSS THE PHYSICS/MECHANISM, not just describe the picture: why the design works, what law or effect each panel exploits, how to read any log axis or colour scale, and what changed vs. the conventional approach. Authors judge this section by whether it explains their idea BETTER than their own caption did.",
          },
          svg: {
            type: "string",
            description: "OPTIONAL, for the paper's MAIN method/pipeline/architecture diagram only (max one per paper): a complete inline <svg> that REBUILDS the diagram as a clean ANIMATED flow chart (viewBox ~720x300, system-ui fonts, boxes+arrows with staggered fade-in via a scoped <style> whose selectors are all prefixed by a unique svg id, dashed 'flow' lines animated by stroke-dashoffset, the final output node gently pulsing, and a @media (prefers-reduced-motion: reduce) block disabling all animation). Every label must come from the paper. When provided, this animated rebuild is shown INSTEAD of the flat page crop, so it must be self-sufficient and accurate.",
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
      description: "The figures that deliver the paper's IDEA (NOT results plots) — usually 2-4. Papers rarely put the whole idea in one figure: include the setup/architecture figure AND the figure(s) showing the mechanism at work (a key trace, a spectral comparison, the theory fingerprint). A rich figure may appear twice with two different readings (e.g. once for the device stack, once for its spectral payoff).",
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
          provenance: provenanceSchema,
          figure: figureRefSchema,
          takeaways: {
            type: "array",
            maxItems: 4,
            items: { type: "string" },
            description: "OPTIONAL 2-3 one-line takeaways for this concept — the learn layer beside the demo.",
          },
        },
      },
      description: "The 2-4 core ideas the paper BORROWS from prior work — the 'wheels' it doesn't reinvent but the reader must understand (e.g. the base dynamics model, the classic control/learning principle, the standard optimization formulation). Whenever the paper HAS a figure illustrating a concept, attach it (page+bbox) as `figure` so the live demo sits next to the paper's own picture — the fix for authors finding these plots invented.",
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
          digitizeHint: {
            type: "object",
            additionalProperties: false,
            required: ["xTicks", "yTicks"],
            properties: {
              xLabel: { type: "string", description: "The x-axis label/units, verbatim from the figure" },
              yLabel: { type: "string", description: "The y-axis label/units, verbatim from the figure" },
              xLog: { type: "boolean", description: "true if the x-axis is logarithmic (decade ticks)" },
              yLog: { type: "boolean", description: "true if the y-axis is logarithmic" },
              xTicks: {
                type: "array", minItems: 2, maxItems: 8,
                items: {
                  type: "object", additionalProperties: false, required: ["atFrac", "value"],
                  properties: {
                    atFrac: { type: "number", description: "Where this x tick sits as a fraction (0-1) of the FIGURE'S OWN width (its bbox), left→right" },
                    value: { type: "number", description: "The numeric value printed at that x tick" },
                  },
                },
                description: "The labelled x-axis ticks: at least the two end ticks, in order. Read the printed tick numbers and their positions — you are reliable at reading axis text, so this seeds an accurate pixel→data calibration.",
              },
              yTicks: {
                type: "array", minItems: 2, maxItems: 8,
                items: {
                  type: "object", additionalProperties: false, required: ["atFrac", "value"],
                  properties: {
                    atFrac: { type: "number", description: "Where this y tick sits as a fraction (0-1) of the FIGURE'S OWN height (its bbox), top→bottom" },
                    value: { type: "number", description: "The numeric value printed at that y tick" },
                  },
                },
                description: "The labelled y-axis ticks: at least the two end ticks, top→bottom order.",
              },
              curves: {
                type: "array", maxItems: 6,
                items: {
                  type: "object", additionalProperties: false, required: ["label", "colorHex"],
                  properties: {
                    label: { type: "string", description: "What this plotted line/series is (from the legend), e.g. 'proposed', 'baseline'" },
                    colorHex: { type: "string", description: "The curve's colour as #rrggbb, read off the figure — used to auto-trace it" },
                  },
                },
                description: "One entry per plotted curve in the subplot, with its legend label and its colour. This lets the digitizer auto-extract each curve. Do NOT estimate the curve's data values — only its colour; the digitizer reads the real values from the pixels.",
              },
            },
            description: "Axis-calibration seed for the plot digitizer: the labelled ticks (positions + values) and each curve's colour. Provide this for every figure that is a QUANTITATIVE plot (line/scatter/bar) with readable numeric axes — it lets the reader (or an owner) trace the figure's real curve into accurate, interactive data. Omit for photographs, diagrams, and qualitative panels. You supply the axes and colours; you must NOT supply the curve data itself.",
          },
          panels: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["subplotLabel", "figureFamily", "confidence", "reproduce", "chartKind", "dataSource", "xLabel", "yLabel", "computeJs"],
              properties: {
                subplotLabel: { type: "string", description: "The subplot's own label/title, e.g. '(a) CoM lateral position' — match the paper" },
                figureFamily: {
                  type: "string",
                  enum: [
                    "line", "bar", "groupedBar", "scatter", "box", "violin", "heatmap",
                    "stackedBar", "stackedBarH", "radar", "radialBar",
                    "kaplanMeier", "forest", "pie", "stackedArea", "volcano", "manhattan",
                    "roc", "ecdf", "qq", "contour", "quiver", "sankey", "choropleth",
                    "network", "tree", "dendrogram", "sem", "ternary", "slope", "waterfall",
                    "blandAltman", "funnel", "bode", "polar", "surface3d",
                    "image", "schematic", "other",
                  ],
                  description: "STEP 1 — classify this subplot's chart family by LOOKING AT IT, from this exact list. RENDERABLE families (reproduce these): line, bar, groupedBar, scatter, box, violin, heatmap, stackedBar, stackedBarH, radar, radialBar, and kaplanMeier (survival step plots — via the `km` carrier). Everything else is either NOT YET renderable (forest, pie, stackedArea, volcano, manhattan, roc, ecdf, qq, contour, quiver, sankey, choropleth, network, tree, dendrogram, sem, ternary, slope, waterfall, blandAltman, funnel, bode, polar, surface3d) or must never be reproduced (image = micrograph/gel/photo/MRI, schematic = diagram). Classify HONESTLY — a box is 'box', never 'bar'; a survival staircase is 'kaplanMeier', never 'line'. This drives whether the subplot is reproduced or shown as the original only.",
                },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                  description: "How sure you are of BOTH the family classification AND that you can reproduce this subplot faithfully (right chart family, every series, honest values). 'low' whenever the figure is small/ambiguous, the axes are unreadable, or you'd be guessing values.",
                },
                reproduce: {
                  type: "boolean",
                  description: "STEP 2 — the honest-degrade decision. Set TRUE only when figureFamily is one of the 11 renderable families AND confidence is high/medium AND you have an honest data source (simulated or the paper's own reported numbers). Set FALSE for any not-yet-renderable or image/schematic family, for confidence 'low', or when no honest values exist. When FALSE you emit NO chart — the reader still sees the real cropped figure with its hotspots and guided tour, and you set degradeReason. NEVER draw a wrong-family chart to avoid a FALSE: a faithful original beats a fabricated reproduction, always.",
                },
                degradeReason: {
                  type: "string",
                  description: "REQUIRED when reproduce is false: one plain sentence the reader sees, e.g. 'This is a Kaplan–Meier survival curve — shown as the paper's own figure; the interactive version isn't available yet.' or 'The axis values are too small to read reliably, so this is shown as the original.' Empty string when reproduce is true.",
                },
                predict: {
                  type: "object",
                  additionalProperties: false,
                  required: ["prompt", "options", "answerIdx", "insight"],
                  properties: {
                    prompt: { type: "string", description: "A single prediction question the reader answers BEFORE the chart is revealed — a retrieval-practice hook. Make it about a RELATIONSHIP or a WHAT-IF they must reason about, not something readable straight off the static figure: e.g. 'If you doubled the controller gain Kₚ, what happens to the overshoot?' or 'Which arm has better 2-year survival, and why?' Tie it to this subplot's real behaviour." },
                    options: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" }, description: "2-4 short answer choices, exactly one correct. Distractors must be plausible common misconceptions, not obviously wrong." },
                    answerIdx: { type: "integer", description: "0-based index of the correct option." },
                    insight: { type: "string", description: "1-2 sentences shown AFTER the reader answers: why the correct answer is right, tied to the paper's own numbers/mechanism. This is the teaching moment." },
                  },
                  description: "OPTIONAL predict-then-reveal quiz for this reproduced panel (skip it for reproduce:false panels). Add it to the 1-3 most instructive quantitative panels — the ones where guessing first, then seeing the curve/behaviour, teaches the paper's key relationship. Do NOT add it to every panel; pick the ones worth a pause.",
                },
                chartKind: {
                  type: "string",
                  enum: ["line", "bar", "scatter"],
                  description: "The x-y fallback family only, for subplots that ARE a plain line/bar/scatter: 'bar' for simple bar/histogram charts, 'scatter' for point clouds, 'line' for curves over time/iterations/frequency. If the subplot is a box, violin, stacked bar (vertical or horizontal), heatmap, radar or polar bar, you MUST instead fill the `digitized` object (its kind renders) and just set this to the nearest of line/bar/scatter for validity. Rendering a box/violin/stacked figure as a plain bar or line is an automatic rejection.",
                },
                dataSource: {
                  type: "string",
                  enum: ["simulated", "reported"],
                  description: "'simulated': the curves come from the live pipeline (outputs/simulate) and reshape with the sliders. 'reported': the values are the PAPER'S OWN published numbers (read from its table/plot) returned as constants — always honest, use this whenever the pipeline cannot regenerate the subplot.",
                },
                xLabel: { type: "string", description: "Quantity + unit exactly as the original subplot's axis reads, e.g. 'LED voltage (V)'. Log axes must say log₁₀ in the label." },
                yLabel: { type: "string", description: "Same rules: quantity + unit from the original axis, log scales named as log₁₀." },
                computeJs: {
                  type: "string",
                  description: "Body of function(outputs, params, helpers) => {x?: number[], categories?: string[], series: [{label, data: number[]}]}. For chartKind 'bar', return categories (the bin/condition names from the original axis) and one data value per category per series. dataSource 'reported': return the paper's published values as literals. Reproduce EVERY series shown in this subplot. When `digitized` is provided instead, set this to the empty string.",
                },
                digitized: {
                  type: "object",
                  additionalProperties: false,
                  required: ["kind", "source"],
                  properties: {
                    kind: { type: "string", enum: ["groupedBar", "stackedBar", "stackedBarH", "heatmap", "radar", "scatter", "radialBar", "box", "violin", "kaplanMeier"], description: "Chart family MATCHING THE ORIGINAL subplot exactly: kaplanMeier = a survival/time-to-event step plot (staircase curves falling from 1, censor ticks, sometimes a shaded CI band and a numbers-at-risk table) — fill the `km` carrier, NEVER redraw it as a line; groupedBar = vertical bar clusters; stackedBar = VERTICAL stacked bars (segments stack UP per x category — capacity/generation/cost stacks); stackedBarH = HORIZONTAL stacked bars (bars run left→right — never rotate a horizontal figure vertical or vice-versa); heatmap = colour-coded grid; radar = spider chart; scatter = embedding/point cloud; radialBar = circular/polar bar sectors; box = box-and-whisker (five-number summaries, one or more boxes per category); violin = density-outline distributions (one or more, possibly overlapping, per category). A subplot of boxes is NEVER a bar chart; a subplot of violins is NEVER a bar chart; stacked segments are NEVER redrawn as side-by-side groups." },
                    source: { type: "string", description: "Where these values come from in the paper (table / figure / supplementary data)" },
                    groups: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "bars"], properties: { name: { type: "string" }, bars: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "number" }, err: { type: "number", description: "optional ± error whisker" }, hatch: { type: "boolean", description: "hatched variant (e.g. the original's low-speed bars)" } } } } } }, description: "For groupedBar/radialBar" },
                    rows: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "segments"], properties: { name: { type: "string" }, segments: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "number" } } } } } }, description: "For stackedBarH — rows in the ORIGINAL's top-to-bottom order" },
                    subPanels: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "groups"], properties: { name: { type: "string", description: "sub-panel label, e.g. '80%' / '95%' — empty string if the figure is a single stacked panel" }, groups: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "segments"], properties: { name: { type: "string", description: "the x-category, e.g. a scenario name" }, segments: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string", description: "stack segment name from the legend, bottom→top order" }, value: { type: "number" } } } } } } }, refLines: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "number" }, color: { type: "string" } } }, description: "dashed baselines in THIS sub-panel (e.g. '2021 Capacity: 30 GW')" } } }, description: "For stackedBar — one or more vertical-stacked panels shown side by side (e.g. an 80% and a 95% variant). Keep the paper's x-category order and the bottom→top stack order; carry per-panel refLines." },
                    categories: { type: "array", items: { type: "object", additionalProperties: false, required: ["name"], properties: {
                      name: { type: "string", description: "the x-category label (e.g. a scenario / condition)" },
                      boxes: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "min", "q1", "med", "q3", "max"], properties: { label: { type: "string", description: "series name (e.g. 'gas demand'); empty string if the category has a single unlabeled box" }, min: { type: "number", description: "lower whisker" }, q1: { type: "number" }, med: { type: "number" }, q3: { type: "number" }, max: { type: "number", description: "upper whisker" }, color: { type: "string" } } }, description: "For box: the 1+ boxes drawn in this category, side by side (two colours = two series, e.g. gas + power). Read the five-number summary off the box: whisker ends = min/max, box ends = Q1/Q3, the line = median." },
                      points: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "number" }, color: { type: "string" } } }, description: "For box: extra dot markers drawn on the category (e.g. the purple 'average' points above each box)." },
                      violins: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "dist"], properties: { label: { type: "string", description: "series name (e.g. 'summer'); empty string if single" }, color: { type: "string" }, dist: { type: "array", minItems: 3, items: { type: "object", additionalProperties: false, required: ["y", "w"], properties: { y: { type: "number", description: "a value on the y axis" }, w: { type: "number", description: "the violin's HALF-WIDTH there as a fraction 0..1 of the max — trace the outline: narrow at the tails, widest at the dense middle" } } } } } }, description: "For violin: the 1+ density outlines drawn in this category (two = overlapping series, e.g. summer + winter). Sample dist bottom→top from the outline shape." },
                    } }, description: "For box / violin: one entry per x category, each carrying its boxes (five-number summaries) and/or violins (density outlines) plus optional dot markers. This is the fidelity path that keeps distribution figures as boxes/violins instead of bars." },
                    km: {
                      type: "object",
                      additionalProperties: false,
                      required: ["groups"],
                      properties: {
                        yAsPercent: { type: "boolean", description: "true if the y-axis is survival PERCENT (0–100) rather than probability (0–1). Match the original's steps values to this." },
                        pValue: { type: "string", description: "The log-rank / comparison annotation as printed, e.g. 'log-rank p < 0.001' or 'HR 0.62 (95% CI 0.48–0.79)'. Empty string if none." },
                        timeUnit: { type: "string", description: "The x-axis time unit as printed, e.g. 'months', 'years', 'days'." },
                        groups: {
                          type: "array", minItems: 1,
                          items: {
                            type: "object", additionalProperties: false, required: ["label", "steps"],
                            properties: {
                              label: { type: "string", description: "The arm/group name from the legend, e.g. 'Treatment' / 'Placebo'. Empty string if the plot has a single unlabeled curve." },
                              color: { type: "string", description: "#rrggbb read off the curve." },
                              steps: {
                                type: "array", minItems: 2,
                                items: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
                                description: "The staircase vertices as [time, survival] pairs, time increasing, survival NON-INCREASING (starts at 1.0 or 100 at t=0). Read the curve's plateau/drop points off the figure — the renderer draws the step-after staircase between them. 8–30 points captures a curve well.",
                              },
                              censors: { type: "array", items: { type: "number" }, description: "Optional censoring times (the small vertical ticks on the curve). Each is a time value; the renderer places the tick at the curve's height there." },
                              ci: {
                                type: "array",
                                items: { type: "array", minItems: 3, maxItems: 3, items: { type: "number" } },
                                description: "Optional confidence band as [time, lower, upper] triples (same time grid feel as steps). Renders as a translucent stepped ribbon.",
                              },
                              median: { type: "number", description: "Optional median survival time (where the curve crosses 0.5) as reported." },
                            },
                          },
                          description: "One entry per survival curve in the plot (2 for a two-arm trial). Keep the paper's colours and legend order.",
                        },
                        risk: {
                          type: "object", additionalProperties: false, required: ["times", "rows"],
                          properties: {
                            times: { type: "array", items: { type: "number" }, description: "The time points the numbers-at-risk table is printed at (x-axis ticks), left→right." },
                            rows: {
                              type: "array",
                              items: { type: "object", additionalProperties: false, required: ["label", "counts"], properties: {
                                label: { type: "string", description: "the arm name, matching a group label" },
                                counts: { type: "array", items: { type: "number" }, description: "n-at-risk at each `times` point, same length/order as times" },
                              } },
                            },
                          },
                          description: "Optional numbers-at-risk table printed under the axis — reproduce it verbatim when the figure shows one (clinicians read it as part of the figure).",
                        },
                      },
                      description: "For kaplanMeier: the survival curves' own values read off the figure. This is the fidelity path that keeps a survival plot a staircase (with censor ticks + risk table) instead of a smooth line.",
                    },
                    axes: { type: "array", items: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string" } } }, description: "For radar" },
                    series: { type: "array", items: { type: "object", additionalProperties: false, required: ["label"], properties: { label: { type: "string" }, values: { type: "array", items: { type: "number" }, description: "radar: one value per axis" }, points: { type: "array", items: { type: "array", items: { type: "number" } }, description: "scatter: [x,y] pairs (≤150 per series)" }, color: { type: "string", description: "#rrggbb from the original figure" }, marker: { type: "string", description: "scatter marker: dot | x | diamond" } } }, description: "For radar/scatter" },
                    grid: { type: "array", items: { type: "array", items: { type: "number" } }, description: "For heatmap: rows×cols of values (use null-free numbers; NaN cells not expressible — use the min value)" },
                    rowLabels: { type: "array", items: { type: "string" }, description: "heatmap row names" },
                    colLabels: { type: "array", items: { type: "string" }, description: "heatmap column names" },
                    min: { type: "number" }, max: { type: "number" },
                    palette: { type: "array", items: { type: "string" }, description: "heatmap colour stops low→high as #rrggbb, READ OFF THE ORIGINAL'S COLOUR BAR (e.g. red→yellow→green). Never substitute a different scale." },
                    colors: { type: "object", additionalProperties: true, description: "map of bar/segment label → #rrggbb matching the ORIGINAL figure's colours" },
                    refLines: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "number" }, color: { type: "string" } } }, description: "dashed baselines the original draws (e.g. 'Top-down: 3068')" },
                    unit: { type: "string" },
                  },
                  description: "REQUIRED whenever the ORIGINAL subplot is NOT a plain x-y line/scatter/simple-bar — i.e. box, violin, vertical stacked bar (stackedBar), horizontal stacked bar (stackedBarH), heatmap, radar, polar/radial bar, or a PCA/t-SNE scatter cloud. Carry the paper's OWN values in the matching structure so the client renders the SAME chart family, orientation and colours as the original; set the sibling computeJs to the empty string. This is the fidelity path — omitting it here and emitting a plain bar/line instead is the #1 rejected failure. Fill the field that matches `kind`: groups→groupedBar/radialBar; subPanels→stackedBar; rows→stackedBarH; categories→box/violin; grid→heatmap; axes+series→radar; series→scatter; km→kaplanMeier.",
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
    checkpoints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "question", "options", "answerIdx", "why"],
        properties: {
          section: {
            type: "string",
            enum: ["story", "foundations", "model", "method", "results"],
            description: "Which part of the walkthrough this question tests — so it appears as a checkpoint beside that section.",
          },
          question: { type: "string", description: "One active-recall question the reader answers to check they actually understood — favour 'why', 'what would happen if', and 'which claim does figure X support' over rote definitions. Specific to THIS paper." },
          options: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" }, description: "2-4 short answer choices, exactly one correct; distractors are plausible misconceptions." },
          answerIdx: { type: "integer", description: "0-based index of the correct option." },
          why: { type: "string", description: "One sentence explaining the correct answer, tied to the paper's own content — the feedback the reader learns from." },
        },
      },
      description: "6-10 active-recall checkpoint questions spread across the key sections (at least one each for story, model and results; add foundations/method where they carry weight). These turn a passive read into retrieval practice — the single strongest thing that makes a paper STICK. Every question and its distractors must be answerable from this paper's own content, never generic trivia.",
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "strength", "support", "evidence"],
        properties: {
          claim: { type: "string", description: "One of the paper's headline claims/conclusions, in plain language." },
          strength: {
            type: "string",
            enum: ["direct", "indirect", "asserted"],
            description: "How directly THIS paper's OWN evidence backs the claim. direct = a figure/table in this paper shows it head-on. indirect = supported but via inference, aggregation, or a proxy. asserted = stated without direct in-paper evidence (relies on cited prior work, or is a framing/assumption). Judge honestly — labelling an asserted claim 'direct' is the exact over-claim this feature exists to expose.",
          },
          support: { type: "string", enum: ["figure", "table", "text", "none"], description: "The kind of in-paper evidence: a figure, a table, prose/derivation, or none." },
          evidence: { type: "string", description: "The exact label of the supporting evidence, e.g. 'Fig. 6', 'Table 2', 'Sec. IV.B'. Empty string when support is 'none'." },
          note: { type: "string", description: "OPTIONAL one line: what in that evidence supports the claim, or (for asserted) where the support actually comes from." },
        },
      },
      description: "5-8 of the paper's key claims, each tagged with how directly the paper's OWN evidence backs it. This is a researcher's first real question — 'which conclusions are actually shown here vs asserted?' — and answering it honestly is a trust feature no summary tool offers. Be rigorous, not generous: mark a claim 'asserted' whenever the paper does not itself demonstrate it.",
    },
    flashcards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["front", "back"],
        properties: {
          front: { type: "string", description: "The prompt side — a question, term, symbol or number to recall, e.g. 'What error bound does the controller guarantee?' or 'Symbol Γ means?'" },
          back: { type: "string", description: "The answer side, concise, straight from the paper (include the exact value/unit where relevant)." },
          tag: { type: "string", description: "OPTIONAL short category: 'equation', 'result', 'method', 'concept', 'number'." },
        },
      },
      description: "8-14 spaced-repetition flashcards capturing the must-remember facts of this paper — the key equation, the headline number, the central assumption, the one definition that unlocks the rest. What the reader should still know a week later. Every card's answer must come from the paper.",
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
    required: ["meta", "archetype", "story", "mindmap", "conclusion", "references", "conceptFigures", "foundations", "model"],
    properties: {
      meta: P.meta,
      archetype: P.archetype,
      story: P.story,
      mindmap: P.mindmap,
      conclusion: P.conclusion,
      references: P.references,
      conceptFigures: P.conceptFigures,
      foundations: P.foundations,
      model: P.model,
      explainer: P.explainer,
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
    required: ["resultFigures", "checkpoints", "claims", "flashcards"],
    properties: { resultFigures: P.resultFigures, checkpoints: P.checkpoints, claims: P.claims, flashcards: P.flashcards },
  },
};

/* ---------------- per-field figure lexicon (REQ2 domain routing) ----------
 * Reading a figure like a domain expert means knowing which figures a field
 * leans on and how each is judged trustworthy IN THAT FIELD. Keyed by meta.field.
 * `signature` = the figures a reviewer from this field expects; `crop` = the
 * ones that today have no faithful renderer (classify them honestly and set
 * reproduce:false) or must never be reproduced. Injected in the results phase. */
export const FIELD_LEXICON = {
  "medicine-clinical": {
    signature: "Kaplan–Meier survival curves (step + censor ticks + risk table), forest plots (per-arm/subgroup estimate ± CI + pooled diamond), ROC curves, bar ± SE, box plots.",
    crop: "kaplanMeier IS renderable — use figureFamily/digitized 'kaplanMeier' and the km carrier (steps, censor ticks, CI band, numbers-at-risk). forest and roc are NOT yet renderable — reproduce:false, show the real figure. A clinician checks censoring, numbers-at-risk and CI coverage; reproduce the survival curve faithfully and never fake a forest plot.",
  },
  "epidemiology-public-health": {
    signature: "Forest plots, Kaplan–Meier, choropleth maps, funnel plots, incidence/prevalence lines, bar ± CI.",
    crop: "kaplanMeier IS renderable (km carrier). forest, choropleth, funnel are not yet renderable — reproduce:false. Also reproduce plain incidence lines and bars from the paper's own numbers.",
  },
  "genomics-omics": {
    signature: "Volcano plots (log2FC vs −log10 p with FDR lines + labelled hits), Manhattan plots, clustered heatmaps (with dendrogram), PCA/UMAP scatter, box/violin of expression.",
    crop: "volcano and manhattan are partially expressible only as plain scatter and lose their threshold lines/coloring — prefer reproduce:false unless you can honestly place the significance lines; a bare heatmap loses its dendrogram (note it). PCA/UMAP scatter, box, violin reproduce well.",
  },
  "psychology-behavioral": {
    signature: "Bar ± SE, interaction line plots (one line per group), regression scatter with CI band, path/SEM diagrams, raincloud (box+violin+jitter).",
    crop: "sem/path diagrams are not renderable — reproduce:false. Interaction lines, bars, scatter reproduce well; a regression CI band flattens to a line (note it).",
  },
  "economics-finance": {
    signature: "Stacked-area/time series, line charts, slope charts, waterfall, choropleth, bar.",
    crop: "stackedArea (temporal stacks), slope, waterfall, choropleth are not yet renderable — reproduce:false. Plain time-series lines and bars reproduce well from the paper's reported numbers.",
  },
  "policy-social-science": {
    signature: "Choropleth maps, Sankey flows, stacked-area, diverging/Likert bars, line trends.",
    crop: "choropleth, sankey, stackedArea are not yet renderable — reproduce:false. Diverging/Likert bars flatten toward stackedBarH (note the centring loss); plain lines/bars reproduce well.",
  },
  "engineering-mechanical-fluids": {
    signature: "Contour/filled-contour fields, quiver/streamline vector fields, 3-D surfaces, stress–strain and time-response lines, log-log plots.",
    crop: "contour, quiver, surface3d are not yet renderable — reproduce:false (show the real field plot). Line/log-log responses reproduce well; calibrate to the paper's ranges.",
  },
  "electrical-engineering": {
    signature: "Bode (magnitude+phase, log-freq), Nyquist, spectra, eye diagrams, time responses.",
    crop: "bode (paired log panels) and Nyquist are not cleanly renderable yet — reproduce:false unless it is a single magnitude curve you can plot as a log-axis line. Spectra and time responses reproduce well.",
  },
  "physics": {
    signature: "Line/log-log plots, spectra, contour/field maps, heatmaps, scatter with fits.",
    crop: "contour fields and 3-D surfaces are not yet renderable — reproduce:false. Lines, log-log, spectra, heatmaps reproduce well.",
  },
  "chemistry-materials": {
    signature: "Spectra (peaks), ternary composition plots, line/scatter with fits, heatmaps.",
    crop: "ternary is not yet renderable — reproduce:false. Spectra and line/scatter reproduce well.",
  },
  "biology-life-sciences": {
    signature: "Bar ± SE, box/violin, dose–response lines, phylogenetic trees, micrographs/gels.",
    crop: "phylogenetic trees are not yet renderable (reproduce:false); micrographs/gels are image family — never reproduce, show the crop. Bars, box, violin, dose–response lines reproduce well.",
  },
  "computer-science-ML": {
    signature: "Training/convergence lines, ROC/PR curves, confusion-matrix heatmaps, ablation bars, embedding scatter.",
    crop: "roc/PR lose their diagonal + AUC framing (reproduce as line only if honest). Convergence lines, heatmaps, bars, scatter reproduce well.",
  },
};

/** Build the field-guidance block for the results phase, if we know the field. */
export function fieldLexiconBlock(field) {
  const lex = FIELD_LEXICON[field];
  if (!lex) return "";
  return (
    "\n\nDOMAIN LENS — this paper's field is \"" + field + "\". Read its figures the way a reviewer from this field would.\n" +
    "- Signature figures to expect: " + lex.signature + "\n" +
    "- Renderability in this field: " + lex.crop + "\n" +
    "Classify each subplot's figureFamily against this, and when a signature figure is not renderable set reproduce:false with a degradeReason rather than forcing it into the wrong chart family."
  );
}

/** Per-phase instruction appended to the prompt. `contextSpec` is the
 *  {protocol, blocks} slice from the method phase, required by results. */
export function phaseInstruction(phase, contextSpec) {
  if (phase === "overview") {
    return (
      "\n\nTHIS CALL IS PHASE 1 of 3: produce ONLY the fields " +
      "{meta, archetype, story, mindmap, conclusion, references, conceptFigures, foundations, model, explainer}. " +
      "Classify the archetype honestly — it decides whether the method is simulated live or " +
      "explored through the paper's own equations and reported numbers. For `model`, read the " +
      "METHODS/experimental/computational sections closely — extract the real toolchain, the " +
      "governing equations with term glossaries, the assumptions and the validation, exactly as " +
      "the paper states them. " +
      "GROUNDING (this is what fixes the Background & Model sections authors have rejected as " +
      "'invented / can't tell what they show'): for EVERY foundation concept that the paper " +
      "illustrates with a figure, attach that figure via `figure` (page + fractional bbox, same as " +
      "result figures) and give the demo a `provenance` naming the figure/equation/section. For each " +
      "governing equation, set `provenance`, and attach the paper figure it produces via `figure` " +
      "when one exists. A live plot with no visible link to the paper's own figure is the exact " +
      "failure we are eliminating. " +
      "EXPLAINER: also emit `explainer.foundations` and `explainer.model` — a 3-7 scene narrated " +
      "walkthrough of each section, spoken style (this is read aloud by text-to-speech), each scene " +
      "pointing at a real figure, a live demo, or a governing equation. The method pipeline " +
      "(protocol/blocks/explorables) and the result figures are produced in later calls — keep them " +
      "in mind for coherence, but do NOT emit them now."
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
    "\n\nTHIS CALL IS PHASE 3 of 3: produce the fields {resultFigures, checkpoints} per the rules above. " +
    "Every figure needs page + bbox, 3-6 hotspot markers, and a guided-tour explanation. " +
    "For EVERY panel, first classify figureFamily + confidence, then make the reproduce decision (honest-degrade) before writing any chart. " +
    "On the 1-3 most instructive reproduced panels, add a `predict` quiz (predict-then-reveal). " +
    "Then produce the learning artifacts: `checkpoints` (6-10 active-recall MCQs), `claims` (5-8 headline claims each tagged direct/indirect/asserted with their in-paper evidence), and `flashcards` (8-14 must-remember cards). " +
    fieldLexiconBlock(contextSpec?.field) + " " +
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

THE HONEST-DEGRADE RULE (this is how one shot stays trustworthy across EVERY field):
This platform renders 12 chart families faithfully: line, bar, groupedBar, scatter, box, violin, heatmap, stackedBar, stackedBarH, radar, radialBar, and kaplanMeier (survival/time-to-event step plots — via the digitized 'km' carrier). Many scientific figures are NOT in that set — forest plots, pie/donut, stacked-area, volcano, Manhattan, ROC, ECDF/QQ, contour fields, quiver, Sankey, choropleth maps, networks, phylogenetic trees, SEM/path diagrams, ternary, waterfall, Bode, 3-D surfaces — and some figures (micrographs, gels, MRI/CT, photos, schematics) must NEVER be turned into a chart.
For EVERY subplot you: (1) set figureFamily by looking at it; (2) set confidence; (3) make the reproduce decision. Reproduce TRUE only when the family is one of the 12 renderable ones AND confidence is high/medium AND an honest data source exists. Otherwise reproduce FALSE with a one-line degradeReason — you emit NO chart, and the reader still sees the real cropped figure with its hotspots and guided tour (which is already trustworthy and complete).
Drawing a wrong-family chart — a survival curve as a line, a forest plot as bars, a contour as a heatmap — to avoid a FALSE is the single worst failure and an automatic rejection. A faithful ORIGINAL always beats a fabricated reproduction. Honest-degrade is a first-class, correct outcome, never a shortfall.

FEWER FIGURES, FLAWLESS (REQ: first-shot trust is won by 3 perfect figures and lost by 6 shaky ones):
Prefer reproducing FEWER subplots perfectly over reproducing all of them poorly. A confidently classified original-only panel (reproduce:false) beats a strained reproduction every time. When unsure, degrade — never pad the dashboard with charts you're not sure of.

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
- AXES ARE NON-NEGOTIABLE. Every xLabel/yLabel on every demo, explorable and panel names the QUANTITY AND ITS UNIT exactly as the paper uses them ('thermal conductance (pW/K)', 'LED voltage (V)', 'iteration'). Logarithmic axes say so in the label ('log₁₀ power density (W/m²)'). Unlabeled or unit-less axes were the single most criticized failure of this system — paper authors reviewing their own papers could not tell what the plots showed.
- EVERY PLOT TRACES TO THE PAPER. Each demo, explorable and panel must be traceable to a named figure, equation, table or section — carried in its source/caption/insight text ('Eq. (3)', 'Fig. 2c', 'Sec. II.B'). A plot the paper's own author cannot connect to their paper reads as invented, even when the math is right.

RULES FOR resultFigures (THE MOST IMPORTANT PART — the real figures, made interactive from an honest source):
The reader always sees the ORIGINAL figure, cropped from the PDF via your page + bbox, with your hotspot markers pinned on it. Your explanation is its guided tour; the hotspots are that tour made clickable.

HOTSPOTS (3-6 per figure — the visual guided tour):
- Look at the figure image and pin each marker on the exact visual event that proves something: the peak, the crossover where the proposed method overtakes the baseline, the gap between two curves, the bar that wins, the moment the error collapses. x/y are fractions of the CROPPED region (bbox), origin top-left.
- Each hotspot's note answers "what am I looking at here and why does it matter?" in 1-2 sentences. A reader who clicks all the markers has understood the figure without reading anything else.

DIGITIZE HINT (per figure — the seed for tracing the REAL curve into accurate data):
- For every figure that is a QUANTITATIVE plot with readable numeric axes (line, scatter, bar over numbers), emit digitizeHint. This is how the paper's ACTUAL plotted curve becomes exact interactive data instead of numbers eyeballed off the plot.
- Give the axis LABELS, whether each axis is log, the labelled TICKS (their fraction-position along the figure's own width/height AND the number printed at each — at least the two end ticks per axis), and each plotted curve's LEGEND LABEL and COLOUR (#rrggbb read off the line).
- Report ONLY the axes, ticks, and colours. Do NOT report the curve's y-values — the digitizer extracts those from the pixels far more accurately than you can read them. Reading tick text and colours is your job; reading curve values is the digitizer's.
- Omit digitizeHint for photographs, schematics, and purely qualitative figures.

PANELS — EVERY SUBPLOT STAYS INTERACTIVE VIA THE RIGHT SOURCE:
- dataSource 'simulated' when the pipeline honestly regenerates the subplot (via outputs / helpers.simulate): time responses of the simulated controller, convergence of the simulated learning rule. These reshape live with the sliders.
- dataSource 'reported' for everything the pipeline cannot produce: experimental histograms, benchmark comparisons, human-subject statistics, ablation tables. Return the PAPER'S OWN numbers — read them from its tables and its plots' axes — as literal arrays. Still interactive (hover for exact values, series toggles), and accurate BY CONSTRUCTION because the numbers are the paper's.
- CLASSIFY EACH SUBPLOT, THEN DECIDE REPRODUCE — this is the MANDATORY first step. Look at the subplot image, set figureFamily + confidence, then set reproduce (see THE HONEST-DEGRADE RULE above). If reproduce is FALSE, set degradeReason, set chartKind to "line" and computeJs to the empty string with no digitized object, and move on — do NOT fabricate a chart. Only when reproduce is TRUE do you route it below:
    * curve(s) over a continuous x (time / iteration / frequency / a swept number) → chartKind "line", computeJs.
    * simple bars, one value per category, side by side → chartKind "bar", computeJs (categories + one value per category per series).
    * a point cloud (PCA/t-SNE/correlation) → digitized.kind "scatter".
    * BOXES (a rectangle with whiskers and a median line, sometimes several per category) → digitized.kind "box". This is NEVER "bar". Read the five-number summary (whisker ends, box ends, median line) off each box; two coloured boxes per category = two series in categories[].boxes; extra dots above the boxes = categories[].points.
    * VIOLINS (a smooth symmetric blob wider where data is dense) → digitized.kind "violin". This is NEVER "bar". Trace each blob's half-width top→bottom into categories[].violins[].dist; overlaid blobs of different colour = multiple entries in violins.
    * bars whose segments STACK on top of each other within one bar → digitized.kind "stackedBar" if the bars stand up VERTICALLY (segments stack upward — capacity/generation/cost stacks; use subPanels, one per paired variant like 80%/95%), or "stackedBarH" if the bars run HORIZONTALLY. Never redraw stacked segments as side-by-side groups, and never swap the orientation.
    * a colour-coded grid → digitized.kind "heatmap"; a spider/radar → "radar"; a circular/polar bar wheel → "radialBar".
    * a SURVIVAL / TIME-TO-EVENT staircase (curves that start at 1.0 and step DOWN over time, often with little censor ticks and a numbers-at-risk table beneath) → figureFamily "kaplanMeier", digitized.kind "kaplanMeier", fill the 'km' carrier. This is NEVER "line" — read the plateau/drop vertices into km.groups[].steps as [time, survival] pairs, the censor tick times into censors, any CI band into ci, and the numbers-at-risk row into km.risk.
  When you use a digitized.kind, set that panel's chartKind to the closest of line/bar/scatter for schema validity BUT the digitized object is what renders — fill the carrier field that matches the kind and set computeJs to the empty string. A subplot of boxes emitted as a bar chart, or stacked segments emitted as grouped bars, is an automatic rejection.
- ONE PANEL PER VISIBLE SUBPLOT. If the figure shows 4 subplots (A,B,C,D), emit 4 panels; if 8, emit 8. Do NOT reproduce only the first one or two and drop the rest — a figure reproduced with fewer panels than it has subplots is a fidelity failure. Give each panel the subplot's own label (e.g. '(A) Capacity').
- FORM AND ORIENTATION ARE PART OF FIDELITY, and so is the number of series: reproduce EVERY box, violin, stack segment or curve the subplot shows, in the paper's own order and colours (keep row order, stack order bottom→top, group structure, and dashed reference lines via refLines).
- COLOURS ARE PART OF FIDELITY TOO. When the original encodes with specific colours (a red→green heat-map colour bar, per-category bar colours, red-vs-blue phase bars), read them off the figure and pass them via digitized.palette / digitized.colors / series.color so the reproduction reads like the paper. Never substitute a different colour scale for a heat map.
- Reproduce EVERY series/curve the subplot shows (a 10-curve figure gets 10 series — the legend + click-to-isolate handles density). Collapsing a multi-series figure to 1-2 series is a fidelity failure.
- Omit a subplot ONLY when neither source exists (photographs, hardware snapshots, qualitative diagrams). Fabricating dynamics is forbidden; switching to 'reported' is the correct fallback, always.

INFER THE INPUT SIGNAL (for the panels you DO emit — the paper won't give you its raw data — reconstruct a compatible one):
- Read what excites the system in each figure (a step/reference command, a periodic gait or oscillation, a swept parameter, a disturbance/push, measurement noise) and SYNTHESIZE a signal that matches it: same qualitative shape, frequency, amplitude range, and duration as the paper describes or plots. Pull concrete numbers from the text (gait period, speed, set-points, gains, reported error magnitudes, axis ranges) and USE them as the defaults so the reproduction lands in the paper's units and ranges.
- Feed that synthesized input through the AUTHORS' OWN equations/method (the blocks above) to produce each figure's curves. Do not invent unrelated dynamics — the curves must be the output of the paper's model driven by a plausible input.
- If a figure compares conditions (with/without the method, before/after learning, different gains/terrain/payload, iterations), reproduce EACH condition as its own curve via helpers.simulate or by re-running the method with those settings. Reproducing the comparison is the whole point — never collapse it.
- Calibrate to the paper's reported numbers: if it says "error < 0.018 m" or "peak force ~650 N" or "converges in N cycles", tune your synthesized model so the reproduction shows exactly that at default parameters.
- CALIBRATE FOR THE REVERSE-ENGINEERING LAB. Panels whose subplot is a quantitative curve become auto-fit targets: the client overlays the live model on the curve traced off the real figure, and an optimizer recovers the paper's parameters from that curve. This only works if the model AT DEFAULT PARAMS lands on the paper's plotted curve (aim within ~10% of the axis range across the plotted window) AND every slider genuinely moves the feature it controls (a peak position, a collapse point, a slope). Bake calibration constants INTO the kernels — numerically fit your reduced model's constants against the paper's plotted values before answering, and note the calibration in the block's theory.
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

RULES FOR model (the physics & the model — the depth check authors apply first):
- Read the METHODS / experimental / computational sections closely; this section answers "was it simulation or experiment, with what tools, under which equations and assumptions?" — the questions domain experts ask before trusting anything else.
- approach: experiment / simulation / hybrid, decided from what the authors actually did.
- toolchain: the real instruments and software AS THE PAPER NAMES THEM (LAMMPS, COMSOL, a lock-in amplifier model, a named formalism). Include the paper's own key settings and numbers in each role (timestep, sample count, calibration value, cluster). If the paper names no software, name the mathematical machinery ('scattering-matrix method', 'finite-difference conduction solver'). NEVER invent a tool name the paper doesn't contain.
- equations: the 1-4 governing equations, in plain unicode, each with its in-paper source and a term-by-term glossary. These are the equations the reader was promised and previous versions of this system failed to show.
- assumptions: the idealizations the results rest on, from the paper's own caveats.
- validation: how the authors checked themselves. This section must survive review by the paper's own author.

RULES FOR foundations (the borrowed background — TEACH IT INTERACTIVELY):
- No paper reinvents everything. Identify the 2-4 PRIOR-WORK concepts this paper builds on and that the reader must understand first (the base dynamics model, the classic control/learning/statistical principle, the standard optimization or filtering formulation, the canonical benchmark model).
- For each: teach it in 4-7 sentences of everyday language as a mini-lesson in this paper's context, give its key equation in plain unicode (or empty string), cite the source the way the paper does, and say in 1-2 sentences what THIS paper adds on top.
- EVERY foundation gets a "demo": a small interactive experiment that makes the concept CLICK, with 1-3 sliders. Pick the visualization that teaches best — you decide:
    * kind "chart" for signal/response/tradeoff ideas: e.g. a filter demo where a noise slider and a smoothing slider fight; a feedback demo where a gain slider trades speed against overshoot; a learning-rate slider making error die out over iterations.
    * kind "frames" for inherently spatial or iterative ideas: an animated colored grid stepping through time — value iteration filling a gridworld from the goal outward, activations/weights updating in a small network, information propagating across cells. 4-25 frames, grid <= 10x10, each frame with a one-line note narrating what just happened.
- The demo must be about the CONCEPT (a minimal toy), not the paper's full system — small, punchy, obvious cause-and-effect within 2 seconds of dragging a slider.
- EVERY demo with sliders should also carry insightJs: one computed sentence (with concrete numbers derived from the current slider values) telling the reader what they are seeing and tying it back to the paper's own numbers. This line is the difference between an informative lesson and an arbitrary slider toy.
- These must be genuinely from prior literature (the paper's related-work / preliminaries), distinct from the paper's own contribution blocks.

RULES FOR blocks.plain (the story layer — this is what makes the platform addictive):
- Every block's "plain" field is the FIRST thing the reader sees; the equation hides behind a "show the math" toggle. Write it like a great teacher hooked on the subject: everyday words, one vivid metaphor, cause-and-effect, zero symbols, zero jargon. Example register: "Reality never matches the blueprint — motors drag, ground gives. This block bundles everything the model got wrong into one signal that keeps shoving the leg off its rhythm."

OTHER FIELDS
- equation: plain unicode math (α, Σ, ∫, subscripts), never LaTeX.
- theory: closely paraphrase the paper's explanation for that step, with the section number.
- pythonCode: clean NumPy translation of the same block.
- conceptFigures: pick the 2-4 figures that DELIVER THE IDEA (not results plots) — the setup/architecture figure plus the figure(s) showing the mechanism at work. Papers rarely put the whole idea in one figure; taking only the first one was an explicit author complaint. Each explanation must discuss the physics/mechanism (why it works, which law each panel exploits, how to read log axes and colour scales), not merely describe the picture.
- For the paper's MAIN pipeline/architecture diagram (one figure only), ALSO emit conceptFigures[i].svg: an accurate ANIMATED SVG rebuild (staggered fade-ins, animated dashed flow arrows, pulsing output node, scoped styles, reduced-motion fallback — see the svg field description). Visual-first is this product's core promise; a clean animated flow chart teaches faster than a flat crop.
- conclusion: the paper's core finding, naming the coefficient values it depends on.

RULES FOR THE LEARNING LAYER (predict + checkpoints — this is what makes the page a CLASSROOM, not a slideshow; a reader learns far more by predicting and being tested than by reading):
- predict (on 1-3 of the most instructive reproduced result panels): a single prediction the reader commits to BEFORE the chart is revealed. Make it about a RELATIONSHIP or a WHAT-IF they must reason about — "double this gain, what happens to overshoot?", "which curve wins at long time, and why?" — NOT something they can just read off the static figure. Distractors are real misconceptions. The insight (shown after) explains WHY using the paper's own numbers. Do not gate every panel — pick the ones a good teacher would pause on.
- checkpoints (6-10, spread across sections): retrieval-practice MCQs. Favour "why", "what would happen if", and "which figure supports which claim" over rote definitions. At least one each for story, model and results. Every question AND its distractors must be answerable from THIS paper — never generic trivia. The 'why' is the feedback the reader learns from; make it teach, not just confirm.
- claims (5-8): the paper's headline claims, each tagged by how directly the paper's OWN evidence backs it — direct (a figure/table shows it), indirect (inferred/aggregated/proxy), or asserted (stated, relying on cited work or framing, not shown here) — with the exact evidence label. Be a rigorous referee, not a promoter: if the paper does not itself demonstrate a claim, mark it 'asserted'. This is the honest answer to a researcher's first question, "what's actually shown vs claimed?".
- flashcards (8-14): the must-remember facts — the key equation, the headline number+unit, the central assumption, the unlocking definition. What the reader should still know a week later, each answerable from the paper.

FINAL CHECK before you answer — the trust test:
1. Would a reader who opens the real PDF afterwards find that everything you claimed matches it? If any statement, story beat, mindmap node, hotspot note or explanation might not survive that comparison, fix or cut it.
2. For every panel: did you classify figureFamily honestly and make the right reproduce decision? Any not-yet-renderable family (kaplanMeier, forest, pie, stackedArea, volcano, manhattan, contour, sankey, choropleth, tree, sem, …) or any image/schematic MUST be reproduce:false with a degradeReason — NOT forced into a bar/line/heatmap. For the panels you DO reproduce: does each render in the ORIGINAL subplot's chart FAMILY? A box stays a box, a violin a violin, a vertical stacked bar a vertical stack, a heatmap a heatmap, a plain curve/bar line/bar. One panel per reproduced subplot, every series/box/violin/segment present, in the paper's colours and order. Is dataSource honest — simulated only when the pipeline truly generates it, reported values truly the paper's own?
6. Would you rather ship this than a wrong chart? For every reproduce:true panel, if a domain reviewer might not recognise it as the same figure family with the same series, set reproduce:false instead. Fewer, flawless, honest — a real original always beats a shaky reproduction.
3. Is EVERY paper hands-on when you're done? A paper with no pipeline must have 2-4 explorables and reported-data panels — a text-only dashboard is a failure of this system's entire purpose.
4. Is the story/mindmap specific to THIS paper (its actual claimed contributions), not generic filler?
5. Would the PAPER'S OWN AUTHOR nod at every chart? Concretely: every axis labeled with quantity + unit (log scales named), every plot citing its figure/equation/section of origin, the model section naming their real tools and equations, and the idea section explaining their physics at least as well as their own captions. This system is reviewed by authors of the papers it presents — build for that reviewer.
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
