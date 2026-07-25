/**
 * Client side of "paste a DOI instead of hunting for the PDF".
 *
 * `resolveDoi` asks the resolve-doi edge function what the paper is and whether
 * an open-access copy exists; `fetchResolvedPdf` pulls that copy through the
 * same function (publishers send no CORS headers, so the browser can't fetch it
 * itself) and hands back a File the normal upload path can swallow.
 *
 * Paywalled papers stop here by design — the reader gets a hand-off to their own
 * library instead, and downloads it themselves. See buildProxyUrl.
 */

import { getAccessToken, functionsUrl, supabaseAnonKey } from "./supabase.js";

export const doiConfigured = Boolean(functionsUrl);

const PROXY_KEY = "paper-playground-library-proxy";

async function callResolver(payload, asBlob = false) {
  if (!functionsUrl) throw new Error("DOI lookup isn't configured on this deployment.");
  const token = await getAccessToken();
  const res = await fetch(`${functionsUrl}/resolve-doi`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (asBlob && res.ok) return res.blob();

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(data?.error || `Lookup failed (${res.status}).`);
  return data;
}

/** DOI / arXiv id / article link → { title, authors, year, journal, isOa, ticket, landingUrl }. */
export function resolveDoi(query) {
  return callResolver({ doi: String(query || "").trim() });
}

/** Pull the resolved open-access PDF down as a File for the analyzer. */
export async function fetchResolvedPdf(resolved) {
  if (!resolved?.ticket) throw new Error("No open-access copy to download.");
  const blob = await callResolver({ ticket: resolved.ticket }, true);
  if (blob.type && !blob.type.includes("pdf")) {
    // The function returns JSON on failure; surface its message.
    const text = await blob.text();
    let msg = "That link didn't give a PDF.";
    try { msg = JSON.parse(text)?.error || msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  const name = `${(resolved.doi || resolved.title || "paper").replace(/[^\w.-]+/g, "-").slice(0, 60)}.pdf`;
  return new File([blob], name, { type: "application/pdf" });
}

/* ---------------- library hand-off (the paywalled case) ---------------- */

/** The reader's own EZproxy/OpenAthens prefix, remembered between visits. */
export function getLibraryProxy() {
  try { return localStorage.getItem(PROXY_KEY) || ""; } catch { return ""; }
}
export function setLibraryProxy(prefix) {
  try {
    if (prefix) localStorage.setItem(PROXY_KEY, prefix);
    else localStorage.removeItem(PROXY_KEY);
  } catch { /* private mode — the input still works for this session */ }
}

/**
 * Build the "open through my library" link. This is just the reader's own proxy
 * prefix in front of the article's URL — THEY authenticate, in their own
 * browser, in their own session. Nothing here sees a credential, and nothing
 * automated ever touches the publisher.
 */
export function buildProxyUrl(prefix, articleUrl) {
  const p = String(prefix || "").trim();
  if (!p || !articleUrl) return null;
  // Both shapes are common: "…/login?url=" (append) and "…ezproxy.x.edu" (host suffix).
  if (/[?&](url|qurl)=$/i.test(p)) return p + encodeURIComponent(articleUrl);
  if (/\/login$/i.test(p)) return `${p}?url=${encodeURIComponent(articleUrl)}`;
  return `${p.replace(/\/+$/, "")}/login?url=${encodeURIComponent(articleUrl)}`;
}
