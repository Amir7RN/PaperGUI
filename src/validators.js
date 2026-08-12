/**
 * The quality gate: run the generated code before the reader ever sees it.
 *
 * Each entry test-runs one phase's output — compiling every kernel, driving
 * every slider, checking that a reproduced figure is in the family it claims —
 * and returns the problems as text, which the analyzer is handed so it can
 * regenerate correctly. Returning null means it passed.
 *
 * This lives in its own module because it now has TWO callers. It was built
 * inline in App.jsx when an analysis was one five-phase run; a reader can now
 * buy the background lessons, the governing equations, the method lab or the
 * figure tours individually, long after that run finished (see phases.js), and
 * those purchases deserve the same gate. In fact they deserve it more: a dead
 * slider in a section someone chose and paid for on its own is the whole
 * purchase, not a fifth of it.
 *
 * One copy, so the two paths cannot drift into applying different standards to
 * the same generated code.
 */

import {
  buildHelpers, compileSpec, defaultsFromSpec,
  auditPipeline, auditResultFiguresQuality, auditFigureFidelity,
  auditFoundations, auditExplorables,
} from "./engine.js";

const asNote = (problems) => (problems && problems.length ? problems.join("\n") : null);

/**
 * Validators by phase id, in the shape analyzePaper/unlockSection expect:
 * `(candidateSpec) => problemsText | null`.
 *
 * A validator that throws is not a failed analysis — the audit crashing says
 * something about the audit, not about the paper — so every one of these is
 * wrapped by its caller and by the try/catch here.
 */
export const PHASE_VALIDATORS = {
  foundations: (s) => {
    try { return asNote(auditFoundations(s)); } catch { return null; }
  },

  method: (s) => {
    try {
      const h = buildHelpers(s.protocol);
      return asNote([
        ...auditPipeline(s, compileSpec(s), h, defaultsFromSpec(s)),
        ...auditExplorables(s),
      ]);
    } catch { return null; }
  },

  results: (s) => {
    try {
      const h = buildHelpers(s.protocol);
      return asNote([
        ...auditFigureFidelity(s),
        ...auditResultFiguresQuality(s, compileSpec(s), h, defaultsFromSpec(s)),
      ]);
    } catch {
      /* A paper with no pipeline can throw in the compile/run path above. The
       * fidelity gate needs none of that — it reads the analyzer's own family
       * classifications — so it still runs, and it is the one that catches the
       * failure that matters most: a box plot returned as a bar chart. */
      try { return asNote(auditFigureFidelity(s)); } catch { return null; }
    }
  },
};
