// @ts-nocheck
/**
 * Narration backend for the in-app "explainer video" on sections 4 & 5.
 *
 * The client sends ONE short narration line (a scene) plus a voice id; this
 * function returns an mp3 for it, generated with OpenAI TTS. Audio is cached in
 * Supabase Storage keyed by a hash of (text + voice + model), so a given
 * paper's narration is synthesized ONCE and every subsequent viewer — of any
 * paper, on any account — streams the cached file for free. That is what makes
 * the per-paper video scale to many customers without contention: nothing is
 * tied to a single external account at runtime, unlike NotebookLM.
 *
 * FREE during the feedback phase: authenticated users are not charged and no
 * credit balance is required. Cost is bounded structurally: the cheapest TTS
 * tier, a hard input-length cap, and the storage cache (pay once per line).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "narration";
const TTS_MODEL = "tts-1";                 // cheapest OpenAI TTS tier
const MAX_INPUT_CHARS = 900;               // one scene line; bounds cost
const VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
const DEFAULT_VOICE = "onyx";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // --- authenticate (sign-in required; no credit charge in the free phase) ---
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "Sign in to play the narrated explainer." });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json(401, { error: "Your session has expired — sign in again." });
  }

  // --- validate --------------------------------------------------------------
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON body." }); }

  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_INPUT_CHARS) : "";
  const voice = VOICES.has(body?.voice) ? body.voice : DEFAULT_VOICE;
  if (!text) return json(400, { error: "Missing narration text." });

  const key = `${await sha256(`${TTS_MODEL}|${voice}|${text}`)}.mp3`;

  // --- 1) serve from the storage cache if this line was synthesized before ---
  await ensureBucket(admin);
  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  const head = await fetch(publicUrl, { method: "HEAD" });
  if (head.ok) return json(200, { url: publicUrl, cached: true });

  // --- 2) otherwise synthesize with OpenAI TTS, cache, and return -------------
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return json(500, { error: "Server is not configured with an OpenAI API key." });

  let audio;
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: TTS_MODEL, voice, input: text, response_format: "mp3" }),
    });
    if (!res.ok) {
      if (res.status === 429) return json(429, { error: "Narration is busy — try again in a moment." });
      return json(502, { error: "Text-to-speech failed — try again." });
    }
    audio = new Uint8Array(await res.arrayBuffer());
  } catch {
    return json(502, { error: "Text-to-speech request failed — try again." });
  }

  const up = await admin.storage.from(BUCKET).upload(key, audio, {
    contentType: "audio/mpeg",
    cacheControl: "31536000",
    upsert: true,
  });
  if (up.error) {
    // Caching failed but we still have the bytes — return them inline so the
    // player works; it just won't be cached for the next viewer.
    return json(200, { dataUrl: `data:audio/mpeg;base64,${b64(audio)}`, cached: false });
  }
  return json(200, { url: publicUrl, cached: false });
});

async function ensureBucket(admin) {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) {
    await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  }
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
