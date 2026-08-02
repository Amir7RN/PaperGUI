// @ts-nocheck
/**
 * Turn ONE result figure into its interactive panels, on demand.
 *
 * This is the deferred half of the analysis's phase 5. That phase used to
 * digitize every result figure of every paper up front — classify each
 * subplot's chart family, read its values off the plot, fill the matching
 * carrier — for readers who would open one figure, or none. It was the single
 * most expensive part of an analysis and most of it was never looked at.
 *
 * Moving it here changes three things at once:
 *
 *  - COST. A reader pays for the figures they actually open. A paper whose
 *    figures nobody makes live now costs what its text costs.
 *  - SPEED. Phase 5 stopped emitting the largest structure in the schema, so
 *    the up-front run finishes markedly sooner.
 *  - ACCURACY. This call sees ONE figure, cropped at its own resolution, with
 *    one job — not a whole page while also writing checkpoints, claims and
 *    flashcards. Same reason assist-digitize reads better than the inline
 *    guess did.
 *
 * It takes the CROP, not the PDF: the client already holds every figure's
 * cropped image (renderPdfRegions fills `fig.image` right after the analysis),
 * so there is no reason to re-upload a 20 MB paper to read one plot — and a
 * per-figure call could not rely on the paper still being in the prompt cache
 * anyway.
 *
 * METERED, like generate-panel and assist-digitize.
 */

import Anthropic from "npm:@anthropic-ai/sdk@^0.68.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonrepair } from "npm:jsonrepair@3";
import { MODEL_CATALOG, FIGURE_PANELS_SCHEMA, figureDigitizePrompt, usageCostUsd } from "../_shared/paperSpec.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* A figure crop is a few hundred KB at most; an order of magnitude past that
 * is a whole page, which is not what this reads. */
const MAX_IMAGE_BYTES = 6_000_000;
const MAX_TEXT_CHARS = 2_000;
/* The pipeline, when the paper has one, so 'simulated' panels can hook into
 * the reader's live blocks instead of falling back to reported values. */
const MAX_PIPELINE_CHARS = 20_000;

/* Ceiling covers thinking AND the JSON. A multi-subplot figure with a full
 * digitized carrier per subplot is a long answer — this is a bound, not a
 * spend. */
const MAX_OUTPUT_TOKENS = 24_000;

/* Reading a published figure's values off the pixels is exactly the vision
 * work MODEL_CATALOG reserves Opus for: everything downstream (the reproduced
 * chart, the reader's trust in it) inherits a mis-read axis, and a wrong
 * reproduction is worse than an honest crop. */
const DIGITIZE_MODEL = "claude-opus-5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // --- authenticate ---------------------------------------------------------
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "Sign in to make a figure live." });

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

  const dataUrl = String(body?.image || "");
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return json(400, { error: "Send the figure crop as a base64 data URL." });
  const [, mediaType, b64] = m;
  if ((b64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return json(413, { error: "That figure image is too large to read — crop it tighter." });
  }

  const clip = (v) => String(v || "").trim().slice(0, MAX_TEXT_CHARS);
  const figureLabel = clip(body?.figureLabel);
  const title = clip(body?.title);
  const explanation = clip(body?.explanation);
  const paperTitle = String(body?.paperTitle || "").trim().slice(0, 300);
  const field = String(body?.field || "").trim().slice(0, 60);
  /* A pipeline is only usable if it actually has blocks — an empty one would
   * invite 'simulated' panels with nothing behind them. */
  let pipeline = null;
  if (body?.pipeline?.blocks?.length) {
    const serialized = JSON.stringify(body.pipeline);
    if (serialized.length <= MAX_PIPELINE_CHARS) pipeline = body.pipeline;
  }

  // --- balance (owner exempt) ----------------------------------------------
  let credit = null;
  if (!isOwner) {
    ({ data: credit } = await admin
      .from("credits").select("balance_usd").eq("user_id", userId).maybeSingle());
    if (!credit || Number(credit.balance_usd) <= 0) {
      return json(402, { error: "You've used up your credit. Add credit to make more figures live." });
    }
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(500, { error: "Server is not configured with an Anthropic API key." });

  const priced = MODEL_CATALOG[DIGITIZE_MODEL];
  const client = new Anthropic({ apiKey });

  const prompt = figureDigitizePrompt({ paperTitle, figureLabel, title, explanation, field, pipeline }) +
    /* The client executes every returned kernel and checks every carrier before
     * showing it. When that check fails, its verdict comes back here — it knows
     * things this prompt cannot, like that a series plots flat. */
    (body?.retryReason
      ? "\n\nTHIS IS A SECOND ATTEMPT. Your previous answer was checked against the figure and REJECTED:\n" +
        `  “${String(body.retryReason).slice(0, 600)}”\n` +
        "Fix that specific fault. If a subplot cannot be read honestly, set reproduce:false with a " +
        "degradeReason rather than trying again with a guess. Return the complete panels array, not a patch."
      : "");

  const imageBlock = { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } };

  let response;
  let structured = true;
  try {
    response = await client.messages.create({
      model: DIGITIZE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: FIGURE_PANELS_SCHEMA },
      },
      messages: [{ role: "user", content: [imageBlock, { type: "text", text: prompt }] }],
    });
  } catch (e) {
    /* Structured outputs compile the schema into a decoding grammar and that
     * compilation can be refused (analyze-paper hit "the compiled grammar is
     * too large" on the full PaperSpec). Any 4xx falls back to schema-in-prompt;
     * a 5xx or a network failure is a real outage and is reported as one. */
    const status = e?.status;
    if (!(status >= 400 && status < 500)) {
      return json(502, { error: `Reading the figure failed: ${e?.message || e}` });
    }
    console.warn("digitize-figure structured output rejected, falling back", { status, message: e?.message });
    structured = false;
    try {
      response = await client.messages.create({
        model: DIGITIZE_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        output_config: { effort: "high" },
        messages: [{
          role: "user",
          content: [imageBlock, {
            type: "text",
            text: prompt +
              "\n\nOUTPUT FORMAT (critical):\nRespond with ONLY one JSON object — no markdown fences, no " +
              "commentary. Escape newlines inside strings as \\n. It must validate against this JSON Schema:\n" +
              JSON.stringify(FIGURE_PANELS_SCHEMA),
          }],
        }],
      });
    } catch (e2) {
      return json(502, { error: `Reading the figure failed: ${e2?.message || e2}` });
    }
  }

  if (response.stop_reason === "refusal") {
    return json(422, { error: "The figure reader declined this image." });
  }
  if (response.stop_reason === "max_tokens") {
    return json(422, {
      error: "That figure needed a longer answer than the budget allows — it may be a multi-panel composite. Try tracing one subplot with the digitizer instead.",
    });
  }

  const answer = (response.content || [])
    .filter((b) => b.type === "text" && b.text).map((b) => b.text).join("").trim();

  let out;
  try {
    out = parseJson(answer);
  } catch (e) {
    console.error("digitize-figure parse failed", {
      structured, length: answer.length, head: answer.slice(0, 300),
      stopReason: response.stop_reason, reason: e?.message,
    });
    return json(422, { error: "The figure came back malformed. Trying again usually fixes it." });
  }

  const panels = Array.isArray(out?.panels) ? out.panels : [];
  if (!panels.length) {
    return json(422, { error: "No readable plot panels were found in that figure." });
  }

  // --- meter ----------------------------------------------------------------
  const cost = usageCostUsd(priced, response.usage);
  console.log("figure digitize cost", JSON.stringify({
    model: DIGITIZE_MODEL,
    structured,
    panels: panels.length,
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

  return json(200, { panels, cost: isOwner ? 0 : cost, remainingBalance: newBalance });
});

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Same lenient extraction the analyzer uses — fences, stray prose, small
 *  syntax slips. */
function parseJson(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { return JSON.parse(unfenced); } catch { /* fall through */ }
  const from = unfenced.indexOf("{");
  if (from === -1) throw new Error("no JSON object in the response");
  return JSON.parse(jsonrepair(unfenced.slice(from)));
}
