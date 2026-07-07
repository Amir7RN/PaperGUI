/**
 * App shell: landing page -> (sample | upload+analyze) -> workspace.
 *
 * The landing page starts empty by design: the reader either loads the bundled
 * sample paper or uploads a PDF, which is analyzed in-browser by Claude
 * (claude-opus-4-8) into a PaperSpec that drives the generic workspace.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  FlaskConical, Upload, BookOpenCheck, X, KeyRound, CircleCheck,
  Loader2, TriangleAlert, FileText, Sparkles, SlidersHorizontal, LineChart,
} from "lucide-react";
import Workspace from "./Workspace.jsx";
import { SAMPLE_SPEC } from "./samplePaper.js";
import { analyzePaper, getApiKey, setApiKey, MODEL_TIERS, getModelTier, setModelTier } from "./api.js";
import { fileToBase64, renderPdfRegions } from "./pdf.js";
import {
  compileSpec, buildHelpers, defaultsFromSpec, runSpec,
  compileResultFigures, runResultFigure,
} from "./engine.js";

const MAX_PDF_MB = 32;

/* ---------------- API key settings modal ---------------- */

function SettingsModal({ open, onClose, onSaved }) {
  const [key, setKey] = useState("");
  useEffect(() => { if (open) setKey(getApiKey()); }, [open]);
  useEffect(() => {
    const kill = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", kill);
    return () => window.removeEventListener("keydown", kill);
  }, [onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <KeyRound size={16} /> Anthropic API key
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <p className="mb-3 text-[13px] leading-relaxed text-slate-600">
          <strong>You only need to do this once.</strong> Paste your key below and it stays saved
          in this browser — every future analysis uses it automatically. The key never leaves
          your device except to contact the analysis service directly, and it is never shared or
          uploaded anywhere else. Don't have a key yet? Create one at{" "}
          <a href="https://platform.claude.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">
            platform.claude.com
          </a>.
        </p>

        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          autoComplete="off"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => { setApiKey(""); setKey(""); }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear stored key
          </button>
          <button
            onClick={() => { setApiKey(key); onSaved?.(); onClose(); }}
            className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700"
          >
            Save key
          </button>
        </div>
      </div>
    </div>
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

/* ---------------- landing page ---------------- */

function Landing({ onSample, onUpload, onSettings, busy, progress, error, tier, onTier, hasKey }) {
  const fileRef = useRef(null);

  return (
    <div className="flex min-h-screen flex-col bg-slate-100" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <FlaskConical size={18} className="text-blue-600" />
            Interactive Paper Playground
          </div>
          <button
            onClick={onSettings}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              hasKey
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
                : "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400"
            }`}
          >
            {hasKey ? <CircleCheck size={14} /> : <KeyRound size={14} />}
            {hasKey ? "API key saved" : "Add API key (one-time)"}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-600">
          <Sparkles size={13} /> Leave the PDF aside — work with the paper
        </div>
        <h1 className="max-w-2xl text-center text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">
          Turn any scientific paper into a living, interactive dashboard
        </h1>
        <p className="mt-3 max-w-xl text-center text-sm leading-relaxed text-slate-600">
          Upload a paper and the analyzer extracts its concept figures, methodology formulas and
          coefficients into sequential modules with live sliders and synchronized plots — so you
          can grasp, reproduce and stress-test the idea without reading the original side by side.
        </p>

        <div className="mt-8 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          <button
            onClick={onSample}
            disabled={busy}
            className="group flex flex-col items-start gap-2 rounded-2xl border-2 border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md disabled:opacity-50"
          >
            <BookOpenCheck size={22} className="text-blue-600" />
            <span className="text-sm font-semibold text-slate-800">Load the sample paper</span>
            <span className="text-xs leading-relaxed text-slate-500">
              “A Generalized Multi-Stage Filtering and Feedback-Regulation Framework for Noisy
              Multi-Frequency Signals” — fully wired, no API key needed.
            </span>
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="group flex flex-col items-start gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md disabled:opacity-50"
          >
            <Upload size={22} className="text-blue-600" />
            <span className="text-sm font-semibold text-slate-800">Analyze a new paper (PDF)</span>
            <span className="text-xs leading-relaxed text-slate-500">
              Pick a PDF from your local drive — synced OneDrive / Google Drive folders work too.
              The analyzer rebuilds its methodology as an interactive pipeline at the{" "}
              <strong>{tier.label}</strong> level selected below.
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

        {busy && (
          <div className="mt-6 flex w-full max-w-2xl items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <Loader2 size={18} className="shrink-0 animate-spin" />
            <div>
              <div className="font-medium">{progress || "Working…"}</div>
              <div className="text-xs opacity-75">
                Deep analysis can take a few minutes for dense papers — the tab must stay open.
              </div>
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

        <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-3 text-center sm:grid-cols-3">
          {[
            { icon: FileText, label: "Concept primer", sub: "Static intro figures, explained" },
            { icon: SlidersHorizontal, label: "Formula matrix", sub: "Every coefficient on a slider" },
            { icon: LineChart, label: "Result engine", sub: "Baseline vs. your modification" },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-4">
              <Icon size={18} className="mx-auto text-slate-400" />
              <div className="mt-1.5 text-xs font-semibold text-slate-700">{label}</div>
              <div className="text-[11px] text-slate-400">{sub}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

/* ---------------- app shell ---------------- */

export default function App() {
  const [spec, setSpec] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tier, setTier] = useState(getModelTier);
  const [hasKey, setHasKey] = useState(() => !!getApiKey());

  const handleTier = useCallback((t) => {
    setTier(t);
    setModelTier(t.id);
  }, []);

  const handleUpload = useCallback(async (file) => {
    setError("");

    if (!getApiKey()) {
      setSettingsOpen(true);
      setError("Add your API key first — it's a one-time step. Then upload the paper again.");
      return;
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      setError(`PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB — the API limit is ${MAX_PDF_MB} MB.`);
      return;
    }

    setBusy(true);
    try {
      setProgress("Reading the PDF…");
      const arrayBuffer = await file.arrayBuffer();
      const base64 = await fileToBase64(file);

      const newSpec = await analyzePaper(base64, setProgress, tier);

      setProgress("Cropping figures from the paper…");
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

      setProgress("Compiling the computational pipeline…");
      const helpers = buildHelpers(newSpec.protocol);
      const defaults = defaultsFromSpec(newSpec);
      const compiled = compileSpec(newSpec);
      const run = runSpec(newSpec, compiled, defaults, helpers);
      if (run.error) {
        throw new Error(`The generated pipeline failed a test run: ${run.error}. Try re-analyzing the paper.`);
      }

      // Test-run each reproduced result figure; drop any that error so a single
      // bad kernel never blocks the whole workspace.
      const figCompiled = compileResultFigures(newSpec);
      newSpec.resultFigures = (newSpec.resultFigures || []).filter((fig) => {
        const r = runResultFigure(fig, figCompiled.fns[fig.figureLabel], run.outputs, defaults, helpers);
        return !r.error;
      });

      setSpec(newSpec);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }, [tier]);

  if (spec) {
    return <Workspace spec={spec} onBack={() => setSpec(null)} />;
  }

  return (
    <>
      <Landing
        onSample={() => setSpec(SAMPLE_SPEC)}
        onUpload={handleUpload}
        onSettings={() => setSettingsOpen(true)}
        busy={busy}
        progress={progress}
        error={error}
        tier={tier}
        onTier={handleTier}
        hasKey={hasKey}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false); setHasKey(!!getApiKey()); }}
        onSaved={() => { setHasKey(!!getApiKey()); setError(""); }}
      />
    </>
  );
}
