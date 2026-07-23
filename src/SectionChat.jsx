/**
 * Per-section learning companion dock.
 *
 * One floating panel, opened from any section header's "Ask AI" chip, with
 * three modes that turn a section into a small classroom:
 *   - Ask   — reactive Q&A, scoped to this section (the original assistant).
 *   - Tutor — a Socratic tutor that ASKS the reader questions and probes
 *             misconceptions, pointing at the section's own figures/sliders.
 *   - Quiz  — the analyzer's active-recall checkpoints (client-scored MCQs)
 *             plus an "explain it back" box graded by the model.
 *
 * The assistant only ever sees a compact digest of the open section (built in
 * sectionChat.js); the server scopes it to that topic. Free while in beta.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, X, Sparkles, LogIn, GraduationCap, ListChecks, MessageCircle, Check, RotateCcw } from "lucide-react";
import { buildSectionContext, askSectionAssistant, checkpointsForSection } from "./sectionChat.js";

const STARTERS = {
  story: ["Explain this paper like I'm new to the field", "What exactly was impossible before this paper?"],
  mindmap: ["Walk me through this map left to right", "Which contribution matters most?"],
  concept: ["Explain the physics in this figure", "Why does this design work?"],
  foundations: ["Why do I need this background?", "Explain this plot's axes to me"],
  model: ["Was this experiment or simulation?", "Explain the main equation term by term"],
  method: ["What does each slider actually change?", "Explain this step's equation simply"],
  explorables: ["What should I try first here?", "What is this explorer showing?"],
  results: ["What's the headline result in this figure?", "What does the log axis mean here?"],
  reverse: ["What does the match % mean?", "Why doesn't auto-fit recover every parameter exactly?"],
};

const MODES = [
  { id: "ask", label: "Ask", icon: MessageCircle, sub: "answers about this section" },
  { id: "tutor", label: "Tutor", icon: GraduationCap, sub: "a Socratic tutor quizzes you" },
  { id: "quiz", label: "Quiz", icon: ListChecks, sub: "test yourself · explain it back" },
];

export default function SectionChat({ spec, open, onClose }) {
  const [mode, setMode] = useState("ask");
  // one thread per (section, mode) — Ask and Tutor keep separate histories
  const [threads, setThreads] = useState({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const sectionId = open?.sectionId || null;
  const threadKey = `${sectionId}:${mode}`;
  const messages = threads[threadKey] || [];
  const apiMode = mode === "tutor" ? "tutor" : "qa";

  const context = useMemo(
    () => (sectionId ? buildSectionContext(spec, sectionId) : ""),
    [spec, sectionId]
  );
  const checkpoints = useMemo(
    () => (sectionId ? checkpointsForSection(spec, sectionId) : []),
    [spec, sectionId]
  );

  useEffect(() => {
    setError(null);
    setInput("");
    if (open && mode !== "quiz") setTimeout(() => inputRef.current?.focus(), 50);
  }, [sectionId, open, mode]);

  useEffect(() => {
    if (mode !== "quiz") listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, mode]);

  // Tutor opens itself: on entering Tutor with an empty thread, ask the model
  // for its opening question (sent as a hidden "(begin)" user turn).
  useEffect(() => {
    if (open && mode === "tutor" && sectionId && !threads[threadKey] && !busy) {
      send("(begin)", { hidden: true, seed: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, sectionId]);

  if (!open) return null;

  const send = async (text, opts = {}) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    if (!opts.seed) setInput("");
    setError(null);
    const userMsg = { role: "user", content: q, ...(opts.hidden ? { hidden: true } : {}) };
    const prev = threads[threadKey] || [];
    const next = [...prev, userMsg];
    setThreads((t) => ({ ...t, [threadKey]: next }));
    setBusy(true);
    try {
      const reply = await askSectionAssistant({
        paperTitle: spec.meta?.title,
        sectionTitle: open.title,
        context,
        messages: next.map(({ role, content }) => ({ role, content })),
        mode: apiMode,
      });
      setThreads((t) => ({ ...t, [threadKey]: [...next, { role: "assistant", content: reply }] }));
    } catch (e) {
      setError({ message: e.message, code: e.code });
    } finally {
      setBusy(false);
    }
  };

  const retryLast = () => {
    const cur = threads[threadKey] || [];
    const last = cur[cur.length - 1];
    if (last?.role === "user") {
      setThreads((t) => ({ ...t, [threadKey]: cur.slice(0, -1) }));
      send(last.content, last.hidden ? { hidden: true, seed: true } : {});
    }
  };

  const visible = messages.filter((m) => !m.hidden);
  const activeMode = MODES.find((m) => m.id === mode);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-h-[min(640px,calc(100vh-2rem))] w-[min(410px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-2xl">
      {/* header */}
      <div className="flex items-center gap-2.5 bg-indigo-600 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Bot size={17} className="text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-white">Learning companion</div>
          <div className="truncate text-[10.5px] text-indigo-100">{open.title} · {activeMode.sub}</div>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-indigo-100 hover:bg-white/15 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* mode tabs */}
      <div className="flex gap-1 border-b border-slate-100 bg-indigo-50/50 px-2 py-1.5">
        {MODES.map((m) => {
          const Icon = m.icon;
          const on = m.id === mode;
          return (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition ${
                on ? "bg-indigo-600 text-white shadow-sm" : "text-indigo-700 hover:bg-indigo-100"
              }`}>
              <Icon size={13} /> {m.label}
              {m.id === "quiz" && checkpoints.length > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 text-[9px] font-bold ${on ? "bg-white/25 text-white" : "bg-indigo-200 text-indigo-800"}`}>
                  {checkpoints.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {mode === "quiz" ? (
        <QuizPane spec={spec} open={open} context={context} checkpoints={checkpoints} />
      ) : (
        <>
          {/* messages */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-3 py-3">
            {!visible.length && !busy && mode === "ask" && (
              <div className="rounded-xl border border-indigo-100 bg-white p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-indigo-700">
                  <Sparkles size={12} /> Ask me anything about “{open.title}”
                </div>
                <p className="mb-2 text-[11.5px] leading-relaxed text-slate-600">
                  I explain this section's plots, equations, sliders and physics — in plain language. I only
                  know this section, so keep it on topic.
                </p>
                <div className="flex flex-col gap-1.5">
                  {(STARTERS[sectionId] || []).map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[11.5px] text-slate-700 hover:border-indigo-300 hover:text-indigo-700">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {visible.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-sm bg-indigo-600 text-white"
                    : "rounded-bl-sm border border-slate-200 bg-white text-slate-700"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2">
                  <span className="inline-flex gap-1">
                    {[0, 1, 2].map((k) => (
                      <span key={k} className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: `${k * 140}ms` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-800">
                {error.code === "auth" ? (
                  <span className="flex items-center gap-1.5"><LogIn size={12} className="shrink-0" /> {error.message}</span>
                ) : (
                  <>{error.message}{" "}
                    <button onClick={retryLast} className="font-semibold text-amber-900 underline">retry</button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* input */}
          <form onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-end gap-2 border-t border-slate-100 bg-white px-3 py-2.5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              maxLength={1500}
              placeholder={mode === "tutor" ? "Answer the tutor, or ask to explain…" : `Ask about ${open.title.toLowerCase()}…`}
              className="max-h-24 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] leading-snug text-slate-800 outline-none focus:border-indigo-400"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
              <Send size={15} />
            </button>
          </form>
          <p className="bg-white px-3 pb-2 text-center text-[9.5px] text-slate-400">
            Free while in beta · grounded in this page's analysis, not the raw PDF — verify against the paper.
          </p>
        </>
      )}
    </div>
  );
}

/* ---------------- Quiz pane: checkpoints + explain-it-back ---------------- */

function QuizPane({ spec, open, context, checkpoints }) {
  const [picks, setPicks] = useState({});   // qIdx -> chosen option idx
  const [summary, setSummary] = useState("");
  const [grade, setGrade] = useState(null);
  const [grading, setGrading] = useState(false);
  const [gradeErr, setGradeErr] = useState(null);

  // reset when the section changes
  const sectionId = open?.sectionId;
  useEffect(() => { setPicks({}); setSummary(""); setGrade(null); setGradeErr(null); }, [sectionId]);

  const answered = Object.keys(picks).length;
  const correct = checkpoints.reduce((n, c, i) => n + (picks[i] === c.answerIdx ? 1 : 0), 0);

  const gradeSummary = async () => {
    const text = summary.trim();
    if (!text || grading) return;
    setGrading(true); setGradeErr(null); setGrade(null);
    try {
      const reply = await askSectionAssistant({
        paperTitle: spec.meta?.title,
        sectionTitle: open.title,
        context,
        messages: [{ role: "user", content: text }],
        mode: "grade",
      });
      setGrade(reply);
    } catch (e) {
      setGradeErr({ message: e.message, code: e.code });
    } finally {
      setGrading(false);
    }
  };

  return (
    <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-3 py-3">
      {checkpoints.length > 0 ? (
        <>
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">Checkpoints</span>
            {answered > 0 && (
              <span className="text-[11px] font-semibold text-slate-500">
                {correct}/{checkpoints.length} correct
              </span>
            )}
          </div>
          {checkpoints.map((c, qi) => {
            const chosen = picks[qi];
            const done = chosen !== undefined;
            return (
              <div key={qi} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-[12.5px] font-semibold leading-snug text-slate-800">{c.question}</p>
                <div className="flex flex-col gap-1.5">
                  {c.options.map((opt, oi) => {
                    const isAnswer = oi === c.answerIdx;
                    const isChosen = oi === chosen;
                    let cls = "border-slate-200 bg-white text-slate-700 hover:border-indigo-300";
                    if (done && isAnswer) cls = "border-emerald-300 bg-emerald-50 text-emerald-800";
                    else if (done && isChosen) cls = "border-rose-300 bg-rose-50 text-rose-800";
                    else if (done) cls = "border-slate-200 bg-white text-slate-400";
                    return (
                      <button key={oi} disabled={done} onClick={() => setPicks((p) => ({ ...p, [qi]: oi }))}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] transition ${cls}`}>
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${
                          done && isAnswer ? "border-emerald-500 bg-emerald-500 text-white"
                          : done && isChosen ? "border-rose-500 bg-rose-500 text-white" : "border-slate-300 text-slate-400"
                        }`}>
                          {done && isAnswer ? <Check size={10} /> : String.fromCharCode(65 + oi)}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {done && (
                  <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${
                    chosen === c.answerIdx ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                  }`}>
                    {chosen === c.answerIdx ? "Correct. " : "Not quite. "}{c.why}
                  </p>
                )}
              </div>
            );
          })}
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-[11.5px] leading-relaxed text-slate-500">
          No ready-made checkpoints for this section. Use <strong>Explain it back</strong> below, or the
          <strong> Tutor</strong> tab to be quizzed live.
        </div>
      )}

      {/* explain it back */}
      <div className="rounded-xl border border-indigo-100 bg-white p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-indigo-700">
          <GraduationCap size={12} /> Explain it back
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
          Summarize “{open.title}” in your own words. I'll grade it against the paper and show what you
          missed — the fastest way to find the gaps in your understanding.
        </p>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          maxLength={1400}
          placeholder="In my own words, this section says…"
          className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-[12px] leading-snug text-slate-800 outline-none focus:border-indigo-400"
        />
        <div className="mt-2 flex items-center gap-2">
          <button onClick={gradeSummary} disabled={grading || !summary.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
            {grading ? "Grading…" : "Grade my summary"}
          </button>
          {grade && (
            <button onClick={() => { setGrade(null); setSummary(""); }}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700">
              <RotateCcw size={11} /> again
            </button>
          )}
        </div>
        {gradeErr && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            {gradeErr.code === "auth"
              ? <span className="flex items-center gap-1.5"><LogIn size={11} /> {gradeErr.message}</span>
              : gradeErr.message}
          </p>
        )}
        {grade && (
          <div className="mt-2 whitespace-pre-wrap rounded-lg border border-emerald-100 bg-emerald-50/60 px-2.5 py-2 text-[12px] leading-relaxed text-slate-700">
            {grade}
          </div>
        )}
      </div>
      <p className="pb-1 text-center text-[9.5px] text-slate-400">
        Free while in beta · grounded in this page's analysis — verify against the paper.
      </p>
    </div>
  );
}
