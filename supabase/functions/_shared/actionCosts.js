/**
 * What one on-demand action costs, BEFORE it runs.
 *
 * Everything expensive in this product is now a button a reader presses, and
 * the balance is metered in real dollars after the fact (see usageCostUsd).
 * That leaves a gap the reader feels: they are asked to spend without being
 * told how much. A twenty-figure paper is twenty of those decisions, and the
 * only way to make an informed one is a number on the button.
 *
 * So every metered action declares its shape here — which model runs it, how
 * much input it carries, how much output it plausibly emits — and that turns
 * into a dollar RANGE using the same MODEL_CATALOG prices the server bills
 * against. One table, both sides: the client renders the estimate, the server
 * could bound a request against it, and neither can drift from the other.
 *
 * These are ESTIMATES and they are labelled as such in the UI. They are built
 * from the request's real structure (the model, the document, the output
 * ceiling), not from a guess at an average, and the actual metered cost is
 * shown next to the estimate afterwards so the two can be compared — which is
 * also how the constants below get corrected over time.
 */

import { MODEL_CATALOG, modelForPhase, tierById } from "./paperSpec.js";

/**
 * Input tokens one PDF page costs.
 *
 * A page is billed as text AND as a rendered image, so it is far dearer than
 * its word count suggests. ~1,500–3,000 depending on density; the midpoint is
 * used for the low end of a range and the top for the high end.
 */
export const PDF_TOKENS_PER_PAGE = { lo: 1_500, hi: 3_000 };

/**
 * A figure crop's input tokens. Anthropic charges an image at roughly
 * (width × height) / 750 tokens; renderPdfRegions crops at scale 5, so a
 * single-column figure lands around 1–3k.
 */
export const IMAGE_TOKENS = { lo: 1_000, hi: 3_500 };

/**
 * The cache write multiplier the analyzer pays on the FIRST call that carries
 * the PDF (1-hour TTL = 2x input), and the read multiplier every later call
 * inside the window pays (0.1x). An unlock that follows another unlock within
 * the hour is roughly a tenth of the input price — which is why the estimate
 * takes `cached` rather than pretending every unlock costs the same.
 */
const CACHE_WRITE = 2.0;
const CACHE_READ = 0.1;

/**
 * Every metered action, with what drives its bill.
 *
 *   model     fixed model id, or null when the caller's tier decides
 *   doc       what rides in the request: "image" (one figure crop),
 *             "pdf" (the whole paper), or "none" (text only)
 *   inLo/inHi prompt + context tokens on top of `doc`
 *   outLo/outHi generated tokens INCLUDING thinking — the ceilings match the
 *             max_tokens each function actually sets
 *   retries   how many extra paid attempts the client may make when its own
 *             quality gate rejects the first answer
 */
export const ACTION_SPECS = {
  /* generate-panel: Sonnet 5, effort medium, max_tokens 32k. Builds a LESSON
   * over the selection — one interactive section per concept — so the output
   * term scales with how much the reader highlighted: a sentence is one
   * section, a methods passage is six to eight. Quote + section digest capped
   * at 10k/12k chars server-side. */
  panel: {
    label: "Build a lesson from this selection",
    model: "claude-sonnet-5",
    doc: "none",
    inLo: 2_500, inHi: 9_000,
    outLo: 2_500, outHi: 22_000,
    retries: 1,
  },

  /* digitize-figure: Opus 5, effort high, max_tokens 24k. Carries ONE crop,
   * plus the pipeline (≤20k chars) when the paper has one. Opus is reserved
   * for exactly this read — see MODEL_CATALOG — so it is the dearest single
   * action in the product, and the one most worth pricing on the button. */
  figure: {
    label: "Digitize this figure",
    model: "claude-opus-5",
    doc: "image",
    inLo: 1_500, inHi: 7_000,
    outLo: 2_500, outHi: 14_000,
    retries: 1,
  },

  /* The deferred analysis sections. These carry the whole paper, so their
   * input term dominates and `cached` matters more than anything else. The
   * model comes from the reader's tier (Advanced routes background to Sonnet
   * and the equations/pipeline/figures to Opus). */
  foundations: { label: "Unlock the background lessons", model: null, phase: "foundations", doc: "pdf", inLo: 800, inHi: 2_000, outLo: 2_500, outHi: 9_000, retries: 1 },
  model:       { label: "Unlock the governing equations", model: null, phase: "model",     doc: "pdf", inLo: 800, inHi: 2_000, outLo: 2_500, outHi: 8_000, retries: 1 },
  method:      { label: "Unlock the method lab",          model: null, phase: "method",    doc: "pdf", inLo: 800, inHi: 2_000, outLo: 4_000, outHi: 14_000, retries: 1 },
  results:     { label: "Unlock the figure tours & claims", model: null, phase: "results", doc: "pdf", inLo: 1_200, inHi: 3_000, outLo: 4_000, outHi: 13_000, retries: 1 },
};

/** Round a dollar figure to something a human reads as a price, not a reading. */
function money(v) {
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v < 0.01) return 0.01;
  if (v < 1) return Math.round(v * 100) / 100;
  return Math.round(v * 20) / 20;   // 5-cent steps above a dollar
}

/**
 * Estimate one action's cost as a dollar range.
 *
 * @param actionId  a key of ACTION_SPECS
 * @param opts.tierId    the reader's analysis tier (only used when the action
 *                       has no fixed model — i.e. the section unlocks)
 * @param opts.pdfPages  the paper's page count, for doc:"pdf" actions
 * @param opts.cached    true when the PDF is already in the 1h prompt cache
 *                       (a second unlock inside the hour), so input bills at
 *                       0.1x instead of 2x
 * @returns { lo, hi, model, label, retries } — dollars, already rounded
 */
export function estimateActionUsd(actionId, opts = {}) {
  const spec = ACTION_SPECS[actionId];
  if (!spec) return null;

  const modelId =
    spec.model ||
    modelForPhase(tierById(opts.tierId) || null, spec.phase).model;
  const priced = MODEL_CATALOG[modelId] || MODEL_CATALOG["claude-sonnet-5"];

  // Input tokens carried by the document itself.
  let docLo = 0, docHi = 0;
  if (spec.doc === "pdf") {
    const pages = Math.max(1, Math.min(200, Number(opts.pdfPages) || 12));
    docLo = pages * PDF_TOKENS_PER_PAGE.lo;
    docHi = pages * PDF_TOKENS_PER_PAGE.hi;
  } else if (spec.doc === "image") {
    docLo = IMAGE_TOKENS.lo;
    docHi = IMAGE_TOKENS.hi;
  }

  /* The document rides in a cache block; the rest of the prompt does not.
   * Which multiplier applies is the single biggest swing in an unlock's
   * price, so it is modelled rather than averaged away. */
  const docMult = spec.doc === "pdf" ? (opts.cached ? CACHE_READ : CACHE_WRITE) : 1;

  const inCost = (docTok, promptTok) =>
    (docTok * priced.priceIn * docMult) / 1e6 + (promptTok * priced.priceIn) / 1e6;

  const lo = inCost(docLo, spec.inLo) + (spec.outLo * priced.priceOut) / 1e6;
  const hi = inCost(docHi, spec.inHi) + (spec.outHi * priced.priceOut) / 1e6;

  return {
    lo: money(lo),
    hi: money(hi),
    model: modelId,
    label: spec.label,
    retries: spec.retries || 0,
  };
}

/** "$0.04–$0.11" — one string for a button. A range that rounds to the same
 *  number on both ends collapses to a single price rather than reading as a
 *  range with nothing in it. */
export function formatEstimate(est) {
  if (!est) return "";
  const f = (v) => (v < 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(2)}`);
  return est.lo === est.hi ? `~${f(est.lo)}` : `${f(est.lo)}–${f(est.hi)}`;
}

/** How the real, metered figure compares with what we quoted. Used to show
 *  the two side by side after the action lands, which is both the honest
 *  thing to do and the only feedback loop the constants above have. */
export function estimateVerdict(est, actualUsd) {
  if (!est || !Number.isFinite(actualUsd)) return null;
  if (actualUsd <= est.hi && actualUsd >= est.lo) return "within";
  return actualUsd < est.lo ? "under" : "over";
}
