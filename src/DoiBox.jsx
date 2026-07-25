/**
 * "Paste a DOI" — the alternative to hunting down a PDF and dragging it in.
 *
 * Resolve the identifier, show what the paper is, and then one of two things:
 *
 *  - open access → one button that fetches the PDF and starts the analysis.
 *  - paywalled   → the article's own page plus an "open through my library"
 *                  link built from the reader's own proxy prefix. They sign in
 *                  in their own browser, download it themselves, and drop it in.
 *                  Nothing here handles an institutional credential, and nothing
 *                  automated ever touches a publisher's paywall — that breaches
 *                  their terms and gets whole universities IP-blocked.
 */

import React, { useState } from "react";
import {
  Link2, Loader2, Sparkles, ExternalLink, Library, TriangleAlert, Lock, Unlock, X,
} from "lucide-react";
import {
  resolveDoi, fetchResolvedPdf, doiConfigured,
  getLibraryProxy, setLibraryProxy, buildProxyUrl,
} from "./doi.js";

export default function DoiBox({ onPdf, disabled }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [found, setFound] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [proxy, setProxy] = useState(getLibraryProxy);

  if (!doiConfigured) return null;

  const look = async (e) => {
    e?.preventDefault?.();
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true); setError(null); setFound(null);
    try {
      setFound(await resolveDoi(q));
    } catch (err) {
      setError(err?.message || "Lookup failed.");
    } finally {
      setBusy(false);
    }
  };

  const analyze = async () => {
    if (!found?.ticket || fetching) return;
    setFetching(true); setError(null);
    try {
      const file = await fetchResolvedPdf(found);
      onPdf(file);
    } catch (err) {
      setError(err?.message || "Couldn't download that PDF.");
    } finally {
      setFetching(false);
    }
  };

  const proxyUrl = buildProxyUrl(proxy, found?.landingUrl);

  return (
    <div className="mt-3">
      <form onSubmit={look} className="flex gap-2">
        <div className="relative flex-1">
          <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="…or paste a DOI, arXiv ID or article link"
            disabled={disabled || busy}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || busy || !query.trim()}
          className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : "Find it"}
        </button>
      </form>

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-800">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {found && (
        <div className="mt-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <button
            onClick={() => { setFound(null); setError(null); }}
            aria-label="Clear"
            className="float-right -mr-1 -mt-1 rounded-lg p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
          >
            <X size={14} />
          </button>

          <div className="flex items-center gap-1.5">
            {found.isOa
              ? <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700"><Unlock size={10} /> open access</span>
              : <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Lock size={10} /> subscription</span>}
            {found.source && <span className="text-[10.5px] font-medium text-slate-400">via {found.source}</span>}
          </div>

          <h4 className="mt-1.5 text-[13.5px] font-bold leading-snug text-slate-900">
            {found.title || found.doi || "Untitled"}
          </h4>
          <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
            {[found.authors?.slice(0, 3).join(", ") + (found.authors?.length > 3 ? " et al." : ""), found.journal, found.year]
              .filter(Boolean).join(" · ")}
          </p>

          {found.isOa ? (
            <button
              onClick={analyze}
              disabled={disabled || fetching}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
            >
              {fetching
                ? <><Loader2 size={15} className="animate-spin" /> Fetching the PDF…</>
                : <><Sparkles size={15} /> Analyze this paper</>}
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-[11.5px] leading-relaxed text-slate-500">
                No open copy exists, and fetching it through your institution's login isn't something
                this site can do for you — that's the publisher's terms and your university's
                credentials. Open it yourself, then drop the PDF in above.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={found.landingUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-slate-400"
                >
                  <ExternalLink size={13} /> Article page
                </a>
                {proxyUrl && (
                  <a
                    href={proxyUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[12px] font-semibold text-blue-700 transition hover:border-blue-400"
                  >
                    <Library size={13} /> Open through my library
                  </a>
                )}
              </div>
              <label className="block">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                  Your library's proxy prefix (saved on this device)
                </span>
                <input
                  value={proxy}
                  onChange={(e) => { setProxy(e.target.value); setLibraryProxy(e.target.value.trim()); }}
                  placeholder="https://ezproxy.your-university.edu/login?url="
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-[11px] text-slate-700 outline-none focus:border-blue-400"
                />
                <span className="mt-1 block text-[10.5px] leading-relaxed text-slate-400">
                  Your library's site calls this "off-campus access" or EZproxy. It stays in this
                  browser — you authenticate with the publisher yourself, in your own session.
                </span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
