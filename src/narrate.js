/**
 * Client side of the in-app narrated explainer ("video") for sections 4 & 5.
 *
 *  - buildExplainer(spec, sectionId): the scene script for one section. Uses the
 *    analyzer-produced spec.explainer[sectionId] when present; otherwise SYNTH-
 *    ESIZES a reasonable script from the section's own content, so every paper —
 *    including the older samples and any freshly uploaded PDF whose analysis
 *    predates the explainer field — still gets a walkthrough.
 *  - fetchSceneAudio(text, voice): one narration line → an audio URL, via the
 *    `narrate` edge function (OpenAI TTS, storage-cached). Per-session memo so a
 *    replay never re-requests. Throws on failure; the player then falls back to
 *    a timed, caption-only reading.
 */
import { getAccessToken, functionsUrl, supabaseAnonKey } from "./supabase.js";

const clip = (s, n = 460) =>
  typeof s === "string" && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : (s || "");

/** A single scene: what the viewer HEARS (narration), READS (caption), and SEES
 * (visual: a real figure, an equation, or a live demo state). */
function scene(caption, narration, visual) {
  return { caption, narration: narration.replace(/\s+/g, " ").trim(), visual: visual || null };
}

/** Fallback script for the Background section, built from spec.foundations. */
function synthFoundations(spec) {
  const f = spec.foundations || [];
  const scenes = [
    scene(
      "The background this paper builds on",
      `Before the new idea, here is the groundwork. ${clip(spec.meta?.abstract, 240)} ` +
      `We will walk through ${f.length} concept${f.length === 1 ? "" : "s"} the paper leans on, ` +
      `each tied to its own figure so you can see it in the paper itself.`,
      { type: "intro" },
    ),
  ];
  f.forEach((c, i) => {
    scenes.push(scene(
      c.title,
      `${clip(c.concept, 360)} ${c.whyItMatters ? "Why it matters here: " + clip(c.whyItMatters, 200) : ""}`,
      c.figure?.image
        ? { type: "figure", image: c.figure.image, label: c.figure.label || c.source, foundationIdx: i }
        : { type: "demo", foundationIdx: i },
    ));
  });
  return { voice: "onyx", scenes };
}

/** Fallback script for the Model section, built from spec.model. */
function synthModel(spec) {
  const m = spec.model || {};
  const scenes = [
    scene(
      "What the paper actually did",
      `${clip(m.summary, 380)} This is a ${m.approach || "computational"} study. ` +
      `Let's read the governing equations one at a time.`,
      { type: "intro" },
    ),
  ];
  (m.equations || []).forEach((e, i) => {
    scenes.push(scene(
      e.name,
      `${e.name}. ${clip(e.plain, 380)} ${e.source ? "This is " + e.source + "." : ""}`,
      { type: "equation", equationIdx: i },
    ));
  });
  if (m.validation) {
    scenes.push(scene(
      "How it was checked",
      `Finally, how do we trust it? ${clip(m.validation, 360)}`,
      { type: "validation" },
    ));
  }
  return { voice: "onyx", scenes };
}

/** The scene script for one section — analyzer-authored if present, else synth. */
export function buildExplainer(spec, sectionId) {
  const authored = spec?.explainer?.[sectionId];
  if (authored?.scenes?.length) {
    return { voice: authored.voice || "onyx", scenes: authored.scenes };
  }
  if (sectionId === "foundations") return synthFoundations(spec);
  if (sectionId === "model") return synthModel(spec);
  return null;
}

// Per-session cache: narration text (+voice) → resolved audio src.
const audioMemo = new Map();

/** One narration line → a playable audio src (https URL or data: URL).
 * Throws with a user-readable message; the player degrades to captions-only. */
export async function fetchSceneAudio(text, voice = "onyx") {
  const memoKey = `${voice}|${text}`;
  if (audioMemo.has(memoKey)) return audioMemo.get(memoKey);

  if (!functionsUrl) throw new Error("Narration is not configured for this deployment.");
  const token = await getAccessToken();
  if (!token) {
    const e = new Error("Sign in (free) to hear the narrated explainer.");
    e.code = "auth";
    throw e;
  }

  const res = await fetch(`${functionsUrl}/narrate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ text, voice }),
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(data?.error || `Narration failed (${res.status}).`);

  const src = data?.url || data?.dataUrl;
  if (!src) throw new Error("Narration returned no audio — try again.");
  audioMemo.set(memoKey, src);
  return src;
}
