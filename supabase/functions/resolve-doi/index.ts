// @ts-nocheck
/**
 * DOI → the paper, when the paper is legally fetchable.
 *
 * Two modes:
 *
 *   { doi: "10.1016/…" }            → resolve. Crossref for metadata, then
 *                                     Unpaywall / arXiv / PubMed Central for a
 *                                     legitimately open-access PDF. Returns the
 *                                     metadata either way, plus a SIGNED ticket
 *                                     when an OA PDF exists.
 *   { ticket: "<url>.<sig>.<exp>" }  → download. Streams that PDF back with CORS
 *                                     headers, because publishers don't send
 *                                     them, so the browser can't fetch it
 *                                     directly (no Access-Control-Allow-Origin).
 *
 * The ticket is an HMAC of the URL this function itself resolved, so the
 * download mode can't be pointed at an arbitrary host — otherwise this would be
 * an open proxy for anyone on the internet.
 *
 * What this deliberately does NOT do: touch paywalled full text. No
 * institutional credentials, no library proxy, no publisher session. When a
 * paper isn't open, the client gets the landing page and hands the reader off
 * to their own library, authenticated in their own browser. Automating that
 * breaches publisher terms and gets a whole university's IP range blocked.
 *
 * Optional secrets:
 *   UNPAYWALL_EMAIL   contact address Unpaywall asks callers to send
 *   DOI_TICKET_SECRET signing key (falls back to the service role key)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_PDF_BYTES = 32 * 1024 * 1024;   // the analyzer's own ceiling
const TICKET_TTL_MS = 30 * 60 * 1000;
const UA = "SciLoupe/1.0 (+https://sciloupe.com; mailto:%EMAIL%)";

/** Hosts the download proxy will talk to. Belt to the signature's braces. */
const ALLOWED_HOSTS = [
  /(^|\.)arxiv\.org$/i,
  /(^|\.)ncbi\.nlm\.nih\.gov$/i,
  /(^|\.)europepmc\.org$/i,
  /(^|\.)biorxiv\.org$/i,
  /(^|\.)medrxiv\.org$/i,
  /(^|\.)osf\.io$/i,
  /(^|\.)zenodo\.org$/i,
  // Publisher-hosted OA PDFs (Unpaywall only ever returns free-to-read links).
  /(^|\.)springer\.com$/i, /(^|\.)nature\.com$/i, /(^|\.)sciencedirect\.com$/i,
  /(^|\.)wiley\.com$/i, /(^|\.)mdpi\.com$/i, /(^|\.)frontiersin\.org$/i,
  /(^|\.)plos\.org$/i, /(^|\.)ieee\.org$/i, /(^|\.)acs\.org$/i, /(^|\.)aps\.org$/i,
  /(^|\.)iop\.org$/i, /(^|\.)cell\.com$/i, /(^|\.)elsevier\.com$/i,
  /(^|\.)oup\.com$/i, /(^|\.)tandfonline\.com$/i, /(^|\.)sagepub\.com$/i,
  /(^|\.)aip\.org$/i, /(^|\.)acm\.org$/i, /(^|\.)cambridge\.org$/i,
  /(^|\.)copernicus\.org$/i, /(^|\.)hindawi\.com$/i, /(^|\.)pnas\.org$/i,
  /(^|\.)sciencemag\.org$/i, /(^|\.)science\.org$/i, /(^|\.)jstage\.jst\.go\.jp$/i,
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON body." }); }

  if (body?.ticket) return download(String(body.ticket));

  const query = String(body?.doi || body?.query || "").trim();
  if (!query) return json(400, { error: "Paste a DOI, arXiv ID or article link." });
  return resolve(query);
});

/* ---------------- resolve ---------------- */

async function resolve(query) {
  const arxivId = parseArxiv(query);
  const doi = parseDoi(query);
  if (!doi && !arxivId) {
    return json(400, {
      error: "That doesn't look like a DOI, arXiv ID or article link — try e.g. 10.1038/s41586-021-03819-2.",
    });
  }

  // arXiv is the easy case: the PDF is the ID.
  if (arxivId && !doi) {
    const meta = await arxivMeta(arxivId);
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}`;
    return json(200, {
      ...meta,
      doi: null,
      isOa: true,
      source: "arXiv",
      landingUrl: `https://arxiv.org/abs/${arxivId}`,
      ticket: await sign(pdfUrl),
    });
  }

  const meta = await crossrefMeta(doi);
  const landingUrl = `https://doi.org/${doi}`;

  // Where can we legitimately get the full text?
  let pdfUrl = null, source = null;
  const up = await unpaywall(doi);
  if (up?.url) { pdfUrl = up.url; source = up.source; }

  if (!pdfUrl) {
    const pmc = await pubmedCentral(doi);
    if (pmc) { pdfUrl = pmc; source = "PubMed Central"; }
  }
  if (!pdfUrl && meta?.arxivId) {
    pdfUrl = `https://arxiv.org/pdf/${meta.arxivId}`;
    source = "arXiv";
  }
  if (pdfUrl && !hostAllowed(pdfUrl)) { pdfUrl = null; source = null; }

  return json(200, {
    ...meta,
    doi,
    landingUrl,
    isOa: Boolean(pdfUrl),
    source,
    ticket: pdfUrl ? await sign(pdfUrl) : null,
  });
}

const DOI_RE = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
function parseDoi(s) {
  const m = String(s).match(DOI_RE);
  return m ? m[0].replace(/[.,;)\]]+$/, "") : null;
}
function parseArxiv(s) {
  const m = String(s).match(/arxiv\.org\/(?:abs|pdf)\/([^\s?#]+)|^\s*(?:arxiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)\s*$/i);
  return (m?.[1] || m?.[2] || null)?.replace(/\.pdf$/i, "") || null;
}

async function crossrefMeta(doi) {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": userAgent() },
    });
    if (!res.ok) return { title: null, authors: null, year: null, journal: null };
    const w = (await res.json())?.message || {};
    const authors = (w.author || [])
      .map((a) => [a.given, a.family].filter(Boolean).join(" "))
      .filter(Boolean);
    // Some records carry the preprint's arXiv id in `relation`.
    const arxivId = (w.relation?.["has-preprint"] || w.relation?.["is-preprint-of"] || [])
      .map((r) => String(r?.id || ""))
      .map((id) => parseArxiv(id))
      .find(Boolean) || null;
    return {
      title: Array.isArray(w.title) ? w.title[0] : w.title || null,
      authors: authors.length ? authors : null,
      year: w.issued?.["date-parts"]?.[0]?.[0] || null,
      journal: Array.isArray(w["container-title"]) ? w["container-title"][0] : null,
      publisher: w.publisher || null,
      arxivId,
    };
  } catch {
    return { title: null, authors: null, year: null, journal: null };
  }
}

async function arxivMeta(id) {
  try {
    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, {
      headers: { "User-Agent": userAgent() },
    });
    const xml = await res.text();
    const pick = (tag) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() || null;
    const authors = [...xml.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim());
    const published = pick("published");
    return {
      title: pick("title")?.replace(/\s+/g, " ") || null,
      authors: authors.length ? authors : null,
      year: published ? Number(published.slice(0, 4)) : null,
      journal: "arXiv preprint",
      publisher: "arXiv",
    };
  } catch {
    return { title: null, authors: null, year: null, journal: "arXiv preprint" };
  }
}

async function unpaywall(doi) {
  const email = Deno.env.get("UNPAYWALL_EMAIL") || "openaccess@example.com";
  try {
    const res = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`,
      { headers: { "User-Agent": userAgent() } },
    );
    if (!res.ok) return null;
    const d = await res.json();
    const loc = d?.best_oa_location || (d?.oa_locations || [])[0];
    const url = loc?.url_for_pdf || null;
    if (!url) return null;
    return { url, source: loc?.host_type === "repository" ? (d?.journal_name ? "OA repository" : "repository") : "publisher (open access)" };
  } catch {
    return null;
  }
}

async function pubmedCentral(doi) {
  try {
    const res = await fetch(
      `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${encodeURIComponent(doi)}&format=json`,
      { headers: { "User-Agent": userAgent() } },
    );
    if (!res.ok) return null;
    const rec = (await res.json())?.records?.[0];
    const pmcid = rec?.pmcid;
    if (!pmcid) return null;
    return `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/pdf/`;
  } catch {
    return null;
  }
}

/* ---------------- download (signed proxy) ---------------- */

async function download(ticket) {
  const url = await verify(ticket);
  if (!url) return json(403, { error: "That download link expired — resolve the DOI again." });
  if (!hostAllowed(url)) return json(403, { error: "That host isn't on the open-access allowlist." });

  let res;
  try {
    res = await fetch(url, { headers: { "User-Agent": userAgent(), Accept: "application/pdf,*/*" }, redirect: "follow" });
  } catch {
    return json(502, { error: "Couldn't reach the publisher — download the PDF yourself and drop it in." });
  }
  if (!res.ok) {
    return json(502, { error: `The publisher returned ${res.status} for that PDF — download it yourself and drop it in.` });
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_PDF_BYTES) {
    return json(413, { error: "That PDF is over 32 MB — the analyzer's limit." });
  }
  // A login wall usually comes back as HTML with a 200. Don't hand that on.
  const looksPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
  if (!looksPdf) {
    return json(415, { error: "That link gave a web page, not a PDF — the full text may not be open after all." });
  }

  return new Response(buf, {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/pdf", "Cache-Control": "no-store" },
  });
}

/* ---------------- helpers ---------------- */

function hostAllowed(url) {
  try {
    const h = new URL(url).hostname;
    return ALLOWED_HOSTS.some((re) => re.test(h));
  } catch { return false; }
}

function userAgent() {
  return UA.replace("%EMAIL%", Deno.env.get("UNPAYWALL_EMAIL") || "openaccess@example.com");
}

function ticketSecret() {
  return Deno.env.get("DOI_TICKET_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "dev-secret";
}

async function hmac(msg) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(ticketSecret()),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(url) {
  const exp = Date.now() + TICKET_TTL_MS;
  return `${btoa(url)}.${exp}.${await hmac(`${url}|${exp}`)}`;
}

async function verify(ticket) {
  const [b64, expStr, sig] = String(ticket).split(".");
  if (!b64 || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  let url;
  try { url = atob(b64); } catch { return null; }
  const expected = await hmac(`${url}|${exp}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? url : null;
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
