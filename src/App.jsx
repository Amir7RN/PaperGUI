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
import { SAMPLE_SPEC_3 } from "./samplePaper3.js";
import { SAMPLE_SPEC_4 } from "./samplePaper4.js";
import { SAMPLE_SPEC_5 } from "./samplePaper5.js";
import { SAMPLE_SPEC_6 } from "./samplePaper6.js";
import { SAMPLE_SPEC_7 } from "./samplePaper7.js";
import { SAMPLE_SPEC_8 } from "./samplePaper8.js";
import { SAMPLE_SPEC_9 } from "./samplePaper9.js";
import { analyzePaper, MODEL_TIERS, getModelTier, setModelTier } from "./api.js";
import { fileToBase64, renderPdfRegions } from "./pdf.js";
import {
  compileSpec, buildHelpers, defaultsFromSpec, runSpec, validateResultFigures,
  auditPipeline, auditResultFiguresQuality, auditFigureFidelity, auditFoundations, auditExplorables,
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
      {/* ===================== HERO ===================== */}
      <main className="w-full">
        <section className="border-b border-slate-200/70 bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[1.04fr_1fr] lg:py-20">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <FlaskConical size={13} className="text-blue-600" /> Interactive Paper Playground
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl">
                The paper, rebuilt<br className="hidden sm:block" /> as something you can <span className="text-blue-600">play with.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-600">
                Upload a scientific PDF and get its <strong className="text-slate-800">real figures recreated and reshaping under your cursor</strong>, its
                method on sliders, and a tutor for every section. A chatbot gives you paragraphs about a
                paper. This hands you the paper itself — visual, interactive, and grounded in its own numbers.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => (requireAuthToUpload ? onSignUp() : fileRef.current?.click())}
                  disabled={busy || (signedIn && balance !== null && balance <= 0)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                >
                  <Upload size={16} /> Analyze a paper
                </button>
                <button
                  onClick={() => document.getElementById("examples")?.scrollIntoView({ behavior: "smooth" })}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <BookOpenCheck size={16} className="text-blue-600" /> Open a live example
                </button>
              </div>
              <p className="mt-4 text-[12px] text-slate-400">
                Free to try — new accounts get $1.00 of analysis credit. Ready-made examples need no sign-in.
              </p>
            </div>

            <div className="lg:pl-4">
              <VideoShowcase />
            </div>
          </div>
        </section>

        {/* ===================== DIFFERENTIATION ===================== */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Why not just ask a chatbot?</div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Because a paper isn't text. It's figures, methods and numbers.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
              Ask a chatbot and you get more paragraphs to read. Here you get the paper's own figures back —
              live, tunable, and honest about what it actually shows.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: LineChart, tone: "text-emerald-600 bg-emerald-50", title: "The real figures, recreated", body: "Digitized point-for-point off the PDF and made interactive — hover, compare, read exact values. Not a description of the figure. The figure." },
              { icon: SlidersHorizontal, tone: "text-blue-600 bg-blue-50", title: "The method on knobs", body: "Every coefficient the paper reports becomes a slider. Turn it and the reproduced figures reshape live, so you feel what each parameter does." },
              { icon: Wand2, tone: "text-violet-600 bg-violet-50", title: "A tutor for every section", body: "Ask, get Socratically quizzed, or talk by voice — grounded only in this paper's own content, section by section." },
              { icon: FileText, tone: "text-amber-600 bg-amber-50", title: "Trust by construction", body: "Every number traces to a figure, table or equation, and claims are tagged shown vs asserted. Nothing invented." },
            ].map(({ icon: Icon, tone, title, body }) => (
              <div key={title} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={18} /></span>
                <h3 className="mt-4 text-[15px] font-bold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{body}</p>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-px overflow-hidden rounded-2xl border border-slate-200 sm:flex-row">
            <div className="flex-1 bg-slate-50 px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">A chatbot</div>
              <div className="mt-1 text-[13px] text-slate-600">Paragraphs of text about the paper — that you still have to read, and can't verify.</div>
            </div>
            <div className="flex-1 bg-slate-900 px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-300">This playground</div>
              <div className="mt-1 text-[13px] text-white">The paper's figures, live and tunable, with a tutor and the numbers in your hands.</div>
            </div>
          </div>
        </section>

        {/* ===================== TRY IT / EXAMPLES ===================== */}
        <section id="examples" className="border-t border-slate-200/70 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start">
              {/* upload + options */}
              <div className="lg:sticky lg:top-6">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Try it now</h2>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">
                  Bring your own paper, or open a ready-made example on the right — no sign-in needed for those.
                </p>

                <button
                  onClick={() => (requireAuthToUpload ? onSignUp() : fileRef.current?.click())}
                  disabled={busy || (signedIn && balance !== null && balance <= 0)}
                  className="group mt-5 flex w-full flex-col items-start gap-2 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40 p-5 text-left transition hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition group-hover:scale-105">
                    <Upload size={19} />
                  </span>
                  <span className="text-[15px] font-semibold text-slate-900">Analyze your own PDF</span>
                  <span className="text-[12.5px] leading-relaxed text-slate-500">
                    {requireAuthToUpload
                      ? "Sign up free — new accounts get $1.00 of analysis credit, and every paper you analyze is saved to your library."
                      : signedIn && balance !== null && balance <= 0
                        ? "You're out of analysis credit — add credit above, or open a ready-made example."
                        : <>Local drive or synced OneDrive / Google Drive. Built at the <strong>{tier.label}</strong> level below.</>}
                  </span>
                </button>
                <input
                  ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(f); }}
                />

                <div className="mt-4 space-y-3">
                  <TierPicker tier={tier} onTier={onTier} disabled={busy} />
                  <HintsPanel hints={hints} onHints={onHints} codeFiles={codeFiles} onCodeFiles={onCodeFiles} disabled={busy} />
                </div>

                {busy && (
                  <div className="mt-4 rounded-xl border border-blue-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex items-center gap-3 text-sm text-blue-900">
                      <Loader2 size={18} className="shrink-0 animate-spin" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{progress?.label || "Working…"}</div>
                        <div className="text-xs text-slate-500">Deep analysis can take a few minutes — keep this tab open.</div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-blue-700">{Math.round(progress?.pct || 0)}%</span>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${Math.max(3, Math.min(100, progress?.pct || 0))}%` }} />
                    </div>
                  </div>
                )}
                {error && !busy && (
                  <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <TriangleAlert size={18} className="mt-0.5 shrink-0" />
                    <div><div className="font-medium">Analysis failed</div><div className="mt-0.5 text-xs leading-relaxed">{error}</div></div>
                  </div>
                )}

                <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
                  <FileText size={12} className="mt-0.5 shrink-0" />
                  Your PDF isn't kept — only the finished interactive analysis is saved, privately, to your own library.
                </p>
              </div>

              {/* ready-made gallery */}
              <div>
                <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <BookOpenCheck size={14} className="text-blue-600" /> Ready-made examples · no sign-in
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { spec: SAMPLE_SPEC_5, tag: "Nature Materials", title: "Phonon interference in one molecule", teaser: "Picowatt heat flow — every trace, histogram and spectrum replotted, interference physics you can play with." },
                    { spec: SAMPLE_SPEC_4, tag: "Science Robotics", title: "Quadruped robots in the wild", teaser: "33 panels from the authors' source data — the tri-sector gait wheel, terrain runs and a 6 m/s stair-jump." },
                    { spec: SAMPLE_SPEC_9, tag: "Cell Reports Sust.", title: "Decarbonized power-gas planning", teaser: "Annual & peak demand and system cost by scenario, reproduced point-for-point as interactive charts." },
                    { spec: SAMPLE_SPEC_3, tag: "Supply-chain ML", title: "Hierarchical ML forecasting", teaser: "Every figure digitized in its original form — grouped bars, 10-curve lines, calendar heat-maps, radars." },
                    { spec: SAMPLE_SPEC_2, tag: "Robotics", title: "Humanoid whole-body control", teaser: "Figs 3–11 recreated: 12-joint tracking, spiky error traces, CoM & ground forces across scenarios." },
                    { spec: SAMPLE_SPEC_6, tag: "PRX Energy", title: "Zero-gap thermophotonics", teaser: "A live reduced model — LED voltage, spacer index and EQE on sliders, chasing the paper's own curves." },
                    { spec: SAMPLE_SPEC_8, tag: "Automatica", title: "Compositional synthesis (AG contracts)", teaser: "Grounded background, narrated explainers, and the convex potential & scalability table on live sliders." },
                    { spec: SAMPLE_SPEC_7, tag: "Autom. in Constr.", title: "Prefab checking with 3D scans + BIM", teaser: "Catch module mismatches before shipment — a live Table-6 confidence rebuilt from Eq. 3." },
                    { spec: SAMPLE_SPEC, tag: "Signals · easy", title: "Multi-stage filtering & control", teaser: "A signal-conditioning + feedback example — the gentlest first look at how the labs work." },
                  ].map((s) => (
                    <button
                      key={s.title}
                      onClick={() => onSample(s.spec)}
                      disabled={busy}
                      className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg disabled:opacity-50"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{s.tag}</span>
                        <LineChart size={14} className="text-slate-300 transition group-hover:text-blue-500" />
                      </div>
                      <span className="mt-2.5 text-[14px] font-bold leading-snug text-slate-900">{s.title}</span>
                      <span className="mt-1 text-[12px] leading-relaxed text-slate-500">{s.teaser}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
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
            return asNote([
              ...auditFigureFidelity(s),
              ...auditResultFiguresQuality(s, compileSpec(s), h, defaultsFromSpec(s)),
            ]);
          } catch {
            // pipeline-less papers can throw in buildHelpers/compile — the
            // fidelity gate still runs (it needs no pipeline).
            try { return asNote(auditFigureFidelity(s)); } catch { return null; }
          }
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
        // Sections 4 & 5 (Background + Model) now ground their live plots against
        // the paper's OWN figure. Those figure refs carry a page+bbox too, so they
        // ride the same crop pass — a foundation's `figure` and a model equation's
        // `figure` each get a real `.image`, which is what stops those sections
        // reading as invented.
        const foundFigs = (newSpec.foundations || [])
          .map((f) => f.figure).filter((g) => g && g.bbox);
        const eqFigs = (newSpec.model?.equations || [])
          .map((e) => e.figure).filter((g) => g && g.bbox);
        const groundFigs = [...foundFigs, ...eqFigs];
        const items = [...concept, ...results, ...groundFigs].map((f) => ({ page: f.page, bbox: f.bbox }));
        const crops = await renderPdfRegions(arrayBuffer, items);
        // A concept figure carrying an animated SVG rebuild shows THAT instead
        // of the flat page crop — don't attach an image that would override it.
        concept.forEach((f, i) => { if (crops[i] && !f.svg) f.image = crops[i]; });
        results.forEach((f, i) => { if (crops[concept.length + i]) f.image = crops[concept.length + i]; });
        const gOff = concept.length + results.length;
        groundFigs.forEach((g, i) => { if (crops[gOff + i]) g.image = crops[gOff + i]; });
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
