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

  const system =
    `You are the section assistant of Interactive Paper Playground, embedded next to ONE section of an ` +
    `interactive walkthrough of a scientific paper.\n\n` +
    `Paper: ${String(paperTitle || "").slice(0, 300) || "(untitled)"}\n` +
    `Section: ${sectionTitle.slice(0, 200)}\n\n` +
    `SECTION CONTENT (your only source material — extracted from the paper's walkthrough):\n` +
    `${context.slice(0, MAX_CONTEXT_CHARS)}\n\n` +
    `Rules:\n` +
    `- Answer questions about THIS section and its underlying concepts: explain its plots, equations, ` +
    `numbers, physics/methodology, and how to use its interactive controls. Brief general-science ` +
    `background is fine when it serves the section.\n` +
    `- If asked about anything unrelated to this section or paper (other topics, other papers, coding help, ` +
    `personal advice, site billing), reply in one sentence that you only cover this section, and suggest ` +
    `what you CAN help with here. Do not answer the unrelated question.\n` +
    `- Be concise: 2-6 sentences, plain language first, then the technical term in parentheses. ` +
    `Use short paragraphs, no headers. Numbers and units exactly as given in the section content.\n` +
    `- If the section content doesn't contain the answer, say so honestly and point to which other ` +
    `section of the page likely covers it.\n` +
    `- Never invent measurements, citations, or figure numbers that are not in the section content.`;

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
