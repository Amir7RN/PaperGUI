/**
 * How much weight the paper's own evidence can carry.
 *
 * A reader who takes every reported number at face value reads badly. The
 * things that decide how much a result is worth — how many samples, how many
 * runs, whether there is any spread on the bars, whether anything was tested
 * for significance — are stated once in a methods paragraph and never
 * mentioned again next to the headline figure.
 *
 * WHAT THIS IS: a keyword scan over the paper's own sentences. Every finding
 * carries the exact sentence and page it came from, so the reader checks the
 * paper rather than trusting this. It reports what it FOUND and, separately,
 * what it never saw.
 *
 * WHAT THIS IS NOT: a statistical audit or a verdict on the paper. It cannot
 * read a figure to see whether error bars are drawn, it does not know whether
 * a small sample is appropriate for this design, and an absence here means
 * "these words did not appear", not "the authors did not do this". Presenting
 * it as anything stronger would be exactly the overclaiming it exists to spot.
 */

/** Sentence-level probes. `find` returns a match label, or null. */
const PROBES = [
  {
    id: "sample-size",
    label: "Sample size",
    // Explicit n, with the number captured so a genuinely small one is flagged
    // and a large one is reported as reassurance rather than a warning.
    test: (s) => {
      const m = s.match(/\b[nN]\s*=\s*(\d[\d,]*)/);
      if (!m) return null;
      const n = +m[1].replace(/,/g, "");
      if (!Number.isFinite(n)) return null;
      return { level: n < 30 ? "warn" : "ok", note: `reports n = ${m[1]}` };
    },
  },
  {
    id: "single-run",
    label: "Repeated runs",
    test: (s) => {
      if (/\b(single|one)\s+(run|seed|trial|replicate|realisation|realization)\b/i.test(s)) {
        return { level: "warn", note: "results come from a single run" };
      }
      if (/\b(\d+)\s*(?:independent\s+)?(runs|seeds|trials|replicates|folds|repetitions)\b/i.test(s)) {
        return { level: "ok", note: "repeats the experiment" };
      }
      if (/\bcross[- ]validat/i.test(s)) return { level: "ok", note: "uses cross-validation" };
      return null;
    },
  },
  {
    id: "spread",
    label: "Spread / uncertainty",
    test: (s) => {
      if (/\b(standard (deviation|error)|std\.?\s*dev|s\.?d\.?|s\.?e\.?m\.?|error bars?|confidence interval|95\s*%\s*CI|\bCI\b|interquartile|±)\b/i.test(s)) {
        return { level: "ok", note: "reports spread or uncertainty" };
      }
      return null;
    },
  },
  {
    id: "significance",
    label: "Significance testing",
    test: (s) => {
      if (/\bp\s*[<=>]\s*0?\.\d+|\bp[- ]values?\b|\bt[- ]test\b|ANOVA|Wilcoxon|Mann[- ]Whitney|chi[- ]squared?/i.test(s)) {
        return { level: "ok", note: "reports a significance test" };
      }
      return null;
    },
  },
  {
    id: "baseline",
    label: "Comparison baseline",
    test: (s) => {
      if (/\b(compared (with|to|against)|baseline|state[- ]of[- ]the[- ]art|benchmark(ed)?|ablation)\b/i.test(s)) {
        return { level: "ok", note: "compares against a baseline" };
      }
      return null;
    },
  },
  {
    id: "limitation",
    label: "Stated limitations",
    test: (s) => {
      if (/\b(limitation|caveat|we do not|does not account for|beyond the scope|future work|left for future)\b/i.test(s)) {
        return { level: "ok", note: "states a limitation" };
      }
      return null;
    },
  },
];

const MAX_PER_PROBE = 3;

/**
 * Scan a built paper index.
 * Returns { found: [{ id, label, level, items:[{note, text, page}] }],
 *           missing: [{ id, label }] }
 */
export function scanRobustness(index) {
  if (!index?.sentences?.length) return { found: [], missing: [] };

  /* Start at the METHOD heading. Everything before it is framing and related
   * work, where the paper describes what OTHER people measured — and a scan
   * that ignores this happily quotes "their method demonstrated a significant
   * improvement compared to traditional approaches" as evidence about THIS
   * paper. Attributing someone else's rigour to these authors is exactly the
   * misreading this is supposed to prevent. */
  const heads = index.headings || [];
  const introAt = heads.find((h) => h.key === "introduction")?.pos ?? -Infinity;
  const ownWorkFrom = heads.find(
    (h) => (h.key === "method" || h.key === "experiment") && h.pos >= introAt
  )?.pos ?? -Infinity;

  const buckets = new Map();
  for (const s of index.sentences) {
    // The bibliography repeats every one of these words without any of them
    // being a claim this paper is making.
    if (s.ref || s.pos >= index.refsAt) continue;
    if (s.pos < ownWorkFrom) continue;
    for (const p of PROBES) {
      let hit = null;
      try { hit = p.test(s.text); } catch { hit = null; }
      if (!hit) continue;
      const b = buckets.get(p.id) || { id: p.id, label: p.label, level: "ok", items: [] };
      if (b.items.length < MAX_PER_PROBE) {
        b.items.push({ note: hit.note, text: s.text, page: s.page });
      }
      // One warning outweighs any number of reassurances for the same probe.
      if (hit.level === "warn") b.level = "warn";
      buckets.set(p.id, b);
    }
  }

  const found = [...buckets.values()];
  const missing = PROBES
    .filter((p) => !buckets.has(p.id))
    .map((p) => ({ id: p.id, label: p.label }));

  return { found, missing };
}
