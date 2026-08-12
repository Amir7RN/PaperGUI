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
    pipeline: spec?.blocks?.length ? { protocol: spec.protocol, blocks: spec.blocks } : null,
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

    // Some panels survived: show them. A figure whose every subplot honestly
    // degraded is also a success — the reader keeps the real figure and is
    // told why, which is the outcome this platform prefers to a guess.
    if (panels.length) {
      return { panels, cost: spent, remainingBalance: data.remainingBalance, problems };
    }

    if (attempt === 0) {
      console.warn("figure digitization failed its check, retrying with the reason", problems);
      firstProblem = problems;
      continue;
    }

    const e = new Error(`This figure couldn't be read reliably — ${problems || "no panel survived the check"}.`);
    e.code = "audit";
    e.cost = spent;
    e.remainingBalance = data.remainingBalance;
    throw e;
  }
}
