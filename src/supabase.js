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
 * Sanitize the project URL down to a bare origin (`https://xxxx.supabase.co`).
 *
 * The Supabase project URL must have NO path. Secrets are commonly pasted with
 * a trailing slash, surrounding quotes, a stray newline, or — worst — an API
 * path like `…/rest/v1` (copied from the REST endpoint box instead of the
 * project URL). Any of these makes supabase-js build broken request paths such
 * as `…/rest/v1/auth/v1/signup`, which the server rejects with
 * "Invalid path specified in request URL". Collapsing to `URL.origin` strips the
 * path, query, trailing slash, and quotes in one shot.
 */
function cleanUrl(raw) {
  if (!raw) return "";
  const u = String(raw).trim().replace(/^["']|["']$/g, "").trim();
  try {
    return new URL(u).origin; // protocol + host only, no path/slash/query
  } catch {
    return u.replace(/\/+$/, ""); // no protocol → best-effort trim
  }
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

/* -------------------- the paper file itself --------------------
 * The reader's PDF is kept in a PRIVATE bucket so the paper's own text can be
 * the reading surface on every visit, not just in the tab that analyzed it.
 * Keys are `{user_id}/{uuid}.pdf` — the leading folder is what the storage RLS
 * policies match on (see the paper_storage migration).
 */

const PAPER_BUCKET = "papers";

/**
 * Upload one paper. Returns its storage key, or null if anything went wrong —
 * a failed upload must never fail the analysis that was already paid for; the
 * paper simply falls back to the summary-only view.
 */
export async function uploadPaperPdf(file) {
  if (!supabase || !file) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;
  const id = (crypto?.randomUUID?.() || String(Date.now()));
  const key = `${userData.user.id}/${id}.pdf`;
  const { error } = await supabase.storage
    .from(PAPER_BUCKET)
    .upload(key, file, { contentType: "application/pdf", upsert: false });
  if (error) { console.warn("Could not store the paper:", error.message); return null; }
  return key;
}

/**
 * Remove a stored paper.
 *
 * The paper is uploaded BEFORE the analysis runs, so the five phases can name
 * its key instead of re-sending the file five times. If the analysis then
 * fails there is no library row pointing at that object, and a paper the
 * reader never got an analysis for must not sit in storage — this is how it
 * goes away.
 */
export async function deletePaperPdf(pdfPath) {
  if (!supabase || !pdfPath) return;
  const { error } = await supabase.storage.from(PAPER_BUCKET).remove([pdfPath]);
  if (error) console.warn("Could not remove the stored paper:", error.message);
}

/**
 * A short-lived read URL for a stored paper. The bucket is private, so this is
 * the only way to open one — and it only succeeds for the object's owner.
 */
export async function signedPaperUrl(pdfPath, expiresInSeconds = 60 * 60) {
  if (!supabase || !pdfPath) return null;
  const { data, error } = await supabase.storage
    .from(PAPER_BUCKET)
    .createSignedUrl(pdfPath, expiresInSeconds);
  if (error) { console.warn("Could not open the stored paper:", error.message); return null; }
  return data?.signedUrl || null;
}

/* -------------------- saved analyses (paper library) --------------------
 * Every analyzed paper is stored against the signed-in account so it can be
 * reopened later for free instead of burning credit to re-analyze it. The
 * fully-hydrated spec (including cropped figure images) is kept as jsonb;
 * row-level security scopes every row to its owner. See the `analyses`
 * migration.
 */

/** Persist a finished analysis. Returns the stored row (id + metadata).
 *  `pdfPath` is the storage key from uploadPaperPdf, or null when the paper
 *  wasn't stored (upload failed, or the user isn't signed in). */
export async function saveAnalysis(spec, pdfPath = null) {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;
  const title = spec?.meta?.title?.trim() || "Untitled paper";
  const authors = spec?.meta?.authors?.trim() || "";
  const { data, error } = await supabase
    .from("analyses")
    .insert({ user_id: userData.user.id, title, authors, spec, pdf_path: pdfPath })
    .select("id, title, authors, created_at")
    .single();
  if (error) { console.warn("Could not save analysis:", error.message); return null; }
  return data;
}

/**
 * Overwrite a saved analysis' spec in place.
 *
 * Used when a reader makes a figure live: that read costs credit, so its
 * panels have to survive closing the paper rather than being re-bought on
 * every reopen. Only the spec changes — title, authors and the stored PDF
 * belong to the original analysis and are left alone.
 */
export async function updateAnalysisSpec(id, spec) {
  if (!supabase || !id) return false;
  // `paperPdf` is a per-session object/signed URL, never storage. Persisting it
  // would save a link that is dead by the next open.
  const { paperPdf, ...persisted } = spec || {};
  const { error } = await supabase
    .from("analyses")
    .update({ spec: persisted })
    .eq("id", id);
  if (error) { console.warn("Could not update analysis:", error.message); return false; }
  return true;
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

/**
 * Fetch one saved analysis' spec by id, with its stored paper resolved to a
 * signed URL and hung on `spec.paperPdf` — the same field the bundled sample
 * papers use, so the reader can't tell the two apart. Analyses saved before
 * paper storage existed simply have no `pdf_path` and open summary-only.
 */
export async function getAnalysis(id) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("analyses")
    .select("spec, pdf_path")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const spec = data.spec;
  if (spec) {
    // The row this spec came from, so an on-demand figure digitization can be
    // written back to it instead of being lost on close.
    spec.analysisId = id;
    if (data.pdf_path) {
      const url = await signedPaperUrl(data.pdf_path);
      if (url) spec.paperPdf = url;
    }
  }
  return spec;
}

/**
 * Delete a saved analysis by id — INCLUDING its stored PDF.
 *
 * The upload consent says the paper is deleted with the analysis, so the
 * storage object has to go first: if the row were removed first and the object
 * delete then failed, we'd have lost the only pointer to an orphaned file the
 * user believes is gone.
 */
export async function deleteAnalysis(id) {
  if (!supabase) return;
  const { data } = await supabase
    .from("analyses")
    .select("pdf_path")
    .eq("id", id)
    .maybeSingle();
  if (data?.pdf_path) {
    const { error } = await supabase.storage.from(PAPER_BUCKET).remove([data.pdf_path]);
    if (error) console.warn("Could not delete the stored paper:", error.message);
  }
  await supabase.from("analyses").delete().eq("id", id);
}
