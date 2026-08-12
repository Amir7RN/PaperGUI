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
import { stageADraft } from "./figureClassify.js";

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
 * Digitize one figure of `spec`. Returns { panels, cost, remainingBalance }.
 *
 * One retry, with the audit's verdict fed back — the reader has already been
 * charged by the time the check runs, and the faults it catches (a heat map
 * with an empty grid, a series that plots flat) are exactly the kind a model
 * fixes when told which one it made. A second failure means the figure isn't
 * honestly readable, and spending more of the reader's credit to keep
 * discovering that is not a kindness.
 */
export async function digitizeFigure({ figure, spec }) {
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
   * goes without a draft, exactly as it did before this existed. */
  const { draft, prompt: draftPrompt } = await stageADraft(figure.image);

  const base = {
    image: figure.image,
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
    draft: draftPrompt || null,
  };
  if (draft?.ok) {
    console.info(
      `[stage A] ${base.figureLabel || "figure"}: ${draft.subplots.length} panel(s) — ` +
      draft.subplots.map((s) => `${s.family}@${s.confidence}`).join(", "),
    );
  }

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

    if (panels.length && !fam.problems) {
      return { panels, cost: spent, remainingBalance: data.remainingBalance, problems };
    }

    if (attempt === 0) {
      firstProblem = [problems, fam.problems].filter(Boolean).join("\n");
      console.warn("figure digitization failed its check, retrying with the reason", firstProblem);
      continue;
    }

    if (panels.length) {
      const sanitized = degradeMismatches(panels, fam.verdicts);
      return {
        panels: sanitized,
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
