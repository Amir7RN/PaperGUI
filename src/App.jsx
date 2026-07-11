/**
 * App shell: landing page -> (sample | upload+analyze) -> workspace.
 *
 * The landing page starts empty by design: the reader either loads the bundled
 * sample paper or uploads a PDF, which is analyzed in-browser by Claude
 * (claude-opus-4-8) into a PaperSpec that drives the generic workspace.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  FlaskConical, Upload, BookOpenCheck, Wallet,
  Loader2, TriangleAlert, FileText, Sparkles, SlidersHorizontal, LineChart, LogOut,
  ChevronDown, Wand2, Landmark, Image as ImageIcon, LogIn, BookMarked,
} from "lucide-react";
import Workspace from "./Workspace.jsx";
import Auth from "./Auth.jsx";
import Library from "./Library.jsx";
import { SAMPLE_SPEC } from "./samplePaper.js";
import { SAMPLE_SPEC_2 } from "./samplePaper2.js";
import { analyzePaper, MODEL_TIERS, getModelTier, setModelTier } from "./api.js";
import { fileToBase64, renderPdfRegions } from "./pdf.js";
import { compileSpec, buildHelpers, defaultsFromSpec, runSpec, validateResultFigures } from "./engine.js";
import { authEnabled, onAuthChange, signOut, getBalance, saveAnalysis } from "./supabase.js";

const BG_URL = `${import.meta.env.BASE_URL}Background.png`;

const MAX_PDF_MB = 32;

/* ---------------- credit balance badge ---------------- */

function BalanceBadge({ balance }) {
  if (balance === null) return null;
  const low = balance <= 0;
  const tight = !low && balance < 0.15;
  return (
    <span
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
        low
          ? "border-red-300 bg-red-50 text-red-700"
          : tight
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
      title="Your remaining analysis credit"
    >
      <Wallet size={14} />
      {low ? "Out of credit" : `$${balance.toFixed(2)} credit left`}
    </span>
  );
}

/* ---------------- analysis model tier picker ---------------- */

function TierPicker({ tier, onTier, disabled }) {
  return (
    <div className="mt-4 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Analysis level
        </span>
        <span className="text-[11px] text-slate-400">
          higher levels are more thorough but cost more
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Analysis model level">
        {MODEL_TIERS.map((t) => {
          const selected = t.id === tier.id;
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onTier(t)}
              className={`rounded-xl border-2 px-3 py-2 text-left transition disabled:opacity-50 ${
                selected
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-white hover:border-blue-300"
              }`}
            >
              <div className={`text-xs font-semibold ${selected ? "text-blue-700" : "text-slate-700"}`}>
                {t.label}
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{t.blurb}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- analysis hints (optional guidance) ---------------- */

function HintsPanel({ hints, onHints, disabled }) {
  const [open, setOpen] = useState(false);
  const set = (k) => (e) => onHints({ ...hints, [k]: e.target.value });
  const filled = ["domain", "focus", "signal", "notes"].filter((k) => hints[k]?.trim()).length;
  return (
    <div className="mt-3 w-full max-w-2xl rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Wand2 size={14} className="text-blue-600" />
          Guide the analyzer <span className="font-normal text-slate-400">(optional — sharpens the result for the same cost)</span>
        </span>
        <span className="flex items-center gap-2">
          {filled > 0 && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
              {filled} hint{filled > 1 ? "s" : ""} set
            </span>
          )}
          <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-slate-100 px-4 py-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">
            <span className="mb-1 block font-medium">What field is this paper from?</span>
            <input
              value={hints.domain} onChange={set("domain")} disabled={disabled}
              placeholder="e.g. biology, economics, machine learning, physics…"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            />
          </label>
          <label className="text-xs text-slate-600">
            <span className="mb-1 block font-medium">Which figures or results matter most to you?</span>
            <input
              value={hints.focus} onChange={set("focus")} disabled={disabled}
              placeholder="e.g. the main comparison figure; Figures 3–7; Table 2"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            />
          </label>
          <label className="text-xs text-slate-600 sm:col-span-2">
            <span className="mb-1 block font-medium">How was the study run? (inputs, conditions, what changes over time)</span>
            <input
              value={hints.signal} onChange={set("signal")} disabled={disabled}
              placeholder="e.g. repeated trials; a treatment applied halfway; groups compared under different doses / settings"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            />
          </label>
          <label className="text-xs text-slate-600 sm:col-span-2">
            <span className="mb-1 block font-medium">Anything else that would help?</span>
            <textarea
              value={hints.notes} onChange={set("notes")} disabled={disabled} rows={2}
              placeholder="numbers the paper reports that the recreation should match, terms you'd like explained, what you're hoping to learn…"
              className="w-full resize-y rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            />
          </label>
        </div>
      )}
    </div>
  );
}

/* ---------------- landing page ---------------- */

function Landing({
  onSample, onUpload, busy, progress, error, tier, onTier, balance, hints, onHints,
  authOn, signedIn, onSignIn, onSignUp, onSignOut, onOpenLibrary,
}) {
  const fileRef = useRef(null);
  const requireAuthToUpload = authOn && !signedIn;

  return (
    <div className="flex min-h-screen flex-col" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <FlaskConical size={18} className="text-blue-600" />
            Interactive Paper Playground
          </div>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <>
                <BalanceBadge balance={balance} />
                <button
                  onClick={onOpenLibrary}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700"
                >
                  <BookMarked size={14} /> My papers
                </button>
                <button
                  onClick={onSignOut}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </>
            ) : authOn ? (
              <>
                <button
                  onClick={onSignIn}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
                >
                  <LogIn size={14} /> Sign in
                </button>
                <button
                  onClick={onSignUp}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  Sign up
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="mb-3 flex items-center gap-2 rounded-full border border-blue-200/60 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700 shadow-sm backdrop-blur">
          <Sparkles size={13} /> Leave the PDF aside — work with the paper
        </div>
        <h1 className="max-w-2xl text-center text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
          Turn any scientific paper into a{" "}
          <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-emerald-600 bg-clip-text text-transparent">
            living, interactive lab
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-center text-sm leading-relaxed text-slate-600">
          The analyzer walks you through a paper the way a good colleague would: the idea in
          pictures, the prior work it stands on, its own method with every coefficient on a
          slider, and its real result figures — recreated and reshaping live as you explore.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {[
            { icon: ImageIcon, label: "1 · Idea in pictures", cls: "text-violet-700 bg-violet-50 border-violet-200/70" },
            { icon: Landmark, label: "2 · Prior foundations", cls: "text-amber-700 bg-amber-50 border-amber-200/70" },
            { icon: SlidersHorizontal, label: "3 · Method, interactive", cls: "text-blue-700 bg-blue-50 border-blue-200/70" },
            { icon: LineChart, label: "4 · Results, recreated", cls: "text-emerald-700 bg-emerald-50 border-emerald-200/70" },
          ].map(({ icon: Icon, label, cls }) => (
            <span key={label} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium shadow-sm ${cls}`}>
              <Icon size={12} /> {label}
            </span>
          ))}
        </div>

        <div className="mt-8 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <BookOpenCheck size={14} className="text-blue-600" /> Try a ready-made example (no key needed)
            </div>
            <button
              onClick={() => onSample(SAMPLE_SPEC_2)}
              disabled={busy}
              className="group flex flex-col items-start gap-1 rounded-2xl border border-slate-200/80 bg-white/90 p-4 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-slate-800">Humanoid repetitive-learning control</span>
              <span className="text-xs leading-relaxed text-slate-500">
                Full four-chapter walkthrough with the paper's figures 4–11 (joint tracking, errors,
                CoM &amp; ground forces, indoor &amp; outdoor) recreated as interactive plots.
              </span>
            </button>
            <button
              onClick={() => onSample(SAMPLE_SPEC)}
              disabled={busy}
              className="group flex flex-col items-start gap-1 rounded-2xl border border-slate-200/80 bg-white/90 p-4 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-slate-800">Multi-stage filtering &amp; control</span>
              <span className="text-xs leading-relaxed text-slate-500">
                A signal-conditioning + feedback-regulation example — simpler, good for a first look.
              </span>
            </button>
          </div>

          <button
            onClick={() => (requireAuthToUpload ? onSignUp() : fileRef.current?.click())}
            disabled={busy || (signedIn && balance !== null && balance <= 0)}
            className="group relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-blue-300/70 bg-gradient-to-br from-white/95 to-blue-50/80 p-5 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-xl disabled:opacity-50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md transition group-hover:scale-105">
              <Upload size={18} />
            </span>
            <span className="text-sm font-semibold text-slate-800">Analyze a new paper (PDF)</span>
            <span className="text-xs leading-relaxed text-slate-500">
              {requireAuthToUpload ? (
                <>
                  <strong>Sign up free</strong> to analyze your own PDF — new accounts get
                  $1.00 of analysis credit, and every paper you analyze is saved to your
                  library so reopening it never costs credit again.
                </>
              ) : signedIn && balance !== null && balance <= 0 ? (
                "You've used your free analysis credit — try the ready-made examples instead."
              ) : (
                <>
                  Pick a PDF from your local drive — synced OneDrive / Google Drive folders work too.
                  The analyzer builds the full four-chapter walkthrough at the{" "}
                  <strong>{tier.label}</strong> level selected below.
                </>
              )}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onUpload(f);
            }}
          />
        </div>

        <TierPicker tier={tier} onTier={onTier} disabled={busy} />

        <HintsPanel hints={hints} onHints={onHints} disabled={busy} />

        {busy && (
          <div className="mt-6 w-full max-w-2xl rounded-xl border border-blue-200 bg-white/90 px-4 py-4 shadow-sm backdrop-blur">
            <div className="flex items-center gap-3 text-sm text-blue-900">
              <Loader2 size={18} className="shrink-0 animate-spin" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{progress?.label || "Working…"}</div>
                <div className="text-xs text-slate-500">
                  Deep analysis can take a few minutes for dense papers — keep this tab open.
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-blue-700">
                {Math.round(progress?.pct || 0)}%
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
                style={{ width: `${Math.max(3, Math.min(100, progress?.pct || 0))}%` }}
              />
            </div>
          </div>
        )}

        {error && !busy && (
          <div className="mt-6 flex w-full max-w-2xl items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Analysis failed</div>
              <div className="mt-0.5 text-xs leading-relaxed">{error}</div>
            </div>
          </div>
        )}

        <p className="mt-8 flex items-center gap-1.5 text-[11px] text-slate-400">
          <FileText size={12} /> Your paper passes through our analysis service to Claude and is never stored.
        </p>
      </main>
    </div>
  );
}

/* ---------------- app shell ---------------- */

export default function App() {
  const [spec, setSpec] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [tier, setTier] = useState(getModelTier);
  const [balance, setBalance] = useState(null);
  const [hints, setHints] = useState({ domain: "", focus: "", signal: "", notes: "" });

  // Auth is optional for browsing: anyone can open the sample papers. An
  // account is only required to analyze a new PDF (that spends credit and the
  // edge function needs an account to bill). The sign-in/up UI lives in the
  // landing page's top-right corner as a dismissible modal.
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!authEnabled);
  const [authOpen, setAuthOpen] = useState(null); // null | "signin" | "signup"
  const [libraryOpen, setLibraryOpen] = useState(false);
  useEffect(() => {
    if (!authEnabled) return;
    const unsub = onAuthChange((s) => { setSession(s); setAuthReady(true); });
    return unsub;
  }, []);

  // Close the sign-in modal automatically once a session is established.
  useEffect(() => { if (session) setAuthOpen(null); }, [session]);

  // Refresh the credit balance whenever we get a session.
  useEffect(() => {
    if (!session) { setBalance(null); return; }
    getBalance().then(setBalance);
  }, [session]);

  const handleTier = useCallback((t) => {
    setTier(t);
    setModelTier(t.id);
  }, []);

  const handleUpload = useCallback(async (file) => {
    setError("");

    if (balance !== null && balance <= 0) {
      setError("You've used up your free analysis credit.");
      return;
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      setError(`PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB — the API limit is ${MAX_PDF_MB} MB.`);
      return;
    }

    setBusy(true);
    try {
      setProgress({ pct: 3, label: "Reading the PDF…" });
      const arrayBuffer = await file.arrayBuffer();
      const base64 = await fileToBase64(file);

      const { spec: newSpec, remainingBalance } = await analyzePaper(base64, setProgress, tier, hints);
      if (typeof remainingBalance === "number") setBalance(remainingBalance);

      setProgress({ pct: 86, label: "Cropping figures from the paper…" });
      try {
        const concept = newSpec.conceptFigures || [];
        const results = newSpec.resultFigures || [];
        const items = [...concept, ...results].map((f) => ({ page: f.page, bbox: f.bbox }));
        const crops = await renderPdfRegions(arrayBuffer, items);
        concept.forEach((f, i) => { if (crops[i]) f.image = crops[i]; });
        results.forEach((f, i) => { if (crops[concept.length + i]) f.image = crops[concept.length + i]; });
      } catch {
        // figure previews are optional — explanations still show
      }

      setProgress({ pct: 93, label: "Compiling the interactive pipeline…" });
      const helpers = buildHelpers(newSpec.protocol);
      const defaults = defaultsFromSpec(newSpec);
      const compiled = compileSpec(newSpec);
      const run = runSpec(newSpec, compiled, defaults, helpers);
      if (run.error) {
        throw new Error(`The generated pipeline failed a test run: ${run.error}. Try re-analyzing the paper.`);
      }

      // Validate the reproduced figures: drop panels/figures whose kernels error
      // so one bad subplot never blocks the whole workspace.
      newSpec.resultFigures = validateResultFigures(newSpec, compiled, helpers, defaults);

      // Persist to the account's library so this paper can be reopened later
      // for free instead of spending credit to re-analyze the same PDF.
      if (authEnabled && session) {
        setProgress({ pct: 98, label: "Saving to your library…" });
        try { await saveAnalysis(newSpec); } catch { /* library save is best-effort */ }
      }

      setProgress({ pct: 100, label: "Done" });
      setSpec(newSpec);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [tier, hints, balance, session]);

  // Full-site background: fixed image layer + soft wash for legibility.
  const bgLayer = (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url("${BG_URL}")` }}
      />
      <div className="absolute inset-0 bg-slate-100/70" />
    </div>
  );

  // While the auth session is still resolving, show a brief spinner so we don't
  // flash the signed-out landing page to an already-signed-in user.
  if (authEnabled && !authReady) {
    return (
      <>
        {bgLayer}
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 size={22} className="animate-spin text-slate-500" />
        </div>
      </>
    );
  }

  const authModal = authOpen && (
    <Auth initialMode={authOpen} onClose={() => setAuthOpen(null)} />
  );
  const libraryModal = libraryOpen && (
    <Library
      onClose={() => setLibraryOpen(false)}
      onOpen={(s) => { setSpec(s); setLibraryOpen(false); }}
    />
  );

  if (spec) {
    return (
      <>
        {bgLayer}
        <Workspace
          spec={spec}
          onBack={() => setSpec(null)}
          onSignOut={authEnabled && session ? signOut : null}
        />
        {authModal}
        {libraryModal}
      </>
    );
  }

  return (
    <>
      {bgLayer}
      <Landing
        onSample={(s) => setSpec(s)}
        onUpload={handleUpload}
        busy={busy}
        progress={progress}
        error={error}
        tier={tier}
        onTier={handleTier}
        balance={balance}
        hints={hints}
        onHints={setHints}
        authOn={authEnabled}
        signedIn={Boolean(session)}
        onSignIn={() => setAuthOpen("signin")}
        onSignUp={() => setAuthOpen("signup")}
        onSignOut={signOut}
        onOpenLibrary={() => setLibraryOpen(true)}
      />
      {authModal}
      {libraryModal}
    </>
  );
}
