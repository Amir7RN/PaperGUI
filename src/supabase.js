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

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
