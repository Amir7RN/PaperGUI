/**
 * useVoice.js — free, browser-native voice for the section assistant.
 *
 * No paid API: speech-to-text uses the Web Speech API (webkitSpeechRecognition)
 * and text-to-speech uses window.speechSynthesis with the same preferred-voice
 * ladder as the muscle-atlas coach (Microsoft Aria/Jenny Online → Google US
 * English → Samantha …) at a slightly slower, easy-to-follow rate. Both degrade
 * gracefully (supported:false) on browsers without the APIs.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------- speech recognition (STT) ---------------- */

function recognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Push-to-talk dictation. start() opens the mic; the running transcript streams
 * into `transcript`; onFinal(text) fires when the user pauses (or the recognizer
 * ends) with the finished utterance so the caller can send it.
 */
export function useVoiceInput({ lang = "en-US", onFinal } = {}) {
  const Ctor = recognitionCtor();
  const supported = !!Ctor;
  const recRef = useRef(null);
  const finalRef = useRef("");
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onstart = () => { setListening(true); setError(null); };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current = (finalRef.current + " " + r[0].transcript).trim();
        else interim += r[0].transcript;
      }
      setTranscript([finalRef.current, interim].filter(Boolean).join(" ").trim());
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(e.error);
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      const text = finalRef.current.trim();
      if (text) onFinalRef.current?.(text);
    };
    recRef.current = rec;
    return () => { try { rec.abort(); } catch { /* already gone */ } };
  }, [Ctor, lang]);

  const start = useCallback(() => {
    if (!recRef.current) return;
    finalRef.current = "";
    setTranscript("");
    setError(null);
    try { recRef.current.start(); } catch (e) {
      if (!String(e?.message).includes("already started")) setError(String(e?.message || e));
    }
  }, []);
  const stop = useCallback(() => { try { recRef.current?.stop(); } catch { /* noop */ } }, []);

  return { supported, listening, transcript, error, start, stop };
}

/* ---------------- speech synthesis (TTS) ---------------- */

const VOICE_PRIORITY = [
  /Microsoft Aria.*Online/i, /Microsoft Jenny.*Online/i, /Microsoft Sonia.*Online/i,
  /^Google US English$/i, /^Google UK English Female$/i,
  /^Samantha$/i, /^Karen$/i, /^Daniel$/i, /^Moira$/i,
];

function pickVoice(lang) {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  for (const re of VOICE_PRIORITY) {
    const m = voices.find((v) => re.test(v.name));
    if (m) return m;
  }
  return (
    voices.find((v) => /en[-_]US/i.test(v.lang)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith("en")) ||
    voices[0] || null
  );
}

/** Spoken replies with the preferred voice. speak(text) reads it aloud; cancel()
 *  stops. Voices load async, so we refresh on voiceschanged and poll briefly. */
export function useVoiceOutput({ lang = "en-US" } = {}) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef(null);

  useEffect(() => {
    if (!supported) return;
    const refresh = () => { voiceRef.current = pickVoice(lang); };
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    const timers = Array.from({ length: 10 }, (_, i) => window.setTimeout(refresh, (i + 1) * 400));
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [supported, lang]);

  const speak = useCallback((text, onEnd) => {
    if (!supported || !text) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    utt.rate = 0.95;
    utt.pitch = 1.0;
    if (voiceRef.current) utt.voice = voiceRef.current;
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => { setSpeaking(false); onEnd?.(); };
    utt.onerror = () => { setSpeaking(false); onEnd?.(); };
    window.speechSynthesis.speak(utt);
  }, [supported, lang]);

  const cancel = useCallback(() => {
    if (!supported) return;
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setSpeaking(false);
  }, [supported]);

  return { supported, speaking, speak, cancel };
}
