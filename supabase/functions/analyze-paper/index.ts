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

import Anthropic, { toFile } from "npm:@anthropic-ai/sdk@^0.68.0";
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

/**
 * The paper goes to Anthropic by file_id, not as base64 in the request body.
 *
 * Base64-in-JSON was quietly the most expensive thing this function did. A
 * 13 MB PDF meant holding the bytes, a 13-million-character intermediate
 * string, an 18-million-character btoa() result, and then the SDK's serialized
 * request body containing that same 18 MB again — roughly 100 MB of live
 * strings and several seconds of pure encoding CPU, all before a single token
 * was billed. Supabase kills the isolate for either (the reader sees "not
 * having enough compute resources"), and it did, on a 13 MB paper.
 *
 * Uploading the storage Blob straight to the Files API skips every one of
 * those copies: the bytes stream out as multipart and the request body carries
 * a short id. See resolveFileId below for why the id is then cached.
 */
const FILES_BETA = "files-api-2025-04-14";

/** Only the inline fallback still carries base64; ~32MB decoded. */
const MAX_PDF_BASE64_CHARS = 44 * 1024 * 1024;

/** A PDF this big is a scan, not a paper — and would price like one. */
const MAX_PDF_BYTES = 64 * 1024 * 1024;

/** Where one stored paper's Anthropic file id is remembered. Lives beside the
 *  PDF, so it inherits the same per-user folder (and the same RLS rule). */
const fileIdKey = (pdfPath) => `${pdfPath}.anthropic-file.json`;

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

  const { tierId, hints, phase, contextSpec, repair, codeText, pdfPath } = body || {};

  /* The paper reaches this function one of two ways.
   *
   * `pdfPath` is the normal one: the browser uploads the PDF to private
   * storage ONCE, and every later purchase — a section unlock, a figure — just
   * names it. The old inline route pushed the whole base64 paper back up the
   * reader's uplink on every call, so a 20 MB paper became a 100 MB+ upload
   * over the life of an analysis: slow on any home connection, and exactly
   * what was dropping mid-flight and failing runs that had already been paid
   * for. Reading it here instead is a same-region fetch measured in
   * milliseconds.
   *
   * `pdfBase64` stays supported for callers with nothing stored (a failed
   * upload, a deployment without the papers bucket) so analysis never becomes
   * contingent on storage.
   */
  const pdfBase64 = body?.pdfBase64;
  const useStored = !pdfBase64 && typeof pdfPath === "string" && !!pdfPath;
  /* Storage keys are `{user_id}/{uuid}.pdf`. This function holds the service
   * role key, which bypasses row-level security — so ownership has to be
   * checked HERE. Without it, any signed-in caller could name another
   * account's key and have their paper read back to them. */
  if (useStored && !pdfPath.startsWith(`${userId}/`)) {
    return json(403, { error: "That paper doesn't belong to this account." });
  }
  if (!useStored && (!pdfBase64 || typeof pdfBase64 !== "string")) {
    return json(400, { error: "No paper was supplied." });
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
  // Only the inline fallback is bounded by the 32MB request limit; a stored
  // paper is checked against MAX_PDF_BYTES in resolveFileId instead.
  if (!useStored && pdfBase64.length > MAX_PDF_BASE64_CHARS) {
    return json(400, { error: "PDF is too large (32MB API limit)." });
  }
  if (phase && !PHASE_SCHEMAS[phase]) {
    return json(400, { error: `Unknown analysis phase "${phase}".` });
  }
  /* The results phase used to REQUIRE the pipeline, because it ran fourth of
   * five and the method phase had always gone before it. Sections are now
   * unlocked one at a time, in whatever order the reader wants, so demanding
   * the pipeline here would mean "you may only buy the figure tours after
   * buying the method lab" — a purchase order nobody asked for. It reads
   * better with the pipeline and is perfectly valid without it: a paper with
   * no pipeline was always allowed to reach this phase with blocks: []. */
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

    /* Every call to this function is now ONE deliberate purchase — the fast
     * first pass, or one section a reader unlocked by pressing a button with a
     * price on it. There is no longer a five-phase run that could die half-paid
     * partway through, which is what the old overdraft allowance existed to
     * prevent, so the rule is simply: positive balance or nothing. */
    const balance = credit ? Number(credit.balance_usd) : 0;
    if (!credit || balance <= 0) {
      return json(402, {
        error: "You've used up your analysis credit. Add credit to analyze more papers.",
      });
    }
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json(500, { error: "Server is not configured with an Anthropic API key." });
  }
  const client = new Anthropic({ apiKey });

  /* Hand the paper to the analyzer AFTER the balance check — this uploads real
   * bytes, and a caller who is about to be told they're out of credit
   * shouldn't move a 13 MB file first. */
  let pdfFileId = null;
  if (useStored) {
    try {
      pdfFileId = await resolveFileId(client, admin, pdfPath);
    } catch (err) {
      const status = err?.status || 0;
      console.error("paper handoff failed", { pdfPath, status, message: err?.message });
      if (status === 404) {
        return json(404, { error: "The stored paper couldn't be read — re-upload it and try again." });
      }
      if (status === 413) {
        return json(413, { error: err.message });
      }
      return json(502, { error: "The paper couldn't be handed to the analyzer. Try again in a moment." });
    }
  }

  // --- 4. Stream the analysis, relaying progress as NDJSON ----------------
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(ndjson(obj));
      /* The model's name is never in a label the reader sees — it is an
       * implementation detail, it dates the product, and it turns a progress
       * line into a vendor advertisement. `run.name` stays in the cost log. */
      send({ type: "progress", pct: 6, label: `${tier.label} analysis — reading the paper (text + figures)…` });

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
          // The Files API is still beta, so the whole call goes through the
          // beta endpoint. It is a superset — adaptive thinking, effort and
          // cache_control all behave identically here.
          betas: [FILES_BETA],
          ...(run.adaptive ? { thinking: { type: "adaptive" } } : {}),
          ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: pdfFileId
                    ? { type: "file", file_id: pdfFileId }
                    : { type: "base64", media_type: "application/pdf", data: pdfBase64 },
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
        const anthropicStream = client.beta.messages.stream(requestParams);

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

/**
 * The Anthropic file id for one stored paper, uploading it if this is the
 * first time we've seen it.
 *
 * The id is remembered in a tiny JSON object beside the PDF, and that matters
 * for two reasons. The obvious one is that re-uploading 13 MB on every unlock
 * is waste. The load-bearing one is prompt caching: the cache is keyed on the
 * request prefix, so a paper referenced by a DIFFERENT id each call looks like
 * a different document every time and every section unlock would re-read the
 * whole PDF at full input price. One stable id per paper keeps the ~10% cache
 * reads this app's economics were built on.
 *
 * Deleting a paper drops the pointer but leaves the uploaded file with
 * Anthropic (a browser can't delete it — that needs the API key, which only
 * lives here). At ~13 MB against a 100 GB org allowance that is thousands of
 * papers of headroom, so it is left alone rather than reaped on a timer.
 */
async function resolveFileId(client, admin, pdfPath) {
  const sidecar = fileIdKey(pdfPath);

  // Remembered from an earlier phase? Confirm it still exists before betting
  // a paid call on it — a stale id would otherwise fail every future unlock
  // for this paper, permanently, with no way for the reader to clear it.
  const { data: memo } = await admin.storage.from("papers").download(sidecar);
  if (memo) {
    try {
      const { fileId } = JSON.parse(await memo.text());
      if (fileId) {
        await client.beta.files.retrieveMetadata(fileId, { betas: [FILES_BETA] });
        return fileId;
      }
    } catch {
      // Unreadable or no longer on Anthropic's side — fall through and re-upload.
    }
  }

  const { data: file, error: dlErr } = await admin.storage.from("papers").download(pdfPath);
  if (dlErr || !file) {
    const e = new Error("stored paper not found");
    e.status = 404;
    throw e;
  }
  if (file.size > MAX_PDF_BYTES) {
    const e = new Error("PDF is too large to analyze.");
    e.status = 413;
    throw e;
  }

  const uploaded = await client.beta.files.upload({
    file: await toFile(file, "paper.pdf", { type: "application/pdf" }),
    betas: [FILES_BETA],
  });

  // Best effort: if the memo can't be written the analysis still runs, it just
  // re-uploads next time. Never fail a paid call over a cache write.
  try {
    await admin.storage.from("papers").upload(
      sidecar,
      new Blob([JSON.stringify({ fileId: uploaded.id, at: Date.now() })], {
        type: "application/json",
      }),
      { upsert: true, contentType: "application/json" },
    );
  } catch (err) {
    console.warn("could not memoize file id", err?.message);
  }

  return uploaded.id;
}

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
