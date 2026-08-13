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

  /* THE ENTRY'S OWN IDENTIFIERS COME FIRST.
   *
   * Modern bibliographies print the DOI or the arXiv id right there in the
   * line, and when they do there is nothing to search for: it names the paper
   * exactly. Every search below is a guess ranked by title overlap and can
   * pick the wrong paper; an identifier cannot. Reaching for it first is both
   * more accurate and one round trip instead of three.
   */
  const doi = doiFromEntry(entry);
  const arxivId = arxivIdFromEntry(entry);
  if (doi) {
    for (const byId of [openAlexByDoi, crossrefFullByDoi, semanticScholarFullByDoi]) {
      try {
        const hit = await byId(doi);
        if (hit?.title) { found = hit; tried.push(`${byId.name}(doi)`); break; }
      } catch { tried.push(`${byId.name}(doi failed)`); }
    }
  }
  if (!found && arxivId) {
    try {
      const hit = await arxivById(arxivId);
      if (hit) { found = hit; tried.push("arxivById"); }
    } catch { tried.push("arxivById(failed)"); }
  }

  /* OPENALEX FIRST among the searches.
   *
   * Semantic Scholar has the better abstracts, but its keyless search endpoint
   * is aggressively rate-limited and answers 429 most of the time from a
   * shared address — measured, not assumed. Leading with it meant nearly every
   * lookup spent its first call getting refused. OpenAlex is keyless, has no
   * practical rate limit at this volume, and covers essentially the same
   * literature; Semantic Scholar then gets its turn, and Crossref (whose
   * bibliographic query is built for exactly this input) closes it out.
   *
   * Europe PMC and arXiv follow, and they are not redundant. A preprint that
   * was never formally published has no DOI in Crossref and frequently no
   * OpenAlex record either, and a great many method papers are cited in
   * exactly that state — those lookups came back empty and the card said "not
   * found" about a paper anyone could read in thirty seconds. Europe PMC
   * covers the biomedical literature (with real abstracts) that the general
   * indexes cover thinly.
   */
  if (!found) {
    for (const source of [openAlex, semanticScholar, crossref, europePmc, arxivSearch]) {
      try {
        const hit = await source(query, entry);
        tried.push(source.name);
        if (hit) { found = hit; break; }
      } catch {
        tried.push(`${source.name}(failed)`);
      }
    }
  }

  /* An abstract is what turns "this is a paper called X" into "this is what
   * that paper did", so a hit without one is worth one more round trip. Each
   * index holds abstracts the others don't: OpenAlex has them as an inverted
   * index and often not at all, Crossref rarely, Semantic Scholar usually.
   * Asked by DOI, which is a direct lookup rather than a search. */
  if (found && !found.abstract && (found.doi || arxivId)) {
    const fills = [];
    if (found.doi) fills.push(semanticScholarByDoi, openAlexByDoi, crossrefByDoi, europePmcByDoi);
    // A published paper's arXiv preprint carries the same abstract, and arXiv
    // always has one — it is the last thing worth trying before giving up.
    if (arxivId) fills.push(() => arxivById(arxivId));
    for (const fill of fills) {
      try {
        const more = await fill(found.doi);
        if (more?.abstract) {
          found = { ...found, abstract: more.abstract, source: `${found.source} + ${more.source}` };
          tried.push(`${fill.name || "arxiv"}(abstract)`);
          break;
        }
      } catch { /* the card is still complete without it */ }
    }
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

  // A quoted title needs no guessing.
  const quoted = clean.match(/[“"]([^”"]{12,300})[”"]/);
  if (quoted) return quoted[1].trim();

  const isAuthors = (s) => {
    if (/^(?:[A-Z]\.\s*){1,4}[A-Z]/.test(s)) return true;              // "R.J. Hyndman"
    if (/^[A-Z][\p{L}'’-]+,?\s+(?:[A-Z]\.\s*){1,4}$/u.test(s)) return true;  // "Hyndman, R.J."
    if (/^(?:[A-Z]\.\s*){1,4}$/.test(s)) return true;
    /* "et al" only ever appears in an author list, and Vancouver style —
     * "Vaswani A, Shazeer N, Parmar N, et al" — is otherwise indistinguishable
     * from a title by shape: no periods inside the initials, so none of the
     * tests above fire, and it is longer than the real title that follows it.
     * It won on length and the lookup missed. */
    if (/\bet\s+al\b/i.test(s)) return true;
    // Mostly bare initials ("Vaswani A, Shazeer N, Parmar N") is an author run.
    const toks = s.split(/\s+/).filter(Boolean);
    // "R.," and "L.K.," carry two punctuation marks once a comma split has
    // already run over them, so one optional mark is not enough.
    const initials = toks.filter((t) => /^[A-Z]{1,3}[.,;]{0,2}$/.test(t) || /^(?:[A-Z]\.){2,3},?$/.test(t)).length;
    return toks.length >= 4 && initials / toks.length >= 0.33;
  };
  const isVenue = (s) =>
    /\b(?:19|20)\d{2}\b|\bvol\.?\s*\d|\bpp?\.\s*\d|\bno\.?\s*\d|\b\d+\s*\(\d+\)/i.test(s);
  const usable = (s) => {
    const words = s.split(/\s+/).filter(Boolean);
    return words.length >= 4 && words.length <= 40 && !isAuthors(s) && !isVenue(s);
  };

  /* SPLIT ON COMMAS FIRST, then on full stops.
   *
   * Which separator a bibliography uses between its fields decides everything
   * here, and the two common styles disagree. Splitting only on full stops on
   * an IEEE-style entry — "R.J. Hyndman, R.A. Ahmed, …, Optimal combination
   * forecasts for hierarchical time series, Comput. Statist. Data Anal. 55
   * (2011)" — cuts inside every initial and leaves one enormous fragment
   * carrying the last author, the title AND the start of the journal name.
   * That fragment was what got sent as the query, and it matched nothing.
   *
   * Trying both splits and keeping the best title-shaped candidate handles
   * both styles without having to detect which one is in use.
   */
  const splitBy = (sep) => clean
    .split(sep)
    .map((part) => part.trim().replace(/[.,;]\s*$/, ""))
    .filter(usable);

  /* The two splits are tried IN ORDER, not pooled.
   *
   * Pooling and taking the longest candidate looks equivalent and is not: on
   * an IEEE-style entry the full-stop split cuts inside every initial and
   * leaves "Shang, Optimal combination forecasts for hierarchical time series,
   * Comput" — nine words, where the correct comma-split title is seven. The
   * wrong fragment wins on length every time, and it matches nothing.
   *
   * Commas separate the fields in the styles that put the title in the middle,
   * so they are asked first; full stops are the fallback for entries that use
   * them as the field separator instead. */
  const candidates = splitBy(/\s*,\s*/);
  const use = candidates.length ? candidates : splitBy(/\.\s+/);
  if (!use.length) return clean.slice(0, 300);

  /* Longest usable segment wins; ties go to the EARLIER one.
   *
   * The tiebreak is doing real work. "Vaswani A, … et al. Attention is all you
   * need. Adv Neural Inf Process Syst. 2017;30" leaves two five-word
   * candidates — the title and the abbreviated journal — and on a length
   * tiebreak the journal wins by two characters and the lookup searches for
   * "Adv Neural Inf Process Syst". Every citation style in use puts the title
   * before the venue, so position settles it correctly and for a reason. */
  const order = new Map(use.map((s, i) => [s, i]));
  use.sort((a, b) =>
    b.split(/\s+/).length - a.split(/\s+/).length || order.get(a) - order.get(b));
  return use[0].slice(0, 300);
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
  return `SciLoupe/1.0 (+https://sciloupe.com; mailto:${mail})`;
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
  /* Three letters, not four. "Attention is all you need" has exactly one word
   * longer than four letters, so a four-letter floor left two comparable words
   * and the guard below rejected the correct paper outright. Short titles are
   * common and this is the population the check exists to serve. */
  const words = (s) => new Set(
    String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 2),
  );
  const q = words(query), t = words(title);
  if (q.size < 2 || !t.size) return false;
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

/** One paper by DOI, for the abstract the search hit didn't carry. */
async function semanticScholarByDoi(doi) {
  const data = await get(
    `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=abstract,title`,
  );
  return data?.abstract ? { abstract: data.abstract, source: "Semantic Scholar" } : null;
}

async function crossrefByDoi(doi) {
  const data = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  const raw = data?.message?.abstract;
  if (!raw) return null;
  // Crossref abstracts arrive as JATS XML when they arrive at all.
  const text = String(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 40 ? { abstract: text, source: "Crossref" } : null;
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

/* ---------------- identifiers printed in the entry itself ----------------
 *
 * When a bibliography prints a DOI or an arXiv id, that IS the answer — no
 * search, no title-overlap guess, no chance of landing on a different paper by
 * the same group. Both are matched conservatively: a pattern loose enough to
 * catch a stray word would send garbage to a direct-lookup endpoint and turn a
 * findable reference into a miss.
 */
function doiFromEntry(entry) {
  // DOIs are "10.<registrant>/<suffix>"; the suffix may contain almost
  // anything, so it is cut at whitespace and at the trailing punctuation a
  // sentence ends with.
  const m = String(entry).match(/\b10\.\d{4,9}\/[^\s"'<>,;]+/);
  if (!m) return null;
  return m[0].replace(/[.,;)\]]+$/, "");
}

function arxivIdFromEntry(entry) {
  const s = String(entry);
  // Post-2007 style: arXiv:2101.12345v2 — the version suffix is dropped, since
  // the id without it resolves to the latest and the abstract is the same.
  const modern = s.match(/arxiv[:\s]*\s*(\d{4}\.\d{4,5})(?:v\d+)?/i);
  if (modern) return modern[1];
  // Pre-2007 style: arXiv:math.GT/0309136
  const legacy = s.match(/arxiv[:\s]*\s*([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/i);
  return legacy ? legacy[1] : null;
}

/* ---------------- direct-by-identifier lookups ----------------
 * The *ByDoi helpers above answer "does this DOI have an abstract"; these
 * answer "what paper is this DOI", which is a different question and needs the
 * full record.
 */
async function crossrefFullByDoi(doi) {
  const data = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  const w = data?.message;
  if (!w) return null;
  const title = Array.isArray(w.title) ? w.title[0] : w.title;
  if (!title) return null;
  return {
    title,
    abstract: w.abstract
      ? String(w.abstract).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null
      : null,
    year: w.issued?.["date-parts"]?.[0]?.[0] || null,
    venue: Array.isArray(w["container-title"]) ? w["container-title"][0] : null,
    authors: (w.author || []).map((a) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
    doi: w.DOI || doi,
    url: w.URL || `https://doi.org/${doi}`,
    source: "Crossref",
  };
}

async function semanticScholarFullByDoi(doi) {
  const fields = "title,abstract,year,venue,authors,externalIds,url";
  const p = await get(
    `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=${fields}`,
  );
  if (!p?.title) return null;
  return {
    title: p.title,
    abstract: p.abstract || null,
    year: p.year || null,
    venue: p.venue || null,
    authors: (p.authors || []).map((a) => a.name).filter(Boolean),
    doi: p.externalIds?.DOI || doi,
    url: p.url || `https://doi.org/${doi}`,
    source: "Semantic Scholar",
  };
}

/* ---------------- arXiv ----------------
 *
 * The one index that reliably holds preprints, which is a large and growing
 * share of what current papers cite — and the general indexes either miss them
 * or hold a stub with no abstract. Its API answers Atom XML rather than JSON;
 * the four fields needed are pulled out directly rather than by dragging in an
 * XML parser for them.
 */
const xmlText = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  return m[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim() || null;
};

async function arxivFetch(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": userAgent() }, signal: ctl.signal });
    if (!res.ok) return [];
    const xml = await res.text();
    return xml.split(/<entry>/).slice(1).map((s) => s.split(/<\/entry>/)[0]);
  } finally {
    clearTimeout(t);
  }
}

function fromArxivEntry(block) {
  const title = xmlText(block, "title");
  if (!title) return null;
  const idUrl = xmlText(block, "id") || "";
  const id = (idUrl.match(/abs\/(.+)$/) || [])[1] || null;
  const authors = [];
  for (const a of block.split(/<author>/).slice(1)) {
    const name = xmlText(a.split(/<\/author>/)[0], "name");
    if (name) authors.push(name);
  }
  const published = xmlText(block, "published");
  const doiTag = xmlText(block, "arxiv:doi");
  return {
    title,
    abstract: xmlText(block, "summary"),
    year: published ? +published.slice(0, 4) || null : null,
    venue: xmlText(block, "arxiv:journal_ref") || (id ? `arXiv:${id}` : "arXiv"),
    authors,
    doi: doiTag || null,
    url: idUrl || (id ? `https://arxiv.org/abs/${id}` : null),
    source: "arXiv",
  };
}

/** Exact: the entry printed an arXiv id. */
async function arxivById(id) {
  const blocks = await arxivFetch(
    `http://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`,
  );
  return blocks.length ? fromArxivEntry(blocks[0]) : null;
}

/** A guess, held to the same title-overlap bar as every other search. */
async function arxivSearch(query) {
  const blocks = await arxivFetch(
    `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(`all:"${query}"`)}&max_results=3`,
  );
  for (const b of blocks) {
    const hit = fromArxivEntry(b);
    if (hit && titleMatches(query, hit.title)) return hit;
  }
  return null;
}

/* ---------------- Europe PMC ----------------
 * Keyless, no practical rate limit, and it carries full abstracts for the
 * biomedical and life-sciences literature the general indexes hold thinly —
 * which is most of what a clinical or biology paper cites.
 */
function fromEuropePmc(r) {
  if (!r?.title) return null;
  return {
    title: String(r.title).replace(/\.$/, ""),
    abstract: r.abstractText
      ? String(r.abstractText).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null
      : null,
    year: r.pubYear ? +r.pubYear || null : null,
    venue: r.journalTitle || r.bookOrReportDetails?.publisher || null,
    authors: r.authorString
      ? String(r.authorString).replace(/\.$/, "").split(/,\s*/).filter(Boolean)
      : [],
    doi: r.doi || null,
    url: r.doi
      ? `https://doi.org/${r.doi}`
      : r.id && r.source ? `https://europepmc.org/article/${r.source}/${r.id}` : null,
    source: "Europe PMC",
  };
}

async function europePmc(query) {
  const data = await get(
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search" +
    `?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=3`,
  );
  const hit = (data?.resultList?.result || []).find((r) => titleMatches(query, r?.title));
  return hit ? fromEuropePmc(hit) : null;
}

async function europePmcByDoi(doi) {
  const data = await get(
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search" +
    `?query=${encodeURIComponent(`DOI:"${doi}"`)}&format=json&resultType=core&pageSize=1`,
  );
  const text = data?.resultList?.result?.[0]?.abstractText;
  if (!text) return null;
  const clean = String(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > 40 ? { abstract: clean, source: "Europe PMC" } : null;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
