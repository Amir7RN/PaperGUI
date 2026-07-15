/**
 * App shell: landing page -> (sample | upload+analyze) -> workspace.
 *
 * The landing page starts empty by design: the reader either loads the bundled
 * sample paper or uploads a PDF, which is analyzed by the AI service into a
 * PaperSpec that drives the generic workspace.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  FlaskConical, Upload, BookOpenCheck, Wallet,
  Loader2, TriangleAlert, FileText, Sparkles, SlidersHorizontal, LineChart, LogOut,
  ChevronDown, Wand2, Landmark, Image as ImageIcon, LogIn, BookMarked, Mail, MapPin,
  FileCode2, X as XIcon,
} from "lucide-react";
import Workspace from "./Workspace.jsx";
import Auth from "./Auth.jsx";
import Library from "./Library.jsx";
import BuyCredits from "./BuyCredits.jsx";
import ContactModal from "./ContactModal.jsx";
import { SAMPLE_SPEC } from "./samplePaper.js";
import { SAMPLE_SPEC_2 } from "./samplePaper2.js";
import { analyzePaper, MODEL_TIERS, getModelTier, setModelTier } from "./api.js";
import { fileToBase64, renderPdfRegions } from "./pdf.js";
import {
  compileSpec, buildHelpers, defaultsFromSpec, runSpec, validateResultFigures,
  auditPipeline, auditResultFiguresQuality, auditFoundations, auditExplorables,
} from "./engine.js";
import { authEnabled, onAuthChange, signOut, getBalance, saveAnalysis } from "./supabase.js";

const BG_URL = `${import.meta.env.BASE_URL}Background.png`;

const MAX_PDF_MB = 32;

/* ---------------- owner gate (design tools) ----------------
 * The layout/design tools ("Edit fonts & sections", "Free layout") are for the
 * site owner only, not regular visitors. Owner is recognized two ways:
 *   1. Signed in with an email listed in VITE_OWNER_EMAIL (comma-separated).
 *   2. A one-time unlock via ?owner=1 in the URL (persisted in localStorage);
 *      ?owner=0 clears it. Handy for unlocking without a redeploy.
 * These tools only edit the viewer's own localStorage, so this is a UI gate,
 * not a security boundary. */
const OWNER_EMAILS = (import.meta.env.VITE_OWNER_EMAIL || "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

function isOwnerUser(session) {
  try {
    const flag = new URLSearchParams(window.location.search).get("owner");
    if (flag === "1") localStorage.setItem("pp-owner", "1");
    else if (flag === "0") localStorage.removeItem("pp-owner");
    if (localStorage.getItem("pp-owner") === "1") return true;
  } catch { /* storage/URL unavailable — fall through to email check */ }
  const email = session?.user?.email?.toLowerCase() || "";
  return OWNER_EMAILS.includes(email);
}

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
    <div className="mt-4 w-full max-w-none rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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

/** File extensions accepted as "the paper's code" — read as plain text. */
const CODE_EXTS = ".py,.m,.jl,.r,.c,.cpp,.h,.hpp,.cs,.java,.js,.ts,.ipynb,.sh,.yaml,.yml,.toml,.json,.txt,.md";
const MAX_CODE_FILE_MB = 2;
const MAX_CODE_FILES = 8;

function HintsPanel({ hints, onHints, codeFiles, onCodeFiles, disabled }) {
  const [open, setOpen] = useState(false);
  const codeInputRef = useRef(null);
  const set = (k) => (e) => onHints({ ...hints, [k]: e.target.value });
  const filled = ["domain", "focus", "signal", "notes"].filter((k) => hints[k]?.trim()).length
    + (codeFiles.length ? 1 : 0);

  const addCodeFiles = async (fileList) => {
    const picked = Array.from(fileList || []).slice(0, MAX_CODE_FILES - codeFiles.length);
    const loaded = [];
    for (const f of picked) {
      if (f.size > MAX_CODE_FILE_MB * 1024 * 1024) continue; // silently skip huge binaries
      try { loaded.push({ name: f.name, text: await f.text() }); } catch { /* unreadable — skip */ }
    }
    if (loaded.length) onCodeFiles([...codeFiles, ...loaded].slice(0, MAX_CODE_FILES));
  };
  return (
    <div className="mt-3 w-full max-w-none rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
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

          {/* ---- the paper's code: the single biggest accuracy boost ---- */}
          <div className="text-xs text-slate-600 sm:col-span-2">
            <span className="mb-1 flex items-center gap-1.5 font-medium">
              <FileCode2 size={13} className="text-emerald-600" />
              Do you have the paper's code? <span className="font-normal text-slate-400">(its repo scripts, a notebook, your own implementation)</span>
            </span>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
              If you attach it, the interactive plots are derived from the <strong className="text-slate-500">actual implementation</strong> —
              same equations, same constants — instead of being reconstructed from the paper's prose. Up to {MAX_CODE_FILES} text
              files, {MAX_CODE_FILE_MB} MB each.
            </p>
            <input
              ref={codeInputRef} type="file" multiple accept={CODE_EXTS}
              className="hidden" disabled={disabled}
              onChange={(e) => { addCodeFiles(e.target.files); e.target.value = ""; }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button" disabled={disabled || codeFiles.length >= MAX_CODE_FILES}
                onClick={() => codeInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
              >
                <Upload size={12} /> Attach code files
              </button>
              {codeFiles.map((f, i) => (
                <span key={`${f.name}-${i}`}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">
                  <FileCode2 size={11} className="text-slate-400" />
                  {f.name}
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400">{(f.text.length / 1024).toFixed(0)} kB</span>
                  <button
                    type="button" aria-label={`Remove ${f.name}`} disabled={disabled}
                    onClick={() => onCodeFiles(codeFiles.filter((_, k) => k !== i))}
                    className="ml-0.5 text-slate-300 hover:text-red-500"
                  >
                    <XIcon size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- demo video showcase ---------------- */

/** Timeline of the landing demo recording — each entry drives the dynamic
 *  explanation box while the video plays, and doubles as a seek button. */
const DEMO_CHAPTERS = [
  { at: 0,  short: "Overview",    title: "The finished workspace",
    body: "This is what your paper becomes — a living, explorable analysis instead of a static PDF." },
  { at: 1,  short: "References",  title: "Original references, one click away",
    body: "Every source the paper cites, ready to open — no digging through the bibliography." },
  { at: 5,  short: "The idea",    title: "1 · The idea in pictures",
    body: "The paper's own concept figures, cropped out and explained in plain language." },
  { at: 9,  short: "Background",  title: "2 · Background you need first",
    body: "Each borrowed concept becomes a mini-lab: drag the sliders, watch the diagram react, toggle the formulas open when you're curious." },
  { at: 30, short: "The method",  title: "3 · Learn the method by playing",
    body: "Step through the method's stages — every coefficient is a slider, and the diagrams and plots reshape as you switch states." },
  { at: 60, short: "Results",     title: "4 · Results, recreated live",
    body: "The paper's real result figures rebuilt as live plots: tune the parameters, hover any curve to read the exact numbers." },
];

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function VideoShowcase() {
  const vidRef = useRef(null);
  const [time, setTime] = useState(0);
  const idx = DEMO_CHAPTERS.reduce((acc, c, i) => (time >= c.at ? i : acc), 0);
  const ch = DEMO_CHAPTERS[idx];

  const seek = (at) => {
    const v = vidRef.current;
    if (!v) return;
    v.currentTime = at;
    v.play?.().catch(() => { /* autoplay policies */ });
  };

  return (
    <div className="w-full lg:flex lg:h-full lg:flex-col">
      {/* framed like an app window — flexes to fill whatever height the
          column has, so a tall/portrait recording never forces a scrollbar
          inside its own box (it did before: w-full on a portrait video
          made it taller than the fixed-height column around it). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-300/70 bg-slate-900 shadow-2xl">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-700/60 bg-slate-800 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
          <span className="ml-3 text-[11px] font-medium text-slate-300">
            Watch a finished analysis in action
          </span>
        </div>
        <video
          ref={vidRef}
          src={`${import.meta.env.BASE_URL}landing-demo.mp4`}
          autoPlay muted loop playsInline controls
          className="block w-full lg:min-h-0 lg:flex-1 lg:object-contain"
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        />
      </div>

      {/* dynamic explanation, synced to the timeline */}
      <div key={idx} className="mt-3 shrink-0 rounded-xl border border-blue-200/70 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-baseline gap-2">
          <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
            {fmtTime(ch.at)}
          </span>
          <span className="text-xs font-bold text-blue-700">{ch.title}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{ch.body}</p>
      </div>

      {/* chapter buttons — click to jump */}
      <div className="mt-3 flex shrink-0 flex-wrap gap-1.5">
        {DEMO_CHAPTERS.map((c, i) => (
          <button
            key={c.at}
            onClick={() => seek(c.at)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              i === idx
                ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                : "border-slate-200 bg-white/80 text-slate-600 hover:border-blue-300 hover:text-blue-700"
            }`}
          >
            {fmtTime(c.at)} · {c.short}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- site footer ---------------- */

function SiteFooter({ onContact }) {
  return (
    <footer className="mt-auto border-t border-slate-200/70 bg-white/70 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <div className="rounded-xl border border-blue-200/70 bg-blue-50/80 px-4 py-3 text-center text-xs leading-relaxed text-blue-900">
          <strong>Try it before you pay:</strong> run one paper on the free sample or your own
          upload with your signup credit, no cost. If it's useful, add credit and analyze the
          papers you actually care about — and use the interactive labs to learn the method,
          not just read about it.
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="text-center text-xs text-slate-500 sm:text-left">
            <div className="font-semibold text-slate-700">Site owner &amp; contact</div>
            <div className="mt-1">Amirreza Naseri</div>
            <div className="mt-0.5 flex items-center justify-center gap-1 sm:justify-start">
              <MapPin size={11} className="shrink-0" /> Waltham, MA, USA
            </div>
            <div className="mt-0.5 flex items-center justify-center gap-1 sm:justify-start">
              <Mail size={11} className="shrink-0" /> amir73rn@gmail.com
            </div>
          </div>
          <button
            onClick={onContact}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700"
          >
            <Mail size={14} /> Send feedback
          </button>
        </div>

        <p className="mt-6 text-center text-[10px] text-slate-400">
          Interactive Paper Playground — turning scientific papers into explorable, interactive labs.
        </p>
      </div>
    </footer>
  );
}

/* ---------------- landing page ---------------- */

function Landing({
  onSample, onUpload, busy, progress, error, tier, onTier, balance, hints, onHints,
  codeFiles, onCodeFiles,
  authOn, signedIn, onSignIn, onSignUp, onSignOut, onOpenLibrary, onBuyCredits, owner, onContact,
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
            <button
              onClick={onContact}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700"
            >
              <Mail size={14} /> Contact
            </button>
            {signedIn ? (
              <>
                {owner ? (
                  <span className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                    <Wallet size={14} /> Owner · unlimited
                  </span>
                ) : (
                  <>
                    <BalanceBadge balance={balance} />
                    <button
                      onClick={onBuyCredits}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:border-emerald-400"
                    >
                      <Wallet size={14} /> Add credit
                    </button>
                  </>
                )}
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

      {/* ---------- fixed two-box arrangement (owner-approved layout) ----------
       * Text/options at x:5% y:32px w:47.5% h:944px, video at x:59.5% y:72px
       * w:38% h:832px, both absolutely placed at lg+; single stacked column
       * below that (no arrange UI — this is now the permanent layout). */}
      <main className="relative flex w-full flex-col gap-10 px-4 py-10 sm:px-8 lg:block lg:h-[1020px] lg:px-10">
        <div className="w-full lg:absolute lg:left-[5%] lg:top-[32px] lg:h-[944px] lg:w-[47.5%] lg:overflow-y-auto">
        <div className="flex w-full max-w-none flex-col items-start">
        <div className="mb-3 flex items-center gap-2 rounded-full border border-blue-200/60 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700 shadow-sm backdrop-blur">
          <Sparkles size={13} /> Leave the PDF aside — work with the paper
        </div>
        <h1 className="max-w-none text-left text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
          Turn any scientific paper into a{" "}
          <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-emerald-600 bg-clip-text text-transparent">
            living, interactive lab
          </span>
        </h1>
        <p className="mt-4 max-w-none text-left text-sm leading-relaxed text-slate-600">
          The analyzer walks you through a paper the way a good colleague would: the idea in
          pictures, the prior work it stands on, its own method with every coefficient on a
          slider, and its real result figures — recreated and reshaping live as you explore.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-start gap-2">
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

        {/* how it works */}
        <div className={`mt-8 grid w-full max-w-none grid-cols-1 gap-3 sm:grid-cols-3`}>
          {[
            {
              n: "1",
              title: "Drop in a paper",
              body: "Any scientific PDF — engineering, biology, economics, physics…",
            },
            {
              n: "2",
              title: "AI rebuilds it",
              body: "Figures explained, method on sliders, result plots recreated as code.",
            },
            {
              n: "3",
              title: "Explore & perturb",
              body: "Drag any coefficient and watch the paper's own figures reshape live.",
            },
          ].map((s) => (
            <div key={s.n} className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                {s.n}
              </span>
              <span>
                <span className="block text-xs font-semibold text-slate-800">{s.title}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{s.body}</span>
              </span>
            </div>
          ))}
        </div>

        <div className={`mt-8 grid w-full max-w-none gap-4 sm:grid-cols-2`}>
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
                "You're out of analysis credit — use the Add credit button above, or try the ready-made examples."
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

        <HintsPanel hints={hints} onHints={onHints} codeFiles={codeFiles} onCodeFiles={onCodeFiles} disabled={busy} />

        {busy && (
          <div className={`mt-6 w-full max-w-none rounded-xl border border-blue-200 bg-white/90 px-4 py-4 shadow-sm backdrop-blur`}>
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
          <div className={`mt-6 flex w-full max-w-none items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800`}>
            <TriangleAlert size={18} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Analysis failed</div>
              <div className="mt-0.5 text-xs leading-relaxed">{error}</div>
            </div>
          </div>
        )}

        <p className="mt-8 flex max-w-none items-center gap-1.5 text-left text-[11px] text-slate-400">
          <FileText size={12} className="shrink-0" />
          Your PDF passes through our AI analysis service and is not kept; only the
          finished interactive analysis is saved — privately, to your own library.
        </p>
        </div>
        </div>

        {/* ---------- demo video (fixed position/size at lg+) ---------- */}
        <div className="w-full lg:absolute lg:left-[59.5%] lg:top-[72px] lg:h-[832px] lg:w-[38%] lg:overflow-hidden">
          <VideoShowcase />
        </div>
      </main>

      <SiteFooter onContact={onContact} />
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
  const [codeFiles, setCodeFiles] = useState([]); // [{name, text}] — the paper's actual code (optional)

  // Auth is optional for browsing: anyone can open the sample papers. An
  // account is only required to analyze a new PDF (that spends credit and the
  // edge function needs an account to bill). The sign-in/up UI lives in the
  // landing page's top-right corner as a dismissible modal.
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!authEnabled);
  const [authOpen, setAuthOpen] = useState(null); // null | "signin" | "signup"
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
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

    if (!isOwnerUser(session) && balance !== null && balance <= 0) {
      setError("You're out of analysis credit — use the Add credit button to top up.");
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

      // Quality gate per phase: test-run the generated code and reject
      // flat/dead output, feeding the exact problems back for one automatic
      // regeneration. Each validator returns a problem list or null.
      const asNote = (probs) => (probs && probs.length ? probs.join("\n") : null);
      const validators = {
        overview: (s) => asNote(auditFoundations(s)),
        method: (s) => {
          try {
            const h = buildHelpers(s.protocol);
            return asNote([
              ...auditPipeline(s, compileSpec(s), h, defaultsFromSpec(s)),
              ...auditExplorables(s),
            ]);
          } catch { return null; }
        },
        results: (s) => {
          try {
            const h = buildHelpers(s.protocol);
            return asNote(auditResultFiguresQuality(s, compileSpec(s), h, defaultsFromSpec(s)));
          } catch { return null; }
        },
      };

      // Assemble the uploaded code (if any) into one annotated text blob.
      const codeText = codeFiles.length
        ? codeFiles.map((f) => `\n===== FILE: ${f.name} =====\n${f.text}`).join("\n")
        : null;

      const { spec: newSpec, remainingBalance } = await analyzePaper(base64, setProgress, tier, hints, validators, codeText);
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
  }, [tier, hints, codeFiles, balance, session]);

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
  const buyModal = buyOpen && (
    <BuyCredits onClose={() => setBuyOpen(false)} email={session?.user?.email} />
  );
  const contactModal = contactOpen && (
    <ContactModal onClose={() => setContactOpen(false)} prefillEmail={session?.user?.email} />
  );

  if (spec) {
    return (
      <>
        {bgLayer}
        <Workspace
          spec={spec}
          onBack={() => setSpec(null)}
          onSignOut={authEnabled && session ? signOut : null}
          isOwner={isOwnerUser(session) || import.meta.env.DEV}
        />
        {authModal}
        {libraryModal}
        {buyModal}
        {contactModal}
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
        codeFiles={codeFiles}
        onCodeFiles={setCodeFiles}
        authOn={authEnabled}
        signedIn={Boolean(session)}
        onSignIn={() => setAuthOpen("signin")}
        onSignUp={() => setAuthOpen("signup")}
        onSignOut={signOut}
        onOpenLibrary={() => setLibraryOpen(true)}
        onBuyCredits={() => setBuyOpen(true)}
        onContact={() => setContactOpen(true)}
        owner={isOwnerUser(session)}
      />
      {authModal}
      {libraryModal}
      {buyModal}
      {contactModal}
    </>
  );
}
