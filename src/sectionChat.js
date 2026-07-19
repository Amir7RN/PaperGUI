/**
 * Client side of the per-section chat assistant.
 *
 *  - buildSectionContext(spec, sectionId): compact plain-text digest of ONE
 *    section of a PaperSpec — the assistant's only source material. Built
 *    client-side so the server never needs the PDF or the full spec.
 *  - askSectionAssistant(...): authenticated call to the section-chat edge
 *    function. Free (no credit charge) during the feedback phase.
 */

import { getAccessToken, functionsUrl, supabaseAnonKey } from "./supabase.js";

const clip = (s, n = 900) =>
  typeof s === "string" && s.length > n ? s.slice(0, n) + "…" : s || "";

function demoLines(demo) {
  if (!demo) return [];
  const out = [];
  if (demo.xLabel || demo.yLabel) out.push(`  plot axes: ${demo.xLabel || "?"} → ${demo.yLabel || "?"}`);
  for (const p of demo.params || []) {
    out.push(`  slider ${p.label} (${p.sym}): ${p.min}–${p.max}, paper's value ${p.def}`);
  }
  return out;
}

/** One section of the spec → plain-text digest, capped for token safety. */
export function buildSectionContext(spec, sectionId) {
  const L = [];
  const push = (s) => { if (s) L.push(s); };

  switch (sectionId) {
    case "story": {
      const s = spec.story || {};
      push(`THE PROBLEM: ${s.problem}`);
      push(`WHAT WAS MISSING: ${s.gap}`);
      (s.contribution || []).forEach((c, i) =>
        push(`CONTRIBUTION ${i + 1} — ${c.headline}: ${c.detail}`));
      push(`WHY IT MATTERS: ${s.whyItMatters}`);
      push(`CONCLUSION: ${clip(spec.conclusion, 1200)}`);
      break;
    }
    case "mindmap": {
      for (const n of spec.mindmap?.nodes || []) push(`[${n.kind}] ${n.label}: ${n.detail}`);
      for (const e of spec.mindmap?.edges || []) push(`edge: ${e.from} —${e.label}→ ${e.to}`);
      break;
    }
    case "concept": {
      (spec.conceptFigures || []).forEach((f) => {
        push(`${f.title}\n${clip(f.explanation, 1600)}`);
      });
      break;
    }
    case "foundations": {
      (spec.foundations || []).forEach((f) => {
        push(`CONCEPT: ${f.title} (source: ${f.source})`);
        push(clip(f.concept, 1200));
        if (f.equation) push(`equation: ${f.equation}`);
        push(`why it matters here: ${clip(f.whyItMatters, 500)}`);
        demoLines(f.demo).forEach(push);
      });
      break;
    }
    case "model": {
      const m = spec.model || {};
      push(`STUDY TYPE: ${m.approach}`);
      push(clip(m.summary, 1500));
      (m.toolchain || []).forEach((t) => push(`TOOL ${t.name}: ${clip(t.role, 400)}`));
      (m.equations || []).forEach((e) => {
        push(`EQUATION — ${e.name} (${e.source || "no source"}): ${e.eq}`);
        push(clip(e.plain, 800));
        (e.terms || []).forEach((t) => push(`  ${t.sym} = ${t.meaning}`));
      });
      (m.assumptions || []).forEach((a) => push(`ASSUMPTION: ${a}`));
      push(m.validation ? `VALIDATION: ${clip(m.validation, 600)}` : "");
      break;
    }
    case "method": {
      push(`PIPELINE: ${clip(spec.protocol?.description, 900)}`);
      (spec.blocks || []).forEach((b, i) => {
        push(`STEP ${i} — ${b.title}`);
        push(`  plainly: ${clip(b.plain, 600)}`);
        if (b.equation) push(`  equation: ${b.equation}`);
        push(`  theory: ${clip(b.theory, 700)}`);
        (b.params || []).forEach((p) =>
          push(`  slider ${p.label} (${p.sym}): ${p.min}–${p.max}, paper's value ${p.def}`));
      });
      break;
    }
    case "explorables": {
      (spec.explorables || []).forEach((ex) => {
        push(`EXPLORER: ${ex.title} (basis: ${ex.basis}; source: ${ex.source})`);
        push(clip(ex.story, 900));
        demoLines(ex.demo).forEach(push);
      });
      break;
    }
    case "results": {
      (spec.resultFigures || []).forEach((fig) => {
        push(`${fig.figureLabel} — ${fig.title}`);
        push(clip(fig.explanation, 1400));
        (fig.panels || []).forEach((p) => {
          push(`  panel "${p.subplotLabel}": axes ${p.xLabel || "?"} → ${p.yLabel || "?"}` +
            (p.digitized?.source ? ` (data: ${p.digitized.source})` : ""));
        });
        (fig.hotspots || []).forEach((h) => push(`  hotspot "${h.label}": ${h.note}`));
      });
      break;
    }
    case "reverse": {
      push(
        "This lab reverse-engineers the paper: curves digitized point-for-point off the published " +
        "figures are the locked ground truth; a reduced live model of the paper's method is driven by " +
        "the pipeline's sliders. 'Scramble' randomizes the parameters; 'Auto-fit' runs a bounded " +
        "pattern-search optimizer in the browser that walks the sliders back until the model sits on the " +
        "published data — recovering the operating point the authors used. The match % is 100 minus the " +
        "RMS gap between model and digitized curve, as a percentage of the curve's range. Parameters " +
        "that trade off against each other (e.g. two efficiencies entering as a product) can only be " +
        "recovered as a combination — that is real physics, not a bug."
      );
      push(`PIPELINE UNDER FIT: ${clip(spec.protocol?.description, 700)}`);
      (spec.blocks || []).forEach((b) => {
        (b.params || []).forEach((p) =>
          push(`slider ${p.label} (${p.sym}): ${p.min}–${p.max}, paper's value ${p.def}`));
      });
      break;
    }
    default:
      break;
  }

  // Always give the assistant the paper's one-paragraph abstract for grounding.
  const head = `ABSTRACT: ${clip(spec.meta?.abstract, 1200)}`;
  return [head, ...L].filter(Boolean).join("\n").slice(0, 15000);
}

/**
 * Ask the assistant. `messages` = [{role:"user"|"assistant", content}], last
 * one the new user question. Returns the reply text. Throws Error with a
 * user-readable message on failure.
 */
export async function askSectionAssistant({ paperTitle, sectionTitle, context, messages }) {
  if (!functionsUrl) {
    throw new Error("Chat is not configured for this deployment.");
  }
  const token = await getAccessToken();
  if (!token) {
    const e = new Error("Sign in (free) to chat with the section assistant.");
    e.code = "auth";
    throw e;
  }

  const res = await fetch(`${functionsUrl}/section-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ paperTitle, sectionTitle, context, messages }),
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    throw new Error(data?.error || `Chat request failed (${res.status}).`);
  }
  if (!data?.reply) throw new Error("The assistant returned no answer — try again.");
  return data.reply;
}
