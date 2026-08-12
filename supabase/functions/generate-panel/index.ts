// @ts-nocheck
/**
 * Build ONE interactive panel, on demand, for a passage the reader picked.
 *
 * This is the inversion the platform is built around: instead of the analyzer
 * deciding up front which handful of concepts deserve a slider — and marching
 * every reader through them — the reader highlights whatever THEY don't
 * understand and gets an explorable for exactly that. An expert skips what
 * they know; a newcomer can open one for every paragraph.
 *
 * Output is a `demo` object, the same shape the analyzer already emits for
 * foundations and explorables, so the client renders it with the existing,
 * already-audited DemoChart / DemoFrames components and the same kernel
 * sandbox. Nothing new is executed that the analysis pipeline doesn't already
 * execute.
 *
 * UNLIKE the section tutor (free Haiku), this is METERED: it writes real
 * simulation code, needs Sonnet-class capability, and a curious reader could
 * fire dozens. The cost is deducted from the caller's balance exactly the way
 * an analysis phase is, and the client caps how many one paper may generate.
 */

import Anthropic from "npm:@anthropic-ai/sdk@^0.68.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonrepair } from "npm:jsonrepair@3";
import { MODEL_CATALOG, LESSON_SCHEMA, lessonPrompt, usageCostUsd } from "../_shared/paperSpec.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* Structural cost bounds, independent of the balance check.
 *
 * The quote ceiling is sized for what this endpoint now builds: a LESSON over
 * a selected PASSAGE, and a reader who wants to be taught a methods section
 * selects the whole thing — the field case that forced this redesign was a
 * ~6,000-character selection carrying six distinct concepts, which the old
 * 4,500 ceiling would have truncated mid-equation. */
const MAX_QUOTE_CHARS = 10_000;
const MAX_CONTEXT_CHARS = 12_000;

/* `max_tokens` is a ceiling on THINKING PLUS TEXT, and it is sized for a
 * LESSON: up to eight sections, each with tutor prose and an executable demo,
 * plus the reasoning that writes eight small simulations. A ceiling, not a
 * spend — a one-concept selection still emits a one-section lesson. */
const MAX_OUTPUT_TOKENS = 32_000;

const PANEL_MODEL = "claude-sonnet-5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // --- authenticate ---------------------------------------------------------
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "Sign in to build a panel." });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json(401, { error: "Your session has expired — sign in again." });
  }
  const userId = userData.user.id;

  const ownerEmails = (Deno.env.get("OWNER_EMAIL") || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isOwner = ownerEmails.includes((userData.user.email || "").toLowerCase());

  // --- validate -------------------------------------------------------------
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON body." }); }

  const quote = String(body?.quote || "").trim().slice(0, MAX_QUOTE_CHARS);
  const context = String(body?.context || "").trim().slice(0, MAX_CONTEXT_CHARS);
  const paperTitle = String(body?.paperTitle || "").trim().slice(0, 300);
  const sectionLabel = String(body?.sectionLabel || "this part of the paper").slice(0, 400);
  /* The client's quality gate runs the generated kernel in a real browser and
   * can therefore say something this prompt cannot know on its own: that the
   * dials do nothing, that it divides by zero at the end of a slider's range.
   * When it does, its verdict comes back here. */
  const retryReason = String(body?.retryReason || "").trim().slice(0, 1_600);
  if (quote.length < 20) {
    return json(400, { error: "Select a bit more text — a sentence or two — and try again." });
  }

  // --- balance (owner exempt) ----------------------------------------------
  let credit = null;
  if (!isOwner) {
    ({ data: credit } = await admin
      .from("credits").select("balance_usd").eq("user_id", userId).maybeSingle());
    if (!credit || Number(credit.balance_usd) <= 0) {
      return json(402, { error: "You've used up your credit. Add credit to build more panels." });
    }
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(500, { error: "Server is not configured with an Anthropic API key." });

  const priced = MODEL_CATALOG[PANEL_MODEL];
  const client = new Anthropic({ apiKey });

  const prompt = panelPrompt({ paperTitle, sectionLabel, quote, context }) +
    (retryReason
      ? "\n\nTHIS IS A SECOND ATTEMPT. Your previous panel was executed and REJECTED:\n" +
        `  “${retryReason}”\n` +
        "Fix that specific fault. The usual causes, in order of likelihood:\n" +
        "- A slider the code reads but that cannot change the shape of the output, or never reads at all. " +
        "Every slider must appear in computeJs somewhere that moves the plotted values.\n" +
        "- A slider whose range includes a value that breaks the maths — a zero denominator, a negative " +
        "square root, a log of zero. Choose min/max so every value in the range is safe, or clamp inside " +
        "the kernel. The reader WILL drag it to both ends.\n" +
        "- Series of different lengths, or a constant output.\n" +
        "Return a complete panel, not a patch."
      : "");

  /* The old "respond with ONLY one JSON object" instruction, kept for the
   * fallback path below. Structured outputs make it redundant; a rejected
   * schema makes it the only thing standing between us and a fenced reply. */
  const promptWithSchema =
    prompt +
    "\n\nOUTPUT FORMAT (critical):\nRespond with ONLY one JSON object — no markdown fences, no commentary. " +
    "Escape newlines inside strings as \\n. It must validate against this JSON Schema:\n" +
    JSON.stringify(LESSON_SCHEMA);

  let response;
  let structured = true;
  try {
    response = await client.messages.create({
      model: PANEL_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      /* Structured outputs, not "please reply with only JSON".
       *
       * The schema is enforced by the decoder, so the response cannot come
       * back fenced, prefaced with commentary, or missing a field — the whole
       * class of "malformed panel" failures the lenient parser below existed
       * to paper over. `effort` bounds what the thinking costs. */
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: LESSON_SCHEMA },
      },
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    /* Structured outputs compile the schema into a decoding grammar, and that
     * compilation can be refused — analyze-paper already hit "The compiled
     * grammar is too large" on the full PaperSpec and had to give it up.
     * PANEL_SCHEMA is far smaller and should be fine, but a panel builder that
     * dies outright if the API changes its mind about that is worse than one
     * that quietly drops back to the path that worked before. Any 4xx from the
     * request itself falls back; a 5xx or a network failure is a real outage
     * and is reported as one. */
    const status = e?.status;
    if (!(status >= 400 && status < 500)) {
      return json(502, { error: `The panel builder failed: ${e?.message || e}` });
    }
    console.warn("lesson structured output rejected, falling back", { status, message: e?.message });
    structured = false;
    try {
      response = await client.messages.create({
        model: PANEL_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        output_config: { effort: "medium" },
        messages: [{ role: "user", content: promptWithSchema }],
      });
    } catch (e2) {
      return json(502, { error: `The panel builder failed: ${e2?.message || e2}` });
    }
  }

  if (response.stop_reason === "refusal") {
    return json(422, { error: "The lesson builder declined this passage." });
  }

  /* Truncation has to be reported as truncation. Retrying an identical request
   * that ran out of room just runs out of room again, so "try again" would be
   * advice that cannot work. */
  if (response.stop_reason === "max_tokens") {
    return json(422, {
      error: "That passage needed a longer lesson than the budget allows. Select a smaller piece of it — the lesson covers everything you highlight.",
    });
  }

  const answer = (response.content || [])
    .filter((b) => b.type === "text" && b.text).map((b) => b.text).join("").trim();

  let lesson;
  try {
    lesson = parseJson(answer);
  } catch (e) {
    console.error("lesson parse failed", {
      structured, length: answer.length, head: answer.slice(0, 300),
      stopReason: response.stop_reason, reason: e?.message,
    });
    return json(422, { error: "The lesson came back malformed. Trying again usually fixes it." });
  }

  // --- meter ----------------------------------------------------------------
  const cost = usageCostUsd(priced, response.usage);
  console.log("lesson cost", JSON.stringify({
    model: PANEL_MODEL,
    structured,
    sections: Array.isArray(lesson?.sections) ? lesson.sections.length : 0,
    costUsd: +cost.toFixed(4),
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  }));

  let newBalance = null;
  if (!isOwner && credit) {
    newBalance = Number(credit.balance_usd) - cost;
    await admin.from("credits")
      .update({ balance_usd: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  return json(200, { lesson, cost: isOwner ? 0 : cost, remainingBalance: newBalance });
});

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Same lenient extraction the analyzer uses — fences, stray prose, small
 *  syntax slips. A panel is one small object, so this stays simple. */
function parseJson(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { return JSON.parse(unfenced); } catch { /* fall through */ }
  const from = unfenced.indexOf("{");
  if (from === -1) throw new Error("no JSON object in the response");
  return JSON.parse(jsonrepair(unfenced.slice(from)));
}
