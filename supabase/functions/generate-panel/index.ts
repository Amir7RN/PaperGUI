// @ts-nocheck
/**
 * Build an interactive LESSON, on demand, for a passage the reader picked —
 * ONE PIECE PER REQUEST.
 *
 * This is the inversion the platform is built around: instead of the analyzer
 * deciding up front which handful of concepts deserve a slider — and marching
 * every reader through them — the reader highlights whatever THEY don't
 * understand and gets an explorable for exactly that. An expert skips what
 * they know; a newcomer can open one for every paragraph.
 *
 * TWO MODES, because a whole lesson does not fit in one request:
 *
 *   mode "plan"    → { plan: { title, intro, sections: [{heading, brief}] } }
 *   mode "section" → { section: { heading, teach, equation, demo, takeaway } }
 *
 * Writing eight small simulations in a single call reliably ran past the Edge
 * Function wall clock (150s on the free plan). The platform kills the isolate
 * without a response, so the browser saw a severed socket and reported
 * "Failed to fetch" — a network error for what was really a budget overrun,
 * and nothing in it a reader could act on. Every call is now small enough to
 * finish with room to spare, and the client assembles the lesson from them.
 *
 * Both modes STREAM from Anthropic and abort themselves before the platform
 * would. A deliberate abort produces a typed error the reader can act on; the
 * platform's produces silence.
 *
 * UNLIKE the section tutor (free Haiku), this is METERED: it writes real
 * simulation code, needs Sonnet-class capability, and a curious reader could
 * fire dozens. Each call deducts its own real cost, so a lesson abandoned
 * halfway is charged for the sections that were actually built.
 */

import Anthropic from "npm:@anthropic-ai/sdk@^0.68.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonrepair } from "npm:jsonrepair@3";
import {
  MODEL_CATALOG, LESSON_PLAN_SCHEMA, LESSON_SECTION_SCHEMA,
  lessonPlanPrompt, lessonSectionShared, lessonSectionAsk, usageCostUsd,
} from "../_shared/paperSpec.js";

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

/* `max_tokens` is a ceiling on THINKING PLUS TEXT, and it is now sized per
 * CALL rather than per lesson. Planning is a reading job with a short answer;
 * one section is prose plus a small simulation. Both are ceilings, not spends.
 *
 * These numbers exist to fit the wall clock, not to save money. A ceiling high
 * enough to be generous is fine; one high enough that the model can run past
 * the platform's kill is not, because that failure has no error message. */
const PLAN_OUTPUT_TOKENS = 4_000;
const SECTION_OUTPUT_TOKENS = 10_000;

const PANEL_MODEL = "claude-sonnet-5";

/**
 * How long one call may run before we stop it ourselves.
 *
 * Supabase hard-kills an Edge Function at 150s of wall clock on the free plan
 * and 400s on Pro, and the kill severs the connection with no response at all
 * — which the browser reports as "Failed to fetch". Stopping first turns that
 * into an error that says what happened and what to do. Set the `EDGE_WALL_MS`
 * secret to the plan's real window after upgrading:
 *   supabase secrets set EDGE_WALL_MS=390000
 */
const WALL_MS = Math.min(590_000, Math.max(20_000, Number(Deno.env.get("EDGE_WALL_MS")) || 140_000));

/* The passage and the plan are byte-identical across every section call of one
 * lesson, so they are sent as a cached block: section 1 pays to write it and
 * sections 2..N read it at a tenth of the input price. */
const CACHE = { type: "ephemeral", ttl: "1h" };

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

  /* Which half of the lesson this call is. Defaulting to "plan" keeps a client
   * that predates the split from silently getting a section it can't render. */
  const mode = body?.mode === "section" ? "section" : "plan";
  const plan = body?.plan;
  const index = Number(body?.index);
  if (mode === "section") {
    if (!Array.isArray(plan?.sections) || !plan.sections.length) {
      return json(400, { error: "That lesson's plan is missing — start the lesson again." });
    }
    if (!Number.isInteger(index) || index < 0 || index >= plan.sections.length) {
      return json(400, { error: "That section isn't part of this lesson." });
    }
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

  const schema = mode === "plan" ? LESSON_PLAN_SCHEMA : LESSON_SECTION_SCHEMA;
  const maxTokens = mode === "plan" ? PLAN_OUTPUT_TOKENS : SECTION_OUTPUT_TOKENS;

  /* The shared half is cached; the asking half is not, because it is the only
   * thing that differs between the section calls of one lesson. */
  const shared =
    mode === "plan"
      ? lessonPlanPrompt({ paperTitle, sectionLabel, quote, context })
      : lessonSectionShared({ paperTitle, sectionLabel, quote, context, plan });
  const ask = mode === "plan" ? "" : lessonSectionAsk({ plan, index, retryReason });

  const content = [
    { type: "text", text: shared, cache_control: CACHE },
    ...(ask ? [{ type: "text", text: ask }] : []),
  ];

  /* The old "respond with ONLY one JSON object" instruction, kept for the
   * fallback path below. Structured outputs make it redundant; a rejected
   * schema makes it the only thing standing between us and a fenced reply. */
  const schemaNote =
    "\n\nOUTPUT FORMAT (critical):\nRespond with ONLY one JSON object — no markdown fences, no commentary. " +
    "Escape newlines inside strings as \\n. It must validate against this JSON Schema:\n" +
    JSON.stringify(schema);

  /* STREAMED, with a deadline.
   *
   * Streaming is what the SDK asks for above ~16k max_tokens, and the deadline
   * is what turns "the platform killed us" into an error the reader can read.
   * A severed socket is indistinguishable from a dead network at the browser;
   * a 504 with a sentence in it is not. */
  async function run(messageContent) {
    const stream = client.messages.stream({
      model: PANEL_MODEL,
      max_tokens: maxTokens,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema },
      },
      messages: [{ role: "user", content: messageContent }],
    });
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      try { stream.abort(); } catch { /* already finished */ }
    }, WALL_MS);
    try {
      return await stream.finalMessage();
    } catch (err) {
      if (timedOut) {
        const e = new Error("timeout");
        e.timeout = true;
        throw e;
      }
      throw err;
    } finally {
      clearTimeout(deadline);
    }
  }

  let response;
  let structured = true;
  try {
    /* Structured outputs, not "please reply with only JSON".
     *
     * The schema is enforced by the decoder, so the response cannot come back
     * fenced, prefaced with commentary, or missing a field — the whole class
     * of "malformed panel" failures the lenient parser below existed to paper
     * over. `effort` bounds what the thinking costs. */
    response = await run(content);
  } catch (e) {
    if (e?.timeout) return timeoutError(mode);
    /* Structured outputs compile the schema into a decoding grammar, and that
     * compilation can be refused — analyze-paper already hit "The compiled
     * grammar is too large" on the full PaperSpec and had to give it up. These
     * schemas are far smaller and should be fine, but a lesson builder that
     * dies outright if the API changes its mind about that is worse than one
     * that quietly drops back to the path that worked before. Any 4xx from the
     * request itself falls back; a 5xx or a network failure is a real outage
     * and is reported as one. */
    const status = e?.status;
    if (!(status >= 400 && status < 500)) {
      return json(502, { error: `The lesson builder failed: ${e?.message || e}` });
    }
    console.warn("lesson structured output rejected, falling back", { status, message: e?.message });
    structured = false;
    try {
      response = await run([
        { type: "text", text: shared + schemaNote, cache_control: CACHE },
        ...(ask ? [{ type: "text", text: ask }] : []),
      ]);
    } catch (e2) {
      if (e2?.timeout) return timeoutError(mode);
      return json(502, { error: `The lesson builder failed: ${e2?.message || e2}` });
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
      error: mode === "plan"
        ? "That passage needed a longer plan than the budget allows. Select a smaller piece of it."
        : "That concept needed a longer section than the budget allows. The rest of the lesson is unaffected.",
    });
  }

  const answer = (response.content || [])
    .filter((b) => b.type === "text" && b.text).map((b) => b.text).join("").trim();

  let result;
  try {
    result = parseJson(answer);
  } catch (e) {
    console.error("lesson parse failed", {
      mode, structured, length: answer.length, head: answer.slice(0, 300),
      stopReason: response.stop_reason, reason: e?.message,
    });
    return json(422, { error: "That came back malformed. Trying again usually fixes it." });
  }

  // --- meter ----------------------------------------------------------------
  const cost = usageCostUsd(priced, response.usage);
  const u = response.usage || {};
  console.log("lesson cost", JSON.stringify({
    mode,
    section: mode === "section" ? index + 1 : null,
    model: PANEL_MODEL,
    structured,
    sections: mode === "plan" && Array.isArray(result?.sections) ? result.sections.length : null,
    costUsd: +cost.toFixed(4),
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheWriteTokens: u.cache_creation_input_tokens || 0,
    // Zero on section 2 onward means the passage is being re-billed at full
    // price once per section instead of read from the cache.
    cacheReadTokens: u.cache_read_input_tokens || 0,
  }));

  let newBalance = null;
  if (!isOwner && credit) {
    newBalance = Number(credit.balance_usd) - cost;
    await admin.from("credits")
      .update({ balance_usd: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  return json(200, {
    ...(mode === "plan" ? { plan: result } : { section: result }),
    cost: isOwner ? 0 : cost,
    remainingBalance: newBalance,
  });
});

/** The deliberate stop, said in words. See WALL_MS. */
function timeoutError(mode) {
  return json(504, {
    error: mode === "plan"
      ? "Planning this lesson took longer than the server allows. Select a smaller passage and try again."
      : "This section took longer than the server allows. The rest of the lesson is unaffected — try this one again.",
    code: "timeout",
  });
}

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
