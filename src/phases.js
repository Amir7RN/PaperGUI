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
 * An analysis is five sequential calls, each returning one slice of the spec.
 * `from`/`to` are progress-bar percentages. `keys` is the exhaustive list of
 * top-level spec fields the phase owns — the merge below copies only these,
 * because without strict structured outputs the model occasionally emits stray
 * extra keys.
 *
 * A tier can route different phases to different models — the Advanced tier
 * puts Opus on model/method/results and Sonnet on the narrative ones. See
 * MODEL_TIERS.phaseModels in paperSpec.js.
 */
export const PHASES = [
  { id: "overview",    title: "Story & framing", from: 3,  to: 22,
    keys: ["meta", "archetype", "story", "mindmap", "conclusion", "references", "conceptFigures"] },
  { id: "foundations", title: "Background", from: 22, to: 38,
    keys: ["foundations", "explainer"] },
  { id: "model",       title: "The model & equations", from: 38, to: 55,
    keys: ["model", "explainer"] },
  { id: "method",      title: "Interactive method layer", from: 55, to: 76,
    keys: ["protocol", "blocks", "explorables"] },
  { id: "results",     title: "Result figures", from: 76, to: 99,
    keys: ["resultFigures", "checkpoints", "claims", "flashcards"] },
];

/** Merge one phase's returned slice into the accumulating spec. Most keys just
 *  overwrite; MERGED_SPEC_KEYS (`explainer`) are produced in halves by two
 *  phases, so overwriting would throw the first half away. */
export function mergePhase(spec, phase, phaseSpec) {
  for (const k of phase.keys) {
    const v = phaseSpec?.[k];
    if (v === undefined) continue;
    spec[k] = MERGED_SPEC_KEYS.includes(k) && v && typeof v === "object"
      ? { ...(spec[k] || {}), ...v }
      : v;
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
