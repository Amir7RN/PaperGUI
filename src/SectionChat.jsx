/**
 * Per-section AI assistant dock.
 *
 * One floating panel, opened from any section header's "Ask AI" chip. Each
 * section keeps its own thread; the assistant only sees a compact digest of
 * the open section (built in sectionChat.js), and the server scopes it to
 * that topic. Free while the platform is in its feedback phase.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, X, Sparkles, LogIn } from "lucide-react";
import { buildSectionContext, askSectionAssistant } from "./sectionChat.js";

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

export default function SectionChat({ spec, open, onClose }) {
  // one thread per section, kept for the whole visit
  const [threads, setThreads] = useState({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const sectionId = open?.sectionId || null;
  const messages = threads[sectionId] || [];

  const context = useMemo(
    () => (sectionId ? buildSectionContext(spec, sectionId) : ""),
    [spec, sectionId]
  );

  useEffect(() => {
    setError(null);
    setInput("");
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [sectionId, open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  if (!open) return null;

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setError(null);
    const next = [...messages, { role: "user", content: q }];
    setThreads((t) => ({ ...t, [sectionId]: next }));
    setBusy(true);
    try {
      const reply = await askSectionAssistant({
        paperTitle: spec.meta?.title,
        sectionTitle: open.title,
        context,
        messages: next.map(({ role, content }) => ({ role, content })),
      });
      setThreads((t) => ({ ...t, [sectionId]: [...next, { role: "assistant", content: reply }] }));
    } catch (e) {
      setError({ message: e.message, code: e.code });
      // leave the question in the thread so retry is one click
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-h-[min(620px,calc(100vh-2rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-2xl">
      {/* header */}
      <div className="flex items-center gap-2.5 bg-indigo-600 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Bot size={17} className="text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-white">Section assistant</div>
          <div className="truncate text-[10.5px] text-indigo-100">
            {open.title} · answers only about this section
          </div>
        </div>
        <button onClick={onClose} aria-label="Close chat"
          className="rounded-full p-1.5 text-indigo-100 hover:bg-white/15 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* messages */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-3 py-3">
        {!messages.length && (
          <div className="rounded-xl border border-indigo-100 bg-white p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-indigo-700">
              <Sparkles size={12} /> Ask me anything about “{open.title}”
            </div>
            <p className="mb-2 text-[11.5px] leading-relaxed text-slate-600">
              I can explain this section's plots, equations, sliders and physics — in plain
              language. I only know this section, so keep it on topic.
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

        {messages.map((m, i) => (
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
                  <span key={k} className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400"
                    style={{ animationDelay: `${k * 140}ms` }} />
                ))}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-800">
            {error.code === "auth" ? (
              <span className="flex items-center gap-1.5">
                <LogIn size={12} className="shrink-0" /> {error.message}
              </span>
            ) : (
              <>
                {error.message}{" "}
                <button onClick={() => {
                  // retry: last message is the unanswered user question
                  const last = messages[messages.length - 1];
                  if (last?.role === "user") {
                    setThreads((t) => ({ ...t, [sectionId]: messages.slice(0, -1) }));
                    send(last.content);
                  }
                }} className="font-semibold text-amber-900 underline">retry</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex items-end gap-2 border-t border-slate-100 bg-white px-3 py-2.5"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          rows={1}
          maxLength={1500}
          placeholder={`Ask about ${open.title.toLowerCase()}…`}
          className="max-h-24 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] leading-snug text-slate-800 outline-none focus:border-indigo-400"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
          <Send size={15} />
        </button>
      </form>
      <p className="bg-white px-3 pb-2 text-center text-[9.5px] text-slate-400">
        Free while in beta · answers come from this page's analysis, not the raw PDF — verify against the paper.
      </p>
    </div>
  );
}
