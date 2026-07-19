/**
 * In-app narrated "explainer video" for sections 4 & 5.
 *
 * This is the all-in-one answer to "attach a NotebookLM tutorial" WITHOUT the
 * single-account bottleneck: the scenes come from the paper's own spec, the
 * voice-over is OpenAI TTS cached per line (see narrate.js / the `narrate` edge
 * function), and the whole thing plays inline — no external service at runtime,
 * so it scales to any number of viewers.
 *
 * A scene = a caption (read), a narration line (heard), and a visual (seen).
 * The parent decides how to draw each visual via `renderVisual(visual, idx)`,
 * so the same player serves both the Background figures and the Model equations.
 *
 * Degrades gracefully: if audio can't be fetched (not signed in, or no TTS key
 * configured yet), it plays as a timed, captioned slideshow instead of failing.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Volume2, VolumeX, Captions } from "lucide-react";
import { fetchSceneAudio } from "./narrate.js";

const wordCount = (s) => (s ? s.trim().split(/\s+/).length : 0);
// caption-only fallback: ~2.6 spoken words/sec, min 3.5s per scene
const fallbackMs = (s) => Math.max(3500, Math.round((wordCount(s) / 2.6) * 1000));

export default function ExplainerVideo({ explainer, renderVisual, accent = "#6366f1" }) {
  const scenes = explainer?.scenes || [];
  const voice = explainer?.voice || "onyx";

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [audioFailed, setAudioFailed] = useState(false); // fell back to timed mode
  const [note, setNote] = useState(null);
  const [progress, setProgress] = useState(0); // 0..1 within the current scene

  const audioRef = useRef(null);
  const fallbackTimer = useRef(null);
  const rafRef = useRef(null);
  const reqId = useRef(0); // guards against out-of-order async scene loads

  const clearTimers = useCallback(() => {
    if (fallbackTimer.current) { clearTimeout(fallbackTimer.current); fallbackTimer.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const advance = useCallback(() => {
    setIdx((i) => {
      if (i + 1 < scenes.length) return i + 1;
      setPlaying(false);           // reached the end
      return i;
    });
  }, [scenes.length]);

  // Drive the current scene whenever idx / playing changes.
  useEffect(() => {
    clearTimers();
    setProgress(0);
    if (!playing || !scenes[idx]) return;
    const myReq = ++reqId.current;
    const narration = scenes[idx].narration || "";

    // timed, caption-only playback (no audio)
    const runFallback = () => {
      const dur = fallbackMs(narration);
      const start = performance.now();
      const tick = () => {
        if (reqId.current !== myReq) return;
        const p = Math.min(1, (performance.now() - start) / dur);
        setProgress(p);
        if (p < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      fallbackTimer.current = setTimeout(() => { if (reqId.current === myReq) advance(); }, dur);
    };

    if (audioFailed || !narration) { runFallback(); return; }

    // audio playback
    (async () => {
      try {
        const src = await fetchSceneAudio(narration, voice);
        if (reqId.current !== myReq) return;
        const a = audioRef.current;
        if (!a) return;
        a.src = src;
        a.muted = muted;
        await a.play();
      } catch (err) {
        if (reqId.current !== myReq) return;
        setAudioFailed(true);
        setNote(err?.code === "auth"
          ? "Sign in (free) for the voice-over — playing captions for now."
          : "Voice-over unavailable — playing captions instead.");
        runFallback();
      }
    })();

    return clearTimers;
  }, [idx, playing, audioFailed, muted, voice, scenes, advance, clearTimers]);

  // <audio> events: progress + auto-advance on end.
  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (a?.duration) setProgress(Math.min(1, a.currentTime / a.duration));
  };
  const onEnded = () => advance();

  const start = () => {
    if (!scenes.length) return;
    if (idx >= scenes.length - 1 && !playing) setIdx(0);
    setPlaying(true);
  };
  const pause = () => { setPlaying(false); if (audioRef.current) audioRef.current.pause(); clearTimers(); };
  const toggle = () => (playing ? pause() : start());
  const goto = (i) => { clearTimers(); if (audioRef.current) audioRef.current.pause(); setIdx(Math.max(0, Math.min(scenes.length - 1, i))); };
  const restart = () => { goto(0); setPlaying(true); };

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!scenes.length) return null;
  const cur = scenes[idx];
  const overall = (idx + progress) / scenes.length;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 text-slate-100 shadow-lg">
      <audio ref={audioRef} onTimeUpdate={onTimeUpdate} onEnded={onEnded} className="hidden" />

      {/* header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2"
        style={{ background: `linear-gradient(90deg, ${accent}22, transparent)` }}>
        <span className="flex items-center gap-2 text-[12px] font-bold">
          <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: accent }}>
            <Play size={12} className="translate-x-[1px]" fill="white" />
          </span>
          Watch: a 60-second walkthrough
        </span>
        <span className="text-[10px] font-medium text-slate-400 tabular-nums">
          {idx + 1} / {scenes.length}
        </span>
      </div>

      {/* stage: the visual for this scene — fills the whole frame */}
      <div className="relative aspect-[16/9] w-full bg-slate-950">
        <div className={`absolute inset-0 overflow-hidden p-2 ${showCaptions ? "pb-24" : ""}`}>
          <div className="h-full w-full">
            {renderVisual ? renderVisual(cur.visual, idx) : null}
          </div>
        </div>
        {/* caption overlay */}
        {showCaptions && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
            <div className="mx-auto max-w-3xl rounded-lg bg-black/70 px-3 py-2 backdrop-blur">
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: accent }}>
                {cur.caption}
              </div>
              <div className="mt-0.5 text-[12.5px] leading-snug text-slate-100">{cur.narration}</div>
            </div>
          </div>
        )}
      </div>

      {/* scrubber: one segment per scene */}
      <div className="flex gap-1 px-3 pt-2">
        {scenes.map((_, i) => (
          <button key={i} onClick={() => goto(i)}
            className="group relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"
            title={`Scene ${i + 1}: ${scenes[i].caption}`}>
            <span className="absolute inset-y-0 left-0 rounded-full transition-[width]"
              style={{
                width: i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%",
                background: accent,
              }} />
          </button>
        ))}
      </div>

      {/* transport */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-1">
          <Ctl title="Restart" onClick={restart}><RotateCcw size={15} /></Ctl>
          <Ctl title="Previous scene" onClick={() => goto(idx - 1)} disabled={idx === 0}><SkipBack size={15} /></Ctl>
          <button onClick={toggle}
            className="grid h-9 w-9 place-items-center rounded-full text-slate-900 transition hover:brightness-110"
            style={{ background: accent }} title={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="translate-x-[1px]" />}
          </button>
          <Ctl title="Next scene" onClick={() => goto(idx + 1)} disabled={idx >= scenes.length - 1}><SkipForward size={15} /></Ctl>
        </div>
        <div className="flex items-center gap-1">
          <Ctl title={showCaptions ? "Hide captions" : "Show captions"} onClick={() => setShowCaptions((v) => !v)}
            active={showCaptions}><Captions size={15} /></Ctl>
          <Ctl title={muted ? "Unmute" : "Mute"} onClick={() => { setMuted((m) => { const n = !m; if (audioRef.current) audioRef.current.muted = n; return n; }); }}
            disabled={audioFailed}>
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </Ctl>
        </div>
      </div>

      {note && (
        <div className="border-t border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300">{note}</div>
      )}
      {/* thin overall-progress hairline */}
      <div className="h-0.5 w-full bg-white/10">
        <div className="h-full transition-[width]" style={{ width: `${overall * 100}%`, background: accent }} />
      </div>
    </div>
  );
}

function Ctl({ children, onClick, title, disabled, active }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`grid h-8 w-8 place-items-center rounded-lg transition disabled:opacity-30 ${
        active ? "bg-white/20 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}>
      {children}
    </button>
  );
}
