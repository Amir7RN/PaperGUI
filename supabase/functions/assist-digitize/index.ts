// @ts-nocheck
/**
 * Read one figure's CALIBRATION with a vision model, on demand.
 *
 * The digitizer has always been able to trace a curve to the pixel. What it
 * could not do is know what the pixels MEAN: which number is printed at which
 * tick, whether the axis steps by decades, which of four coloured lines is the
 * one the legend calls "MPH". Until now a human typed all of that in, or the
 * up-front analysis guessed at it for every figure in the paper whether anyone
 * would ever trace it or not.
 *
 * This moves that read to the moment someone actually wants it, and pays for
 * it properly:
 *
 *  - It sees ONE figure, at the crop's own resolution, with one job — rather
 *    than a whole page while also writing a story, a mind map and eight
 *    panels. That is most of where the accuracy comes from.
 *  - It runs on Opus, because everything downstream (the traced curve, the
 *    fit, the reverse-engineered parameters) inherits a mis-read tick, and a
 *    wrong calibration is worse than none.
 *  - It returns a FRAME, never data. See DIGITIZE_ASSIST_SCHEMA — the model
 *    reads text and colours; the tracer reads the curve. That split is what
 *    makes the output checkable: a wrong tick is one visible number the human
 *    corrects in a second, whereas a wrong curve would be a plausible lie.
 *
 * METERED, like generate-panel: it is a real vision call on a per-click budget.
 */

import Anthropic from "npm:@anthropic-ai/sdk@^0.68.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonrepair } from "npm:jsonrepair@3";
import {
  MODEL_CATALOG, DIGITIZE_ASSIST_SCHEMA, digitizeAssistPrompt, usageCostUsd, forStructuredOutput,
} from "../_shared/paperSpec.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* A figure crop is a few hundred KB of JPEG at most; anything an order of
 * magnitude past that is a whole page, which is not what this reads. */
const MAX_IMAGE_BYTES = 6_000_000;
const MAX_TEXT_CHARS = 1_200;

/* Generous: the ceiling covers thinking AND the JSON, and a twelve-panel
 * figure is a long answer. It is a bound, not a spend. */
const MAX_OUTPUT_TOKENS = 12_000;

const ASSIST_MODEL = "claude-opus-5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // --- authenticate ---------------------------------------------------------
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "Sign in to read a figure." });

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

  // The client sends the crop exactly as it renders it: a data URL.
  const dataUrl = String(body?.image || "");
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return json(400, { error: "Send the figure as a base64 PNG or JPEG data URL." });
  const mediaType = m[1];
  const b64 = m[2];
  // base64 is 4 chars per 3 bytes; close enough to bound the payload.
  if ((b64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return json(413, { error: "That image is too large to read — crop it tighter." });
  }

  const figureLabel = String(body?.figureLabel || "").slice(0, 120);
  const title = String(body?.title || "").slice(0, 300);
  const caption = String(body?.caption || "").slice(0, MAX_TEXT_CHARS);

  // --- balance (owner exempt) ----------------------------------------------
  let credit = null;
  if (!isOwner) {
    ({ data: credit } = await admin
      .from("credits").select("balance_usd").eq("user_id", userId).maybeSingle());
    if (!credit || Number(credit.balance_usd) <= 0) {
      return json(402, { error: "You've used up your credit. Add credit to read more figures." });
    }
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(500, { error: "Server is not configured with an Anthropic API key." });

  const priced = MODEL_CATALOG[ASSIST_MODEL];
  const client = new Anthropic({ apiKey });

  const prompt = digitizeAssistPrompt({ figureLabel, title, caption });
  const imageBlock = { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } };
  // Image first, then the instruction — the model reads the picture knowing
  // nothing about it yet, which is the point.
  const content = (text) => [imageBlock, { type: "text", text }];

  let response;
  let structured = true;
  try {
    response = await client.messages.create({
      model: ASSIST_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      /* High effort on purpose. This is the one call whose errors are silent:
       * a mis-read tick produces a curve that looks completely reasonable and
       * is wrong by a constant factor. */
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: forStructuredOutput(DIGITIZE_ASSIST_SCHEMA) },
      },
      messages: [{ role: "user", content: content(prompt) }],
    });
  } catch (e) {
    // Same reasoning as generate-panel: a 4xx here is the schema being
    // refused, and dropping back to a prompt-embedded schema is strictly
    // better than the feature not existing. 5xx and network errors are real.
    const status = e?.status;
    if (!(status >= 400 && status < 500)) {
      return json(502, { error: `Reading the figure failed: ${e?.message || e}` });
    }
    console.warn("assist-digitize structured output rejected, falling back", { status, message: e?.message });
    structured = false;
    try {
      response = await client.messages.create({
        model: ASSIST_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        output_config: { effort: "high" },
        messages: [{
          role: "user",
          content: content(
            prompt +
            "\n\nOUTPUT FORMAT (critical):\nRespond with ONLY one JSON object — no markdown fences, " +
            "no commentary. It must validate against this JSON Schema:\n" +
            JSON.stringify(DIGITIZE_ASSIST_SCHEMA)
          ),
        }],
      });
    } catch (e2) {
      return json(502, { error: `Reading the figure failed: ${e2?.message || e2}` });
    }
  }

  if (response.stop_reason === "refusal") {
    return json(422, { error: "The reader declined this figure." });
  }
  if (response.stop_reason === "max_tokens") {
    return json(422, { error: "That figure has more panels than one read can hold — trace it in halves." });
  }

  const answer = (response.content || [])
    .filter((b) => b.type === "text" && b.text).map((b) => b.text).join("").trim();

  let hint;
  try {
    hint = parseJson(answer);
  } catch (e) {
    console.error("assist-digitize parse failed", {
      structured, length: answer.length, head: answer.slice(0, 300),
      stopReason: response.stop_reason, reason: e?.message,
    });
    return json(422, { error: "The figure read came back malformed. Trying again usually fixes it." });
  }
  if (!Array.isArray(hint?.subplots) || !hint.subplots.length) {
    return json(422, { error: "No plot panels were found in that image." });
  }

  // --- meter ----------------------------------------------------------------
  const cost = usageCostUsd(priced, response.usage);
  console.log("assist-digitize cost", JSON.stringify({
    model: ASSIST_MODEL,
    costUsd: +cost.toFixed(4),
    subplots: hint?.subplots?.length || 0,
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

  return json(200, { hint, cost: isOwner ? 0 : cost, remainingBalance: newBalance });
});

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Structured outputs make this a no-op; the fallback path needs it. Same
 *  lenient extraction the analyzer and the panel builder use. */
function parseJson(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { return JSON.parse(unfenced); } catch { /* fall through */ }
  const from = unfenced.indexOf("{");
  if (from === -1) throw new Error("no JSON object in the response");
  return JSON.parse(jsonrepair(unfenced.slice(from)));
}
