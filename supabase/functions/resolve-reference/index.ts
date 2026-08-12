// @ts-nocheck
/**
 * A citation, resolved to the paper it actually points at.
 *
 * Clicking "[12]" used to show the bibliography line the PDF prints and a
 * sentence about why it is cited. That is honest but thin: it answers "what
 * does this entry say" when the reader asked "what IS this paper".
 *
 * So this looks it up for real, in scholarly indexes, and only then explains
 * it. The split matters and is enforced structurally:
 *
 *   WHICH paper this is — a FACT. Semantic Scholar, then OpenAlex, then
 *   Crossref, in that order. A model never supplies it, and when all three
 *   come back empty the card says so rather than inventing a plausible paper.
 *   There is deliberately no web-search fallback: this deployment has no
 *   search key, and "let the model fill it in" is precisely the failure this
 *   product cannot afford.
 *
 *   WHY it is cited HERE — a reading of the citing sentence against the
 *   abstract that was found. That is the one part a model does, on the cheap
 *   tutor model, and it is told explicitly when the lookup found nothing so it
 *   cannot quietly describe a paper it has not been shown.
 *
 * FREE, like the section tutor: no credit is required and none is deducted.
 * The cost is bounded structurally instead — Haiku, one short answer, capped
 * input — and the client caches every resolution, so a second click on the
 * same marker costs nothing at all.
 */

import Anthropic from "npm:@anthropic-ai/sdk@^0.68.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { referenceExplainPrompt } from "../_shared/paperSpec.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ENTRY_CHARS = 800;
const MAX_CITING_CHARS = 1_200;
const MAX_OUTPUT_TOKENS = 320;
const EXPLAIN_MODEL = "claude-haiku-4-5";

/* Every upstream is keyless and rate-limited by politeness rather than a
 * token, so each call is given a short deadline and a failure is simply the
 * next source's turn. A reader waiting on a popover will not wait ten
 * seconds for Crossref to think about it. */
const LOOKUP_TIMEOUT_MS = 6_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "Sign in to look up references." });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json(401, { error: "Your session has expired — sign in again." });
  }

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON body." }); }

  const entry = String(body?.entry || "").replace(/\s+/g, " ").trim().slice(0, MAX_ENTRY_CHARS);
  const citing = String(body?.citing || "").replace(/\s+/g, " ").trim().slice(0, MAX_CITING_CHARS);
  const paperTitle = String(body?.paperTitle || "").trim().slice(0, 300);
  const explain = body?.explain !== false;
  if (entry.length < 12) {
    return json(400, { error: "That reference entry is too short to look up." });
  }

  // --- 1. WHICH paper is this? ---------------------------------------------
  const query = queryFromEntry(entry);
  let found = null;
  const tried = [];

  for (const source of [semanticScholar, openAlex, crossref]) {
    try {
      const hit = await source(query, entry);
      tried.push(source.name);
      if (hit) { found = hit; break; }
    } catch {
      tried.push(`${source.name}(failed)`);
    }
  }

  /* Crossref answers with metadata but rarely an abstract, and OpenAlex stores
   * abstracts in an inverted index rather than as text. When the winner has no
   * abstract, ask OpenAlex specifically for one by DOI before giving up — it
   * is one more keyless call and it is the difference between "what this paper
   * did" and "the title of this paper". */
  if (found && !found.abstract && found.doi) {
    try {
      const more = await openAlexByDoi(found.doi);
      if (more?.abstract) found = { ...found, abstract: more.abstract, source: `${found.source} + OpenAlex` };
    } catch { /* the card is still complete without it */ }
  }

  // --- 2. WHY is it cited here? --------------------------------------------
  let explanation = null;
  let explainError = null;
  if (explain) {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      explainError = "unconfigured";
    } else {
      try {
        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: EXPLAIN_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [{
            role: "user",
            content: referenceExplainPrompt({ citing, entry, resolved: found, paperTitle }),
          }],
        });
        explanation = (response.content || [])
          .filter((b) => b.type === "text" && b.text).map((b) => b.text).join("").trim() || null;
      } catch {
        explainError = "failed";
      }
    }
  }

  return json(200, {
    found: !!found,
    reference: found,
    explanation,
    explainError,
    /* What was asked and where — so a wrong card is diagnosable from the UI
     * rather than only from the function logs. */
    query,
    sources: tried,
  });
});

/* ---------------- turning a bibliography line into a query ----------------
 *
 * A printed entry is authors, then title, then venue, then a pile of volume
 * and page numbers, in one of a dozen house styles. The indexes match far
 * better on a title than on the whole soup, so the title is what we try to
 * isolate — and when the shape is unfamiliar, the whole entry is sent instead,
 * which every one of these APIs handles as a bibliographic query.
 */
function queryFromEntry(entry) {
  const clean = entry
    .replace(/^\[?\d{1,3}\]?[.)]?\s*/, "")          // leading "[12]" or "12."
    .replace(/\bdoi:\s*\S+/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();

  /* The title is usually the longest run between full stops that is neither an
   * author list nor a venue: several words, not mostly initials, no volume or
   * page numbers. Quoted titles are easier and are taken first. */
  const quoted = clean.match(/[“"]([^”"]{12,300})[”"]/);
  if (quoted) return quoted[1].trim();

  const parts = clean.split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
  const isAuthors = (s) => /^(?:[A-Z]\.\s*){1,4}/.test(s) || /,\s*(?:[A-Z]\.\s*){1,3}/.test(s);
  const isVenue = (s) => /\b(?:19|20)\d{2}\b|\bvol\.?\s*\d|\bpp?\.\s*\d|\bno\.?\s*\d/i.test(s);

  const candidates = parts.filter((s) =>
    s.split(/\s+/).length >= 4 && !isAuthors(s) && !isVenue(s));
  if (candidates.length) {
    return candidates.sort((a, b) => b.length - a.length)[0].slice(0, 300);
  }
  return clean.slice(0, 300);
}

/** Every upstream call goes through here: one deadline, one shape. */
async function get(url, headers = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent(), Accept: "application/json", ...headers },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function userAgent() {
  const mail = Deno.env.get("UNPAYWALL_EMAIL") || "openaccess@example.com";
  return `InteractivePaperPlayground/1.0 (mailto:${mail})`;
}

/**
 * Did we find the RIGHT paper, or just a paper?
 *
 * A title search always returns something, and a confidently wrong citation
 * card is worse than no card — the reader has no way to tell. So a hit only
 * counts when its title genuinely overlaps the query: most of the query's
 * distinctive words have to appear in it.
 */
function titleMatches(query, title) {
  const words = (s) => new Set(
    String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 3),
  );
  const q = words(query), t = words(title);
  if (q.size < 3 || !t.size) return false;
  let hits = 0;
  for (const w of q) if (t.has(w)) hits++;
  return hits / q.size >= 0.55;
}

async function semanticScholar(query) {
  const fields = "title,abstract,year,venue,authors,externalIds,url";
  const data = await get(
    `https://api.semanticscholar.org/graph/v1/paper/search?limit=3&fields=${fields}&query=${encodeURIComponent(query)}`,
  );
  const hit = (data?.data || []).find((p) => titleMatches(query, p?.title));
  if (!hit) return null;
  return {
    title: hit.title || null,
    abstract: hit.abstract || null,
    year: hit.year || null,
    venue: hit.venue || null,
    authors: (hit.authors || []).map((a) => a.name).filter(Boolean),
    doi: hit.externalIds?.DOI || null,
    url: hit.url || (hit.externalIds?.DOI ? `https://doi.org/${hit.externalIds.DOI}` : null),
    source: "Semantic Scholar",
  };
}

/** OpenAlex stores abstracts as {word: [positions]} — rebuild the text. */
function fromInverted(index) {
  if (!index || typeof index !== "object") return null;
  const slots = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions || []) slots[p] = word;
  }
  const text = slots.filter(Boolean).join(" ").trim();
  return text.length > 40 ? text : null;
}

function fromOpenAlexWork(w) {
  if (!w) return null;
  return {
    title: w.display_name || w.title || null,
    abstract: fromInverted(w.abstract_inverted_index),
    year: w.publication_year || null,
    venue: w.primary_location?.source?.display_name || w.host_venue?.display_name || null,
    authors: (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean),
    doi: (w.doi || "").replace(/^https?:\/\/doi\.org\//, "") || null,
    url: w.doi || w.id || null,
    source: "OpenAlex",
  };
}

async function openAlex(query) {
  const data = await get(
    `https://api.openalex.org/works?per-page=3&select=id,doi,display_name,publication_year,authorships,primary_location,abstract_inverted_index&search=${encodeURIComponent(query)}`,
  );
  const hit = (data?.results || []).find((w) => titleMatches(query, w?.display_name));
  return hit ? fromOpenAlexWork(hit) : null;
}

async function openAlexByDoi(doi) {
  const data = await get(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);
  return fromOpenAlexWork(data);
}

async function crossref(query, entry) {
  /* Crossref's bibliographic query is built for exactly this input — a printed
   * reference string — so it gets the whole entry rather than the extracted
   * title. It almost never carries an abstract, which is why the caller then
   * asks OpenAlex for one by DOI. */
  const data = await get(
    `https://api.crossref.org/works?rows=3&select=DOI,title,abstract,issued,container-title,author,URL&query.bibliographic=${encodeURIComponent(entry || query)}`,
  );
  const items = data?.message?.items || [];
  const hit = items.find((w) => titleMatches(query, Array.isArray(w?.title) ? w.title[0] : w?.title));
  if (!hit) return null;
  const title = Array.isArray(hit.title) ? hit.title[0] : hit.title;
  return {
    title: title || null,
    // Crossref abstracts arrive as JATS XML when they arrive at all.
    abstract: hit.abstract
      ? String(hit.abstract).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null
      : null,
    year: hit.issued?.["date-parts"]?.[0]?.[0] || null,
    venue: Array.isArray(hit["container-title"]) ? hit["container-title"][0] : null,
    authors: (hit.author || []).map((a) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
    doi: hit.DOI || null,
    url: hit.URL || (hit.DOI ? `https://doi.org/${hit.DOI}` : null),
    source: "Crossref",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
