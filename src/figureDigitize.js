/**
 * Make ONE result figure live, on demand.
 *
 * The analysis identifies every key figure and explains it, but no longer
 * reproduces any of them up front — digitizing eight figures for a reader who
 * opens one was most of what made an analysis slow and expensive. This is the
 * other half, spent one figure at a time, when someone actually asks.
 *
 * It sends the CROP the analysis already made, not the paper: the client holds
 * every figure's image from the moment the analysis finishes, and one plot read
 * at its own resolution is both cheaper and more accurate than the same read
 * buried in a whole-page call.
 *
 * As with generate-panel, what comes back is EXECUTED and CHECKED here before
 * the reader sees it. A panel that claims a chart family but carries no values,
 * or whose kernel throws, is dropped rather than drawn — and if nothing
 * survives, the figure stays as the paper's own image, which was always a
 * correct outcome.
 */

import { getAccessToken, functionsUrl, supabaseAnonKey } from "./supabase.js";
import { specialDigitizedValid } from "./engine.js";
import { evalReportedPanel, SPECIAL_DIGITIZED_KINDS } from "./DigitizedPanels.jsx";
import { stageADraft, cropDataUrl, draftToPrompt } from "./figureClassify.js";

const SPECIAL = new Set(SPECIAL_DIGITIZED_KINDS);

/* ---------------- the family lock ----------------
 *
 * Stage A is the BASE, not a hint. Its geometry is a measurement — filled
 * rectangles standing on a shared baseline are bars whatever a model would
 * rather say — and the one catastrophic failure this feature has shown in the
 * field is exactly a model overriding that: a bar chart of detection metrics
 * returned as an invented time series. The prompt now forbids it; this is the
 * enforcement for when forbidding isn't enough, because a wrong-family chart
 * presented as the paper's own figure is the one output worse than nothing.
 *
 * Enforced at the CLASS level, which matches what Stage A actually measures
 * reliably: it can prove "bars", it is less sure about grouped-vs-stacked, so
 * within a class the model's eye wins.
 */
const FAMILY_CLASS = {
  bar: "bars", groupedBar: "bars", stackedBar: "bars", stackedBarH: "bars", radialBar: "bars",
  box: "distributions", violin: "distributions",
  line: "curves", kaplanMeier: "curves",
  scatter: "points",
  heatmap: "fields", image: "fields",
};
const CLASS_PROSE = {
  bars: "a bar chart (filled rectangles on a shared baseline)",
  distributions: "a box/violin plot (floating distribution shapes)",
  curves: "a line/curve plot",
  points: "a scatter of points",
  fields: "a filled field (heat map or image)",
};
/** Stage A confidence at or above this locks the panel's family class. */
const LOCK_CONF = 0.4;

const panelFamily = (panel) =>
  panel?.digitized?.kind || panel?.figureFamily || panel?.chartKind || null;

/**
 * Check the returned panels against the offline draft's locked classes.
 * Returns { problems, verdicts } — `verdicts[i]` names the violated class for
 * panel i, or null, so a final attempt can be honestly degraded per panel.
 */
export function auditDraftFamilies(draft, panels) {
  const subplots = draft?.ok ? draft.subplots : [];
  if (!subplots.length || !panels?.length) return { problems: null, verdicts: [] };

  const locked = subplots.map((s) =>
    s.family !== "other" && s.confidence >= LOCK_CONF ? FAMILY_CLASS[s.family] || null : null);

  /* Did Stage A see ANY evidence of curves anywhere — as a family or as a
   * runner-up? If not, and it did positively lock something, a returned line
   * panel is fabrication however the panels align with the subplots. This is
   * the exact junk mode reported from the field, so it gets its own rule that
   * survives a panel-count mismatch. */
  const anyCurveEvidence = subplots.some((s) =>
    FAMILY_CLASS[s.family] === "curves" ||
    (s.alternatives || []).some((a) => FAMILY_CLASS[a.family] === "curves" && a.score >= 0.15));
  const anyLock = locked.some(Boolean);

  const problems = [];
  const verdicts = panels.map(() => null);

  panels.forEach((panel, i) => {
    if (panel?.reproduce === false) return;
    const cls = FAMILY_CLASS[panelFamily(panel)] || null;
    if (!cls) return;
    const where = `panel "${panel?.subplotLabel || i + 1}"`;

    // Index-aligned lock: same panel count means same reading order.
    if (panels.length === subplots.length && locked[i] && cls !== locked[i]) {
      verdicts[i] = locked[i];
      problems.push(
        `${where} came back as ${CLASS_PROSE[cls] || cls}, but the local pixel read PROVES this subplot is ` +
        `${CLASS_PROSE[locked[i]]} (confidence ${subplots[i].confidence}). Emit that class with the real ` +
        `values read off the image, or reproduce:false — never another chart family.`);
      return;
    }

    // Count-mismatch fallback: a curve where no curve exists in the figure.
    if (cls === "curves" && anyLock && !anyCurveEvidence) {
      verdicts[i] = "not-curves";
      problems.push(
        `${where} came back as a line/curve plot, but the local pixel read found NO curve-like panel anywhere ` +
        `in this figure — it found ${subplots.map((s) => s.family).join(", ")}. A time series has been invented. ` +
        `Re-read the actual subplots, or set reproduce:false.`);
    }
  });

  return { problems: problems.length ? problems.join("\n") : null, verdicts };
}

/** Degrade the panels a final attempt still got wrong: the reader keeps the
 *  paper's own figure with an honest sentence, never a fabricated chart. */
function degradeMismatches(panels, verdicts) {
  return panels.map((panel, i) => {
    if (!verdicts[i]) return panel;
    const want = verdicts[i] === "not-curves" ? null : CLASS_PROSE[verdicts[i]];
    return {
      ...panel,
      reproduce: false,
      computeJs: "",
      digitized: undefined,
      degradeReason:
        (want
          ? `The pixels of this subplot read as ${want}, but the reproduction kept coming back as a different chart type`
          : "The reproduction came back as a curve that does not exist in this figure") +
        " — so the paper's own figure is shown instead of a wrong chart.",
    };
  });
}

/* ---------------- the coverage check ----------------
 *
 * A figure printed as (a)(b)(c) that comes back as one panel is not a
 * reproduction of that figure, and it is the fault readers actually notice:
 * the original sits directly above the reproduction and the panels are
 * countable at a glance. The prompt now forbids dropping a subplot; this is
 * the enforcement, and it is the same shape as the family lock — Stage A's
 * segmentation is a MEASUREMENT of how many plot boxes the crop holds, so a
 * shorter answer is checkable rather than a matter of taste.
 *
 * Deliberately one-sided and conservative. MORE panels than Stage A found is
 * fine: it over-segments a busy panel at an internal gridline more often than
 * it merges two, and the prompt already tells the model the image wins. Only
 * a SHORTER answer is challenged, only when the figure clearly has several
 * panels, and only against the subplots Stage A found real axis spines
 * around — the strictest count it produces, so a retry is never bought on the
 * strength of a label strip mistaken for a panel.
 */
export function auditPanelCoverage(draft, panels) {
  if (!draft?.ok) return null;
  const subplots = draft.subplots || [];
  const withAxes = subplots.filter((s) => s.hasAxes).length;
  const expected = withAxes || subplots.length;
  const got = panels?.length || 0;
  if (expected < 2 || got >= expected) return null;

  return (
    `You returned ${got} panel${got === 1 ? "" : "s"} for a figure the local pixel read segmented into ` +
    `${expected} plot box${expected === 1 ? "" : "es"} with their own axes — the subplots at ` +
    subplots.filter((s) => s.hasAxes || !withAxes)
      .map((s) => `[${s.box.fx0}, ${s.box.fy0}]–[${s.box.fx1}, ${s.box.fy1}]`).join(", ") +
    ` (fractions of the crop). Look again and emit ONE entry per subplot you can see, in reading order. ` +
    `A subplot you cannot read honestly is still an entry — reproduce:false with a degradeReason saying ` +
    `why — never a missing one, because the reader sees the original beside the reproduction and counts ` +
    `the panels. If the figure genuinely has fewer subplots than the pixel read claimed (it can split one ` +
    `busy panel at an internal gridline), keep your count and say so in the panels you emit.`
  );
}

/**
 * Keep the panels that will actually render; return why the rest were dropped.
 * Returns { panels, problems } — `problems` is the retry reason, or null.
 */
export function auditFigurePanels(panels) {
  const kept = [];
  const problems = [];
  (panels || []).forEach((panel, i) => {
    const where = `panel "${panel?.subplotLabel || i + 1}"`;

    /* Honest-degrade is a correct answer, not a failure — it is how a forest
     * plot or a micrograph stays trustworthy. It only has to explain itself. */
    if (panel?.reproduce === false) {
      if (!String(panel.degradeReason || "").trim()) {
        problems.push(`${where} is shown as the original but gives no degradeReason — one plain sentence telling the reader why.`);
        return;
      }
      kept.push(panel);
      return;
    }

    const kind = panel?.digitized?.kind;
    if (SPECIAL.has(kind)) {
      if (!specialDigitizedValid(panel.digitized)) {
        problems.push(`${where} claims to be a ${kind} but its values are missing or malformed — fill the carrier that matches the kind, or set reproduce:false with a degradeReason.`);
        return;
      }
      kept.push(panel);
      return;
    }

    /* A plain x-y panel of the paper's reported numbers must actually produce
     * numbers. 'simulated' panels are left to the workspace's own pipeline
     * validator, which has the block outputs this module doesn't. */
    if (panel?.dataSource === "reported") {
      if (!evalReportedPanel(panel)) {
        problems.push(`${where} produced no plottable values — return the figure's own numbers as literals, or set reproduce:false with a degradeReason.`);
        return;
      }
      kept.push(panel);
      return;
    }

    if (panel?.computeJs) { kept.push(panel); return; }
    problems.push(`${where} has reproduce:true but carries neither a chart nor digitized values.`);
  });

  return { panels: kept, problems: problems.length ? problems.join("\n") : null };
}

async function requestDigitize(payload) {
  const token = await getAccessToken();
  if (!token) {
    const e = new Error("Sign in to make this figure live.");
    e.code = "auth";
    throw e;
  }

  const res = await fetch(`${functionsUrl}/digitize-figure`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const e = new Error(data?.error || `Reading the figure failed (${res.status}).`);
    if (res.status === 402) e.code = "credit";
    throw e;
  }
  return data;
}

/**
 * How the ORIGINAL figure was laid out, carried through to the reproduction.
 *
 * Stage A already measures this — it has to segment the crop into subplots
 * before it can classify them — so it costs nothing extra. Without it the
 * reproduced panels stack in one column whatever the paper did, and a figure
 * printed as a 2x2 grid comes back as four cards in a row down the page,
 * which stops looking like the figure it claims to be traced from. Arranging
 * them the way the paper arranged them is most of what makes a reproduction
 * checkable against the original at a glance.
 */
const layoutOf = (draft) =>
  draft?.ok && draft.layout
    ? { rows: draft.layout.rows || 1, cols: draft.layout.cols || 1, count: draft.layout.count || 0 }
    : null;

/**
 * ONE read of one image — the whole two-attempt loop, for a crop that may be a
 * whole figure or a single subplot cut out of one.
 *
 * Returns { panels, cost, remainingBalance, problems }, or throws with a
 * `.code` the caller can act on ("audit", "credit", "auth", "timeout").
 *
 * One retry, with the audit's verdict fed back — the reader has already been
 * charged by the time the check runs, and the faults it catches (a heat map
 * with an empty grid, a series that plots flat) are exactly the kind a model
 * fixes when told which one it made. A second failure means the crop isn't
 * honestly readable, and spending more of the reader's credit to keep
 * discovering that is not a kindness.
 */
async function readCrop({ base, draft }) {
  let spent = 0;
  let firstProblem = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await requestDigitize(
      attempt === 0 ? base : { ...base, retryReason: firstProblem },
    );
    spent += data.cost || 0;

    const { panels, problems } = auditFigurePanels(data.panels);

    /* THE FAMILY LOCK, enforced. The structural audit above checks that a
     * panel carries values; this checks that it carries the RIGHT KIND of
     * chart, against what the local pixel read proved about this crop. A
     * violation on the first attempt goes back to the model with the exact
     * measurement it contradicted; on the second it is degraded to the
     * paper's own figure, because a bar chart shown as a time series is the
     * one output this feature must never produce. */
    const fam = auditDraftFamilies(draft, panels);

    /* Counted against the RAW answer, not the kept panels: a subplot the model
     * never mentioned and one it returned malformed are different faults with
     * different fixes, and `problems` above already covers the second. */
    const coverage = auditPanelCoverage(draft, data.panels);

    /* A short answer is worth ONE more attempt, never a failure — three
     * panels of which two are honest is a better figure than an error, and
     * the reader has already paid for what came back. */
    if (panels.length && !fam.problems && !(coverage && attempt === 0)) {
      return { panels, cost: spent, remainingBalance: data.remainingBalance, problems };
    }

    if (attempt === 0) {
      firstProblem = [problems, fam.problems, coverage].filter(Boolean).join("\n");
      console.warn("figure digitization failed its check, retrying with the reason", firstProblem);
      continue;
    }

    if (panels.length) {
      return {
        panels: degradeMismatches(panels, fam.verdicts),
        cost: spent,
        remainingBalance: data.remainingBalance,
        problems: [problems, fam.problems].filter(Boolean).join("\n") || null,
      };
    }

    const e = new Error(`This figure couldn't be read reliably — ${problems || "no panel survived the check"}.`);
    e.code = "audit";
    e.cost = spent;
    e.remainingBalance = data.remainingBalance;
    throw e;
  }
}

/* ---------------- one request per subplot ----------------
 *
 * Reading a whole multi-panel figure in ONE request is the slowest thing this
 * app does, and past a certain figure it simply cannot finish: Supabase kills
 * an Edge Function at 150s of wall clock on the free plan, and a four-panel
 * figure read at high effort with a full digitized carrier per panel routinely
 * runs longer than that. The reader met it as "reading this figure took longer
 * than the server allows" — having paid for the attempt.
 *
 * Cutting the crop into its subplots and sending one request each fixes that
 * without changing platform, and three other things fall out of it:
 *
 *  - ACCURACY. Each request sees one plot at its own resolution with one job,
 *    and its whole output budget belongs to that panel. Same reason this
 *    module exists at all rather than digitizing inside the page analysis.
 *  - COST. A quarter of the image and a quarter of the answer, four times,
 *    is not more than the whole in one go — and usually less, because the
 *    long single answer is what runs into retries.
 *  - PARTIAL SUCCESS. A panel that can't be read degrades to the paper's own
 *    figure with a sentence, while its neighbours stay live. The all-or-
 *    nothing failure is gone.
 *
 * It is only attempted when Stage A's segmentation looks trustworthy, because
 * a bad split reads half a plot as a whole one — see splitPlan.
 */

/** Beyond this many panels the split is more likely a mis-segmented dense
 *  figure than a real grid, and the parallel spend gets hard to justify. */
const MAX_SPLIT_PANELS = 8;
/** How many subplot reads are in flight at once. Enough to hide the latency
 *  of a 4-panel figure in one round; low enough not to open a dozen sockets
 *  or spike the reader's spend rate. */
const SPLIT_CONCURRENCY = 3;

/**
 * The subplots worth sending as their own request, or null to read the figure
 * whole.
 *
 * Conservative on purpose. Splitting on a bad segmentation is worse than not
 * splitting: it crops a plot in half and asks a model to read the half as if
 * it were the panel, which produces a confident wrong answer rather than a
 * visible failure. So a split needs Stage A to have found real axis spines
 * around every candidate, cells big enough to be plots rather than label
 * strips, and enough of the crop covered that the segmentation is describing
 * the figure rather than a corner of it.
 */
export function splitPlan(draft) {
  if (!draft?.ok) return null;
  const subs = (draft.subplots || []).filter((s) => s.hasAxes && s.box);
  if (subs.length < 2 || subs.length > MAX_SPLIT_PANELS) return null;

  const area = (s) => Math.max(0, s.box.fx1 - s.box.fx0) * Math.max(0, s.box.fy1 - s.box.fy0);
  const bigEnough = subs.every((s) =>
    s.box.fx1 - s.box.fx0 >= 0.12 && s.box.fy1 - s.box.fy0 >= 0.12);
  if (!bigEnough) return null;

  /* Cells that between them cover almost none of the crop mean the gutter
   * finder latched onto something else — a legend strip, a caption block. */
  const covered = subs.reduce((t, s) => t + area(s), 0);
  if (covered < 0.3) return null;

  return subs;
}

/** The draft for ONE subplot, as if that subplot were the whole crop — which
 *  is exactly what the request that carries it will see. */
function subplotDraft(draft, s) {
  return {
    ok: true,
    width: draft.width,
    height: draft.height,
    background: draft.background,
    layout: { rows: 1, cols: 1, count: 1 },
    subplots: [{ ...s, index: 0, box: { fx0: 0, fy0: 0, fx1: 1, fy1: 1 } }],
  };
}

/** Run `job` over `items` with at most `limit` in flight, keeping results in
 *  the input's order. */
async function pooled(items, limit, job) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await job(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** A subplot that could not be read, kept as the slot it occupies. The reader
 *  sees the original for that panel and a sentence saying why — never a hole
 *  where a panel was, which is indistinguishable from a figure that never had
 *  one. */
const failedSubplotPanel = (i, n, reason) => ({
  subplotLabel: `Subplot ${i + 1} of ${n}`,
  figureFamily: "other",
  confidence: "low",
  reproduce: false,
  chartKind: "line",
  dataSource: "reported",
  xLabel: "",
  yLabel: "",
  computeJs: "",
  degradeReason: reason,
});

/**
 * Digitize one figure of `spec`. Returns { panels, layout, cost, remainingBalance }.
 *
 * Reads subplot by subplot when Stage A segmented the crop confidently, and
 * whole otherwise. Both paths run the same audits and return the same shape.
 *
 * @param onProgress optional ({ done, total }) => void, for the reader's
 *   "reading panel 2 of 3" — a multi-minute wait that says nothing is
 *   indistinguishable from a hang, which is how the timeout was first reported.
 */
export async function digitizeFigure({ figure, spec, onProgress }) {
  if (!functionsUrl) throw new Error("Making figures live isn't configured for this deployment.");
  if (!figure?.image) {
    throw new Error("This figure has no crop to read — reopen the paper so its figures can be cropped again.");
  }

  /* STAGE A — free, offline, local.
   *
   * Before spending anything, the crop is measured in the browser: how many
   * panels it holds, where they sit, what shape the marks in each one are,
   * which colours they are drawn in. See figureClassify.js for why those
   * particular questions are answered better by counting pixels than by
   * looking, and for how carefully the result is hedged.
   *
   * It runs on the same image the paid call is about to see, so the online
   * pass is no longer answering from scratch — it is checking specific claims
   * against the picture, which is a far more reliable thing to ask for. A
   * local read that fails or finds nothing is not an error: the request simply
   * goes without a draft, exactly as it did before this existed. It is also
   * what decides whether the figure is read in one request or several. */
  const { draft, prompt: draftPrompt } = await stageADraft(figure.image);

  const common = {
    figureLabel: figure.figureLabel || figure.label || "",
    title: figure.title || "",
    explanation: figure.explanation || "",
    paperTitle: spec?.meta?.title || "",
    field: spec?.meta?.field || "",
    /* NO pipeline, deliberately. Digitizing a result figure now means exactly
     * that: the paper's own plotted values, read off the image, in the image's
     * own chart family. Hooking result panels into the live simulation was how
     * a digitization came back as a synthetic 'simulated' curve instead of the
     * figure — the sliders belong to the method lab, not to the record of what
     * the paper measured. */
    pipeline: null,
  };
  if (draft?.ok) {
    console.info(
      `[stage A] ${common.figureLabel || "figure"}: ${draft.subplots.length} panel(s) — ` +
      draft.subplots.map((s) => `${s.family}@${s.confidence}`).join(", "),
    );
  }

  const plan = splitPlan(draft);
  if (plan) {
    const split = await digitizeBySubplot({ figure, draft, plan, common, onProgress });
    if (split) return split;
    console.warn("per-subplot digitization produced nothing; reading the figure whole");
  }

  onProgress?.({ done: 0, total: 1 });
  const { panels, cost, remainingBalance, problems } = await readCrop({
    base: { ...common, image: figure.image, draft: draftPrompt || null },
    draft,
  });
  onProgress?.({ done: 1, total: 1 });
  return { panels, layout: layoutOf(draft), cost, remainingBalance, problems };
}

/**
 * The split path: one request per subplot, in parallel, merged in the
 * figure's own reading order.
 *
 * Returns null when the crops themselves could not be made (a tainted canvas,
 * an image that won't decode) so the caller can fall back to reading the
 * figure whole. A subplot whose REQUEST fails is not a null — it is a degraded
 * panel among live ones, which is the whole point of splitting.
 */
async function digitizeBySubplot({ figure, draft, plan, common, onProgress }) {
  let crops;
  try {
    crops = await Promise.all(plan.map((s) => cropDataUrl(figure.image, s.box)));
  } catch (e) {
    console.warn("could not cut the figure into subplots", e);
    return null;
  }

  const total = plan.length;
  let done = 0;
  onProgress?.({ done, total });

  /* A refusal that will repeat on every remaining subplot — no credit, no
   * session — stops the run instead of buying the same error N times. */
  let fatal = null;

  const results = await pooled(plan, SPLIT_CONCURRENCY, async (s, i) => {
    if (fatal) return { skipped: true };
    try {
      const one = await readCrop({
        base: {
          ...common,
          image: crops[i],
          draft: draftToPrompt(subplotDraft(draft, s)),
          subplot: { index: i + 1, count: total },
        },
        draft: subplotDraft(draft, s),
      });
      return one;
    } catch (e) {
      if (e?.code === "credit" || e?.code === "auth") fatal = e;
      console.warn(`subplot ${i + 1}/${total} could not be read`, e);
      return { error: e, cost: e?.cost || 0, remainingBalance: e?.remainingBalance };
    } finally {
      done += 1;
      onProgress?.({ done, total });
    }
  });

  const panels = [];
  const problems = [];
  let cost = 0;
  let balance = null;
  let read = 0;

  results.forEach((r, i) => {
    if (!r || r.skipped) {
      panels.push(failedSubplotPanel(i, total,
        "This subplot wasn't read — the figure ran out of credit part-way through. Try again to finish it."));
      return;
    }
    cost += r.cost || 0;
    /* Each request charges atomically and reports the balance after its own
     * charge, so the lowest number is the one that saw the most charges —
     * never the last to arrive, which is a race. */
    if (Number.isFinite(r.remainingBalance)) {
      balance = balance == null ? r.remainingBalance : Math.min(balance, r.remainingBalance);
    }
    if (r.error) {
      panels.push(failedSubplotPanel(i, total,
        r.error.code === "timeout"
          ? "This subplot took longer than the server allows to read, so the paper's own figure is shown for it."
          : `This subplot couldn't be read reliably (${r.error.message || "unknown error"}), so the paper's own figure is shown for it.`));
      problems.push(`subplot ${i + 1}: ${r.error.message || r.error}`);
      return;
    }
    read += 1;
    panels.push(...r.panels);
    if (r.problems) problems.push(`subplot ${i + 1}: ${r.problems}`);
  });

  /* Nothing readable at all is a failure, not a figure of apologies — and it
   * carries what was spent so the receipt is honest. */
  if (!read) {
    const e = new Error(
      fatal?.message ||
      `None of this figure's ${total} subplots could be read — ${problems[0] || "every request failed"}.`);
    e.code = fatal?.code || "audit";
    e.cost = cost;
    e.remainingBalance = balance;
    throw e;
  }

  console.info(`[split] read ${read}/${total} subplots of ${common.figureLabel || "figure"} for $${cost.toFixed(4)}`);
  return {
    panels,
    layout: layoutOf(draft),
    cost,
    remainingBalance: balance,
    problems: problems.length ? problems.join("\n") : null,
  };
}
