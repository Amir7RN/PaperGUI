// @ts-nocheck
/**
 * Per-section AI chat assistant.
 *
 * The reader can ask questions about ONE section of an analyzed paper. The
 * client sends a compact text digest of that section (built from the PaperSpec,
 * never the raw PDF) plus the chat history; this function answers with a
 * small, fast model, strictly scoped to the section's topic.
 *
 * FREE during the feedback phase: authenticated users are not charged and no
 * credit balance is required. Costs are bounded structurally instead —
 * claude-haiku-4-5 (the cheapest current model), capped context, capped
 * history, capped output tokens.
 */

import Anthropic from "npm:@anthropic-ai/sdk@^0.68.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Hard caps that bound the cost of a single request
const MAX_CONTEXT_CHARS = 16_000;   // section digest from the client
const MAX_QUESTION_CHARS = 2_000;   // one user message
const MAX_HISTORY_MESSAGES = 16;    // total turns kept per request
const MAX_OUTPUT_TOKENS = 700;

const CHAT_MODEL = "claude-haiku-4-5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // --- authenticate (sign-in required; no credit charge in the free phase) ---
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "Sign in to chat with the assistant." });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json(401, { error: "Your session has expired — sign in again." });
  }

  // --- validate the request -------------------------------------------------
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const { paperTitle, sectionTitle, context, messages } = body || {};
  const mode = ["qa", "tutor", "grade"].includes(body?.mode) ? body.mode : "qa";
  if (typeof sectionTitle !== "string" || !sectionTitle.trim()) {
    return json(400, { error: "Missing sectionTitle." });
  }
  if (typeof context !== "string" || !context.trim()) {
    return json(400, { error: "Missing section context." });
  }
  if (!Array.isArray(messages) || !messages.length) {
    return json(400, { error: "Missing messages." });
  }

  const history = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_QUESTION_CHARS) }));
  if (!history.length || history[history.length - 1].role !== "user") {
    return json(400, { error: "The last message must be a user question." });
  }
  // The Messages API requires strictly alternating roles starting with "user".
  while (history.length && history[0].role !== "user") history.shift();
  const alternating = [];
  for (const m of history) {
    if (alternating.length && alternating[alternating.length - 1].role === m.role) {
      alternating[alternating.length - 1] = m; // keep the newest of a same-role run
    } else {
      alternating.push(m);
    }
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json(500, { error: "Server is not configured with an Anthropic API key." });
  }

  const header =
    `You are the section tutor of Interactive Paper Playground, embedded next to ONE section of an ` +
    `interactive walkthrough of a scientific paper.\n\n` +
    `Paper: ${String(paperTitle || "").slice(0, 300) || "(untitled)"}\n` +
    `Section: ${sectionTitle.slice(0, 200)}\n\n` +
    `SECTION CONTENT (your only source material — extracted from the paper's walkthrough, including its ` +
    `interactive plots and sliders):\n${context.slice(0, MAX_CONTEXT_CHARS)}\n\n`;

  const groundingRules =
    `- Stay on THIS section and its underlying concepts (its plots, equations, numbers, methodology, and ` +
    `interactive controls). Brief general-science background is fine when it serves the section.\n` +
    `- Never invent measurements, citations, or figure numbers not in the section content. If the answer ` +
    `isn't there, say so and point to the section that likely covers it. Numbers/units exactly as given.\n`;

  const QA_RULES =
    `Rules:\n${groundingRules}` +
    `- If asked about anything unrelated to this section or paper, reply in one sentence that you only ` +
    `cover this section and suggest what you CAN help with. Do not answer the unrelated question.\n` +
    `- Be concise: 2-6 sentences, plain language first, then the technical term in parentheses. Short ` +
    `paragraphs, no headers.`;

  const TUTOR_RULES =
    `You are in SOCRATIC TUTOR mode. Teach by asking, not lecturing — like a great office-hours tutor ` +
    `standing at the reader's shoulder.\n${groundingRules}` +
    `- Lead with ONE focused question at a time; wait for the reader's answer before the next. Never dump ` +
    `a lecture.\n` +
    `- Point at the section's OWN evidence when you probe: name its real figures, curves, equation terms ` +
    `and sliders ("drag Kₚ past 8 and watch the overshoot — why does that happen?"). The live demos are ` +
    `your teaching aid; use them.\n` +
    `- When the reader answers: if right, confirm briefly and deepen with a follow-up; if wrong or partial, ` +
    `don't just correct — ask a smaller question that exposes the gap, then guide them to it. Name the ` +
    `misconception gently.\n` +
    `- Warm, encouraging, plain language first (technical term in parentheses). 2-5 sentences, usually ` +
    `ending in a question. If the reader says they're lost or asks you to just explain, give a short ` +
    `direct explanation, then return to a question.\n` +
    `- If the last user turn is exactly "(begin)", OPEN the session: one sentence framing what this section ` +
    `is about, then your first probing question.`;

  const GRADE_RULES =
    `You are grading an EXPLAIN-IT-BACK. The reader has written their own summary of this section (it is the ` +
    `user message). Assess it against the section content only.\n${groundingRules}` +
    `- Reply in this shape, warm and brief: start with a one-line verdict and a score out of 5 (e.g. ` +
    `"Solid — 4/5."). Then "You nailed:" with 1-2 things they got right. Then "Missing or off:" with 1-2 ` +
    `specific gaps or errors, each tied to the section's real content. Then one short next-step question ` +
    `to close the biggest gap.\n` +
    `- Be honest but generous; reward real understanding over exact wording. Never invent facts the section ` +
    `doesn't contain. Under 8 sentences total.`;

  const system = header + (mode === "tutor" ? TUTOR_RULES : mode === "grade" ? GRADE_RULES : QA_RULES);

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [
        // The digest repeats across turns of one chat — cache it so follow-up
        // questions re-read it at ~10% of the input price (5-min TTL).
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      messages: alternating,
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) {
      return json(502, { error: "The assistant returned an empty answer — try again." });
    }
    return json(200, { reply: text });
  } catch (err) {
    if (err?.status === 429 || err?.status === 529) {
      return json(429, { error: "The assistant is busy right now — try again in a few seconds." });
    }
    return json(502, { error: "The assistant hit an error — try again." });
  }
});

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
