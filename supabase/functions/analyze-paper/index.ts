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
import { jsonrepair } from "npm:jsonrepair@3";
import {
  MODEL_TIERS, SPEC_SCHEMA, PHASE_SCHEMAS, SYSTEM_PROMPT,
  hintsBlock, modelForPhase, phaseInstruction, tierById, usageCostUsd,
} from "../_shared/paperSpec.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const encoder = new TextEncoder();
const ndjson = (obj) => encoder.encode(JSON.stringify(obj) + "\n");

const MAX_PDF_BASE64_CHARS = 44 * 1024 * 1024; // ~32MB decoded, base64 overhead included

/**
 * How long one phase may run before we abort it ourselves.
 *
 * Supabase hard-kills an Edge Function at 150s of wall clock on the free plan
 * and 400s on Pro, and the kill looks like a silent disconnect to the browser
 * — so we stop a few seconds early and send a real error instead. Set the
 * `EDGE_WALL_MS` secret to the plan's window after upgrading:
 *   supabase secrets set EDGE_WALL_MS=390000
 * That one value also unlocks higher reasoning effort below, because the
 * effort ceiling exists purely to fit this window.
 */
const WALL_MS = Math.min(590_000, Math.max(30_000, Number(Deno.env.get("EDGE_WALL_MS")) || 140_000));
/** Above this budget there's room for the tier's full-quality effort setting. */
const LONG_WINDOW_MS = 300_000;

/**
 * Prompt cache with a ONE-HOUR TTL, not the 5-minute default.
 *
 * A run is five sequential phases, each allowed up to WALL_MS, plus any
 * quality-gate regenerations — routinely more than five minutes end to end.
 * With the default TTL the cache had expired by the later phases, so each one
 * re-sent the whole PDF at full input price AND paid to write the cache again.
 * A 1h write costs 2x input instead of 1.25x, which pays for itself after
 * three reads; we make at least four.
 */
const CACHE = { type: "ephemeral", ttl: "1h" };

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

  // The owner (OWNER_EMAIL secret, comma-separated) gets unlimited analysis:
  // no balance requirement and no cost deduction.
  const ownerEmails = (Deno.env.get("OWNER_EMAIL") || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isOwner = ownerEmails.includes((userData.user.email || "").toLowerCase());

  // --- 2. Parse and validate the request body ------------------------------
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const { pdfBase64, tierId, hints, phase, contextSpec, repair, codeText } = body || {};
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    return json(400, { error: "Missing pdfBase64." });
  }
  // Optional: the paper's actual code/scripts, uploaded by the reader. It is
  // the ground truth for the method — capped so one analysis can't blow the
  // context (or the caller's balance) with a giant repo dump.
  const MAX_CODE_CHARS = 160_000;
  const code =
    typeof codeText === "string" && codeText.trim()
      ? codeText.length > MAX_CODE_CHARS
        ? codeText.slice(0, MAX_CODE_CHARS) + "\n\n[... code truncated at 160k characters ...]"
        : codeText
      : null;
  if (pdfBase64.length > MAX_PDF_BASE64_CHARS) {
    return json(400, { error: "PDF is too large (32MB API limit)." });
  }
  if (phase && !PHASE_SCHEMAS[phase]) {
    return json(400, { error: `Unknown analysis phase "${phase}".` });
  }
  if (phase === "results" && !contextSpec?.blocks) {
    return json(400, { error: "The results phase requires the pipeline from the method phase." });
  }
  const tier = tierById(tierId) || MODEL_TIERS[0];
  // One tier can run several models — the Advanced tier puts Opus on the
  // model/method/results phases and Sonnet on the narrative ones. Everything
  // below (model id, thinking, effort, PRICING) comes from this, not the tier.
  const run = modelForPhase(tier, phase);

  // --- 3. Check balance (owner is exempt) ----------------------------------
  let credit = null;
  if (!isOwner) {
    ({ data: credit } = await admin
      .from("credits")
      .select("balance_usd")
      .eq("user_id", userId)
      .maybeSingle());

    if (!credit) {
      // Fallback in case the signup trigger hasn't run yet (race on brand-new accounts).
      const { data: inserted } = await admin
        .from("credits")
        .insert({ user_id: userId })
        .select("balance_usd")
        .single();
      credit = inserted;
    }

    // The FIRST phase of a run requires positive credit; later phases may
    // overdraw a few dollars so a run that already spent money always
    // completes instead of dying half-paid. The negative balance simply
    // blocks the NEXT run until the account is topped up.
    const balance = credit ? Number(credit.balance_usd) : 0;
    const isContinuation = phase === "model" || phase === "method" || phase === "results";
    if (!credit || (isContinuation ? balance <= -5 : balance <= 0)) {
      return json(402, {
        error: "You've used up your analysis credit. Add credit to analyze more papers.",
      });
    }
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json(500, { error: "Server is not configured with an Anthropic API key." });
  }

  // --- 4. Stream the analysis, relaying progress as NDJSON ----------------
  const client = new Anthropic({ apiKey });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(ndjson(obj));
      send({ type: "progress", pct: 6, label: `${tier.label} analysis (${run.name}) — reading the paper (text + figures)…` });

      try {
        // NOTE: we deliberately do NOT use structured outputs (output_config.format
        // with json_schema) here. SPEC_SCHEMA is large and deeply nested, and the
        // API rejects it with "The compiled grammar is too large". Instead the
        // schema is embedded in the prompt and the response is parsed leniently.
        // Effort is capped by the hosting window, not by what the tier can do:
        // on a long window (Supabase Pro) Advanced runs Opus at full effort.
        const outputConfig = {};
        const effort = WALL_MS >= LONG_WINDOW_MS ? (run.effortLong || run.effort) : run.effort;
        if (effort) outputConfig.effort = effort;

        const maxTokens = run.model === "claude-haiku-4-5" ? 48000 : 64000;

        const schema = phase ? PHASE_SCHEMAS[phase] : SPEC_SCHEMA;
        const schemaBlock =
          "\n\nOUTPUT FORMAT (critical):\n" +
          "Respond with ONLY one JSON object — no markdown fences, no commentary before or after. " +
          "Valid JSON syntax: escape all newlines inside strings as \\n. " +
          "Keep it focused: for dense papers prefer 3-4 result figures and 3-4 blocks over exhaustive coverage. " +
          "It must validate against this JSON Schema:\n" +
          JSON.stringify(schema);

        // Validation feedback from the client's quality gate: the previous
        // attempt's generated code was test-run and failed (flat lines, dead
        // sliders, broken panels). Feed the exact problems back.
        const repairBlock =
          repair && typeof repair === "string"
            ? "\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED BY AUTOMATED VALIDATION. " +
              "Your generated code was executed and failed these checks:\n" +
              repair.slice(0, 4000) +
              "\nRegenerate correctly: every flagged block/panel/demo needs real, " +
              "visibly varying dynamics with sliders wired into the math. " +
              "Flat or constant output is a hard failure."
            : "";

        // Everything identical across the four phases goes in one cached
        // block; only what actually varies per phase is left uncached.
        const sharedPrompt = SYSTEM_PROMPT + hintsBlock(hints);
        const phasePrompt =
          (phase ? phaseInstruction(phase, contextSpec) : "") +
          repairBlock +
          schemaBlock;

        const requestParams = {
          model: run.model,
          max_tokens: maxTokens,
          ...(run.adaptive ? { thinking: { type: "adaptive" } } : {}),
          ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
                  // The PDF dominates the input bill — a paper is re-sent on
                  // every phase, and each page costs both text and image
                  // tokens. Cached, later phases re-read it at ~10% of the
                  // input price.
                  cache_control: CACHE,
                },
                // The paper's real code, when the reader provided it — cached
                // alongside the PDF for the same reason, and placed BEFORE the
                // instructions so it reads as source material.
                ...(code
                  ? [{
                      type: "text",
                      text:
                        "THE PAPER'S ACTUAL CODE (uploaded by the reader — this is the METHOD'S GROUND TRUTH; " +
                        "derive every computeJs kernel, constant and update rule from it rather than guessing " +
                        "from the paper's prose):\n\n" + code,
                      cache_control: CACHE,
                    }]
                  : []),
                // The system prompt is byte-identical on all four phases, so
                // it caches too — it was previously concatenated onto the
                // phase-specific text and re-billed at full price every call.
                { type: "text", text: sharedPrompt, cache_control: CACHE },
                { type: "text", text: phasePrompt },
              ],
            },
          ],
        };

        // Standard speed only: Opus fast mode is a gated preview and this
        // org's plan has a fast-mode limit of 0, so speed:"fast" 429s.
        const anthropicStream = client.messages.stream(requestParams);

        // Abort before the platform's own kill (see WALL_MS) so the client
        // gets a typed "timeout" error it can retry on a faster tier, rather
        // than a silent disconnect.
        let timedOut = false;
        const deadline = setTimeout(() => {
          timedOut = true;
          try { anthropicStream.abort(); } catch { /* already done */ }
        }, WALL_MS);

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

        let response;
        try {
          response = await anthropicStream.finalMessage();
        } catch (streamErr) {
          if (timedOut) {
            const e = new Error(
              "This stage of the analysis exceeded the server's time limit."
            );
            e.code = "timeout";
            throw e;
          }
          throw streamErr;
        } finally {
          clearTimeout(deadline);
        }

        if (response.stop_reason === "refusal") {
          throw new Error("The analyzer declined to process this document.");
        }
        if (response.stop_reason === "max_tokens") {
          throw new Error(
            "The analysis ran longer than the output budget allows. Try the Standard or Advanced level, or a shorter paper."
          );
        }

        send({ type: "progress", pct: 82, label: "Parsing the extracted methodology…" });
        // ALL text blocks, joined — not just the first. With adaptive thinking
        // the model sometimes emits a short lead-in block before the block
        // holding the JSON, and taking `find` gave us the lead-in alone.
        const answer = response.content
          .filter((b) => b.type === "text" && b.text)
          .map((b) => b.text)
          .join("")
          .trim();
        if (!answer) throw new Error("Empty response from the analyzer.");

        let spec;
        try {
          spec = parseSpecJson(answer);
        } catch (parseErr) {
          // Log the whole thing for the function logs, and hand the client a
          // description of what actually arrived — "could not be parsed" alone
          // made this impossible to diagnose from a bug report.
          console.error("spec parse failed", {
            phase: phase || "full",
            tier: tier.id,
            model: run.model,
            stopReason: response.stop_reason,
            length: answer.length,
            head: answer.slice(0, 400),
            tail: answer.slice(-400),
            reason: parseErr?.message,
          });
          const e = new Error(
            `The analyzer's response wasn't valid JSON (${answer.length} chars, ` +
            `stop reason "${response.stop_reason}"). Retrying usually fixes it.`
          );
          e.code = "parse";
          throw e;
        }

        // --- 5. Meter and deduct the real cost (owner is never charged) ----
        const cost = usageCostUsd(run, response.usage);

        // Where the money actually went, per phase. Without this the only
        // visible number is one total for the whole run, which isn't enough
        // to tell an input problem (cache misses) from an output problem
        // (too many generated tokens) — and they have opposite fixes.
        const u = response.usage || {};
        console.log("phase cost", JSON.stringify({
          phase: phase || "full",
          tier: tier.id,
          model: run.model,
          effort,
          costUsd: +cost.toFixed(4),
          inputTokens: u.input_tokens || 0,
          outputTokens: u.output_tokens || 0,
          cacheWriteTokens: u.cache_creation_input_tokens || 0,
          cacheReadTokens: u.cache_read_input_tokens || 0,
          // If this is 0 on phases 2-4, the PDF cache is not being hit and
          // the run is paying full input price four times over.
          cacheHit: (u.cache_read_input_tokens || 0) > 0,
        }));
        let newBalance = null;
        if (!isOwner && credit) {
          newBalance = Number(credit.balance_usd) - cost;
          await admin
            .from("credits")
            .update({ balance_usd: newBalance, updated_at: new Date().toISOString() })
            .eq("user_id", userId);
        }

        send({ type: "result", spec, cost: isOwner ? 0 : cost, remainingBalance: newBalance });
      } catch (err) {
        send({ type: "error", message: err?.message || String(err), code: err?.code || null });
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
 *  object in ```json fences, add a stray sentence, or emit slightly invalid
 *  JSON (unescaped newlines, trailing commas), and a response cut short by the
 *  output budget simply stops mid-structure. Each step below is a real failure
 *  mode seen in production, ordered cheapest first. */
function parseSpecJson(text) {
  const raw = text.trim();
  try { return JSON.parse(raw); } catch { /* fall through */ }

  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try { return JSON.parse(unfenced); } catch { /* fall through */ }

  // From the first "{", walk the text tracking string/escape state so braces
  // inside string values don't count. `lastIndexOf("}")` used here instead,
  // which swallows any prose after the object AND mis-spans if the model
  // emits two objects.
  const from = unfenced.indexOf("{");
  if (from === -1) throw new Error("no JSON object in the response");
  const body = unfenced.slice(from);

  let depth = 0, inStr = false, esc = false, endedAt = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { endedAt = i; break; } }
  }

  // Balanced object found: parse exactly it, ignoring anything either side.
  if (endedAt !== -1) {
    const balanced = body.slice(0, endedAt + 1);
    try { return JSON.parse(balanced); } catch { /* fall through */ }
    return JSON.parse(jsonrepair(balanced));
  }

  // Never closed — the response was truncated. jsonrepair closes the open
  // structures, which keeps everything the model did finish saying.
  return JSON.parse(jsonrepair(body));
}
