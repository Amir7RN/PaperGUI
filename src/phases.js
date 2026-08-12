/**
 * The phase plan — shared by the browser analyzer and the offline harness.
 *
 * This lived inside api.js until the fixture harness needed it too. api.js
 * cannot be imported from Node (it pulls in supabase.js, which reads
 * import.meta.env at load), so anything both sides need has to sit in a module
 * with no browser dependencies. Keeping ONE copy is the whole point: a harness
 * that re-declared the phase keys or rebuilt contextSpec by hand would drift
 * away from what real runs send the moment either changed.
 */

import { MERGED_SPEC_KEYS } from "../supabase/functions/_shared/paperSpec.js";

/**
 * Every slice of the spec a model can produce, each returned by one call.
 * `from`/`to` are progress-bar percentages. `keys` is the exhaustive list of
 * top-level spec fields the phase owns — the merge below copies only these,
 * because without strict structured outputs the model occasionally emits stray
 * extra keys.
 *
 * `fast: true` marks the ONE phase a submitted paper runs on its own. The
 * rest are UNLOCKS: a reader presses a priced button for the section they
 * actually want, and only then does that call happen.
 *
 * That split is the whole architecture. Analysing a paper used to mean five
 * sequential calls totalling several minutes and several dollars, producing
 * background lessons, governing equations, a runnable pipeline and a guided
 * tour of every figure — for a reader who, in practice, wanted the story and
 * one figure. Now submission buys the cheap structural read, and everything
 * expensive is a decision with a price on it (see actionCosts.js).
 *
 * A tier can route different phases to different models — the Advanced tier
 * puts Opus on model/method/results and Sonnet on the narrative ones. See
 * MODEL_TIERS.phaseModels in paperSpec.js. Advanced now means "the best
 * possible fast pass", never "run everything".
 */
export const PHASES = [
  { id: "overview",    title: "Reading the paper", from: 3,  to: 99, fast: true,
    keys: ["meta", "archetype", "story", "mindmap", "conclusion", "conceptFigures", "resultFigures"] },
  { id: "foundations", title: "Background", from: 5, to: 95,
    keys: ["foundations", "explainer"] },
  { id: "model",       title: "The model & equations", from: 5, to: 95,
    keys: ["model", "explainer"] },
  { id: "method",      title: "Interactive method layer", from: 5, to: 95,
    keys: ["protocol", "blocks", "explorables"] },
  { id: "results",     title: "Figure tours & claims", from: 5, to: 95,
    keys: ["resultFigures", "checkpoints", "claims", "flashcards"] },
];

/** The phases a submitted paper runs by itself — the fast first pass. */
export const FAST_PHASES = PHASES.filter((p) => p.fast);

/** The phases a reader unlocks one at a time, each individually priced. */
export const UNLOCK_PHASES = PHASES.filter((p) => !p.fast);

/**
 * Result figures are produced TWICE — indexed by the fast pass, then given
 * their tours by the `results` unlock — and the client hangs things on the
 * first version that the second must not destroy.
 *
 * `image` is the crop rendered out of the PDF right after the fast pass, and
 * `panels` is a figure the reader has already paid to digitize. A plain
 * overwrite drops both: the reader unlocks the tours and watches every figure
 * go blank and every live panel they bought disappear. So the two versions are
 * merged per figure, matched on the paper's own label (falling back to
 * position), with the client's own fields carried across.
 */
function mergeResultFigures(existing, incoming) {
  if (!Array.isArray(incoming)) return existing;
  if (!Array.isArray(existing) || !existing.length) return incoming;

  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const byLabel = new Map();
  existing.forEach((f, i) => {
    const k = norm(f?.figureLabel);
    if (k && !byLabel.has(k)) byLabel.set(k, i);
  });

  return incoming.map((fig, i) => {
    const k = norm(fig?.figureLabel);
    const prev = existing[byLabel.has(k) ? byLabel.get(k) : i];
    if (!prev) return fig;
    return {
      ...fig,
      // Client-side, paid-for, or already-rendered — never re-derivable from
      // this response, so it always wins.
      ...(prev.image ? { image: prev.image } : {}),
      ...(prev.panels?.length ? { panels: prev.panels } : {}),
    };
  });
}

/** Merge one phase's returned slice into the accumulating spec. Most keys just
 *  overwrite; MERGED_SPEC_KEYS (`explainer`) are produced in halves by two
 *  phases, so overwriting would throw the first half away, and `resultFigures`
 *  is produced twice with client state hanging off the first copy. */
export function mergePhase(spec, phase, phaseSpec) {
  for (const k of phase.keys) {
    const v = phaseSpec?.[k];
    if (v === undefined) continue;
    if (k === "resultFigures") {
      spec[k] = mergeResultFigures(spec[k], v);
    } else if (MERGED_SPEC_KEYS.includes(k) && v && typeof v === "object") {
      spec[k] = { ...(spec[k] || {}), ...v };
    } else {
      spec[k] = v;
    }
  }
  return spec;
}

/**
 * What a phase is told about the phases that ran before it.
 *
 * Deliberately narrow: the whole accumulated spec would blow the prompt and
 * bury the parts that matter. `results` needs the pipeline it must produce
 * figures for; the middle phases need only the archetype so their output stays
 * in the same key.
 */
export function contextSpecFor(phaseId, spec) {
  if (phaseId === "results") {
    return {
      protocol: spec.protocol,
      blocks: spec.blocks,
      archetype: spec.archetype,
      field: spec.meta?.field,
      /* The figure INDEX the fast pass already produced. Without it this call
       * re-picks the paper's key figures from scratch and can come back with a
       * different set, different labels or a different order — and the reader's
       * crops, and any figure they have already paid to digitize, are keyed to
       * the first list. Handing it over turns "find the figures" into "tour
       * these figures", which is both cheaper and stable. */
      figureIndex: (spec.resultFigures || []).map((f) => ({
        figureLabel: f.figureLabel, page: f.page, title: f.title,
      })),
    };
  }
  if (phaseId === "method" || phaseId === "foundations" || phaseId === "model") {
    return { archetype: spec.archetype };
  }
  return null;
}

/** Look up a phase by id — the harness takes one on the command line. */
export function phaseById(id) {
  return PHASES.find((p) => p.id === id) || null;
}
