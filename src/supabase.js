/**
 * Supabase client + auth helpers.
 *
 * Configuration comes from build-time env vars (Vite inlines anything prefixed
 * VITE_ at build). The anon key is a PUBLIC key by design — it is safe to ship
 * in a static site; row-level security on the Supabase side is what protects
 * data. Never put the service_role key here.
 *
 *   VITE_SUPABASE_URL       e.g. https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY  the project's anon/public key
 *
 * When these are NOT set, auth is disabled and the app runs open — so local dev
 * and the current deployment keep working until you wire Supabase up (see
 * README → Authentication).
 */

import { createClient } from "@supabase/supabase-js";

/**
 * Sanitize the project URL. Secrets pasted from the dashboard often arrive with
 * a trailing slash, surrounding quotes, or a stray newline — any of which makes
 * supabase-js build request paths like `https://x.supabase.co//auth/v1/signup`
 * and fail with "Invalid path specified in request URL". Strip all of that so
 * the value is always a clean origin: `https://xxxx.supabase.co`.
 */
function cleanUrl(raw) {
  if (!raw) return "";
  let u = String(raw).trim().replace(/^["']|["']$/g, "").trim();
  u = u.replace(/\/+$/, ""); // drop trailing slashes
  return u;
}

const url = cleanUrl(import.meta.env.VITE_SUPABASE_URL);
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "").trim();

export const authEnabled = Boolean(url && anonKey);

export const supabase = authEnabled ? createClient(url, anonKey) : null;

/** Subscribe to auth-state changes. Returns an unsubscribe function. */
export function onAuthChange(cb) {
  if (!supabase) { cb(null); return () => {}; }
  supabase.auth.getSession().then(({ data }) => cb(data.session ?? null));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session ?? null));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  // If email confirmation is on, there's no session yet.
  return { needsConfirmation: !data.session };
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

/** The current session's access token, or "" if signed out — sent to the
 *  analyze-paper edge function so it can identify the caller. */
export async function getAccessToken() {
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

/** Remaining USD credit for the signed-in user (null if unknown/signed out). */
export async function getBalance() {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;
  const { data, error } = await supabase
    .from("credits")
    .select("balance_usd")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error || !data) return null;
  return Number(data.balance_usd);
}

/** Base URL for this project's edge functions — every Supabase project
 *  serves them at {PROJECT_URL}/functions/v1/{function-name}, so no
 *  separate env var is needed. */
export const functionsUrl = authEnabled ? `${url}/functions/v1` : "";

export const supabaseAnonKey = anonKey || "";

/* -------------------- saved analyses (paper library) --------------------
 * Every analyzed paper is stored against the signed-in account so it can be
 * reopened later for free instead of burning credit to re-analyze it. The
 * fully-hydrated spec (including cropped figure images) is kept as jsonb;
 * row-level security scopes every row to its owner. See the `analyses`
 * migration.
 */

/** Persist a finished analysis. Returns the stored row (id + metadata). */
export async function saveAnalysis(spec) {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;
  const title = spec?.meta?.title?.trim() || "Untitled paper";
  const authors = spec?.meta?.authors?.trim() || "";
  const { data, error } = await supabase
    .from("analyses")
    .insert({ user_id: userData.user.id, title, authors, spec })
    .select("id, title, authors, created_at")
    .single();
  if (error) { console.warn("Could not save analysis:", error.message); return null; }
  return data;
}

/** List the signed-in user's saved analyses (newest first), metadata only. */
export async function listAnalyses() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("analyses")
    .select("id, title, authors, created_at")
    .order("created_at", { ascending: false });
  if (error) { console.warn("Could not list analyses:", error.message); return []; }
  return data || [];
}

/** Fetch one saved analysis' full spec by id. */
export async function getAnalysis(id) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("analyses")
    .select("spec")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data.spec;
}

/** Delete a saved analysis by id. */
export async function deleteAnalysis(id) {
  if (!supabase) return;
  await supabase.from("analyses").delete().eq("id", id);
}
