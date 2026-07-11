// @ts-nocheck
/**
 * Server-side paper analysis proxy.
 *
 * This is the ONLY place the Anthropic API key exists — it is read from an
 * Edge Function secret (`supabase secrets set ANTHROPIC_API_KEY=...`), never
 * shipped to the browser and never committed to the repo.
 *
 * Flow per request:
 *   1. Verify the caller's Supabase auth JWT (mandatory signup/sign-in).
 *   2. Look up their credit balance; reject with 402 if it's already <= 0.
 *   3. Stream the analysis from Anthropic, relaying progress to the client
 *      as newline-delimited JSON (NDJSON) events.
 *   4. On completion, compute the REAL USD cost from response.usage against
 *      the model's per-token price and deduct it from the balance. This is
 *      metered after the fact (not pre-authorized/held) — acceptable for a
 *      single-user-at-a-time hobby app; a user firing two requests in the
 *      same instant could overspend by one extra request before the first
 *      deduction lands. Once balance <= 0, every further request 402s.
 */

import Anthropic from "npm:@anthropic-ai/sdk@^0.68.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { MODEL_TIERS, SPEC_SCHEMA, SYSTEM_PROMPT, hintsBlock, tierById, usageCostUsd } from "../_shared/paperSpec.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const encoder = new TextEncoder();
const ndjson = (obj) => encoder.encode(JSON.stringify(obj) + "\n");

const MAX_PDF_BASE64_CHARS = 44 * 1024 * 1024; // ~32MB decoded, base64 overhead included

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // --- 1. Authenticate the caller ---------------------------------------
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "Sign in required." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json(401, { error: "Your session has expired — sign in again." });
  }
  const userId = userData.user.id;

  // --- 2. Check balance ----------------------------------------------------
  let { data: credit } = await admin
    .from("credits")
    .select("balance_usd")
    .eq("user_id", userId)
    .maybeSingle();

  if (!credit) {
    // Fallback in case the signup trigger hasn't run yet (race on brand-new accounts).
    const { data: inserted } = await admin
      .from("credits")
      .insert({ user_id: userId })
      .select("balance_usd")
      .single();
    credit = inserted;
  }

  if (!credit || Number(credit.balance_usd) <= 0) {
    return json(402, {
      error: "You've used up your free analysis credit. Contact the site owner if you'd like more.",
    });
  }

  // --- 3. Parse and validate the request body ------------------------------
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const { pdfBase64, tierId, hints } = body || {};
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    return json(400, { error: "Missing pdfBase64." });
  }
  if (pdfBase64.length > MAX_PDF_BASE64_CHARS) {
    return json(400, { error: "PDF is too large (32MB API limit)." });
  }
  const tier = tierById(tierId) || MODEL_TIERS[0];

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json(500, { error: "Server is not configured with an Anthropic API key." });
  }

  // --- 4. Stream the analysis, relaying progress as NDJSON ----------------
  const client = new Anthropic({ apiKey });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(ndjson(obj));
      send({ type: "progress", pct: 6, label: `${tier.label} analysis — reading the paper (text + figures)…` });

      try {
        // NOTE: we deliberately do NOT use structured outputs (output_config.format
        // with json_schema) here. SPEC_SCHEMA is large and deeply nested, and the
        // API rejects it with "The compiled grammar is too large". Instead the
        // schema is embedded in the prompt and the response is parsed leniently.
        const outputConfig = {};
        if (tier.effort) outputConfig.effort = tier.effort;

        const maxTokens = tier.id === "fast" ? 48000 : 96000;

        const schemaBlock =
          "\n\nOUTPUT FORMAT (critical):\n" +
          "Respond with ONLY one JSON object — no markdown fences, no commentary before or after. " +
          "It must validate against this JSON Schema:\n" +
          JSON.stringify(SPEC_SCHEMA);

        const anthropicStream = client.messages.stream({
          model: tier.model,
          max_tokens: maxTokens,
          ...(tier.adaptive ? { thinking: { type: "adaptive" } } : {}),
          ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
                },
                { type: "text", text: SYSTEM_PROMPT + hintsBlock(hints) + schemaBlock },
              ],
            },
          ],
        });

        let chars = 0;
        let lastUpdate = 0;
        let thinking = true;
        anthropicStream.on("text", (delta) => {
          thinking = false;
          chars += delta.length;
          const now = Date.now();
          if (now - lastUpdate > 400) {
            lastUpdate = now;
            const kb = chars / 1024;
            const pct = 8 + 72 * (1 - Math.exp(-kb / 30));
            send({ type: "progress", pct: Math.min(80, pct), label: `Reconstructing the paper — ${kb.toFixed(1)} kB extracted so far…` });
          }
        });
        anthropicStream.on("thinking", () => {
          if (thinking && Date.now() - lastUpdate > 400) {
            lastUpdate = Date.now();
            send({ type: "progress", pct: 7, label: `${tier.label} analysis — studying the methodology and figures…` });
          }
        });

        const response = await anthropicStream.finalMessage();

        if (response.stop_reason === "refusal") {
          throw new Error("The analyzer declined to process this document.");
        }
        if (response.stop_reason === "max_tokens") {
          throw new Error(
            "The analysis ran longer than the output budget allows. Try the Standard or Advanced level, or a shorter paper."
          );
        }

        send({ type: "progress", pct: 82, label: "Parsing the extracted methodology…" });
        const textBlock = response.content.find((b) => b.type === "text" && b.text);
        if (!textBlock) throw new Error("Empty response from the analyzer.");

        let spec;
        try {
          spec = parseSpecJson(textBlock.text);
        } catch {
          throw new Error("The analyzer's response could not be parsed. Try again.");
        }

        // --- 5. Meter and deduct the real cost -----------------------------
        const cost = usageCostUsd(tier, response.usage);
        const newBalance = Number(credit.balance_usd) - cost;
        await admin
          .from("credits")
          .update({ balance_usd: newBalance, updated_at: new Date().toISOString() })
          .eq("user_id", userId);

        send({ type: "result", spec, cost, remainingBalance: newBalance });
      } catch (err) {
        send({ type: "error", message: err?.message || String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...CORS_HEADERS, "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
});

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Lenient JSON extraction: without structured outputs the model may wrap the
 *  object in ```json fences or add a stray sentence. Try direct parse first,
 *  then strip fences, then take the outermost {...} span. */
function parseSpecJson(text) {
  const raw = text.trim();
  try { return JSON.parse(raw); } catch { /* fall through */ }

  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { return JSON.parse(unfenced); } catch { /* fall through */ }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }
  throw new Error("no JSON object found");
}
