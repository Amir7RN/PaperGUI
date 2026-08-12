/**
 * Client side of live reference resolution (see supabase/functions/resolve-reference).
 *
 * One job beyond calling the endpoint: never ask twice. A reader chasing
 * citations through a paper will click the same "[12]" three or four times —
 * once in the introduction, again where the method leans on it, again in the
 * discussion — and the answer cannot change between those clicks. So every
 * resolution is memoised for the session and written to localStorage, keyed by
 * the bibliography entry itself.
 *
 * Keyed on the ENTRY, not on the citation number: "[12]" means different
 * papers in different documents, while the printed entry identifies one paper
 * anywhere it appears. The "why here" half varies with the citing sentence, so
 * that half is keyed on both.
 */

import { getAccessToken, functionsUrl, supabaseAnonKey } from "./supabase.js";

const STORE = "paper-playground-refs-v1";
/* Long: a reference's metadata does not change, and re-resolving it costs a
 * round trip to three scholarly APIs for an answer we already had. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
/* localStorage is shared with the phase cache, the notebook, highlights and
 * the layout. An abstract is a couple of kB, so this holds a few hundred. */
const MAX_CHARS = 700_000;

const memory = new Map();

const keyOf = (entry, citing) =>
  `${String(entry || "").replace(/\s+/g, " ").trim().slice(0, 200)}|${String(citing || "").slice(0, 80)}`;

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return {};
    const all = JSON.parse(raw);
    const now = Date.now();
    let changed = false;
    for (const [k, v] of Object.entries(all)) {
      if (!v?.at || now - v.at > TTL_MS) { delete all[k]; changed = true; }
    }
    if (changed) localStorage.setItem(STORE, JSON.stringify(all));
    return all;
  } catch { return {}; }
}

function remember(key, value) {
  memory.set(key, value);
  try {
    const all = loadStore();
    all[key] = { at: Date.now(), value };
    let text = JSON.stringify(all);
    // Over budget: drop the oldest until it fits. Losing a cached lookup costs
    // one round trip, so this never needs to be cleverer than that.
    while (text.length > MAX_CHARS) {
      const oldest = Object.entries(all).sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0))[0];
      if (!oldest || oldest[0] === key) break;
      delete all[oldest[0]];
      text = JSON.stringify(all);
    }
    localStorage.setItem(STORE, text);
  } catch { /* quota or private mode — the in-memory cache still works */ }
}

/** A resolution already in hand, or null. Lets the UI render instantly on a
 *  second click instead of flashing a spinner at an answer it already has. */
export function cachedReference(entry, citing) {
  const key = keyOf(entry, citing);
  if (memory.has(key)) return memory.get(key);
  const hit = loadStore()[key];
  if (hit?.value) { memory.set(key, hit.value); return hit.value; }
  return null;
}

/**
 * Resolve one reference and explain why it is cited here.
 *
 * @param entry       the bibliography line as the paper prints it
 * @param citing      the sentence in this paper that cites it
 * @param paperTitle  the paper being read
 * @returns { found, reference, explanation, explainError, sources }
 *
 * Throws with a readable message on transport failure. A LOOKUP that finds
 * nothing is NOT a failure — it resolves with found:false, and the card says
 * so, which is the honest outcome and is cached like any other.
 */
export async function resolveReference({ entry, citing, paperTitle }) {
  if (!functionsUrl) {
    /* Typed, not just worded: a deployment with no backend is a different
     * thing from a lookup that failed, and telling the reader the databases
     * were unreachable when nothing was ever asked is simply untrue. */
    const e = new Error("Reference lookup isn't configured for this deployment.");
    e.code = "config";
    throw e;
  }
  const key = keyOf(entry, citing);
  const cached = cachedReference(entry, citing);
  if (cached) return cached;

  const token = await getAccessToken();
  if (!token) {
    const e = new Error("Sign in (free) to look this reference up.");
    e.code = "auth";
    throw e;
  }

  const res = await fetch(`${functionsUrl}/resolve-reference`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ entry, citing, paperTitle }),
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const e = new Error(data?.error || `Reference lookup failed (${res.status}).`);
    if (res.status === 401) e.code = "auth";
    throw e;
  }

  remember(key, data);
  return data;
}
