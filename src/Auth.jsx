/**
 * Sign-in / sign-up modal. Opened from the landing page's top-right corner.
 * Analysis (spending credit) requires an account, but the sample papers stay
 * open to everyone — so this is a dismissible modal, not a hard gate. On a
 * successful sign-in the parent's auth listener fires and closes it.
 */

import React, { useState } from "react";
import { FlaskConical, Loader2, TriangleAlert, MailCheck, X } from "lucide-react";
import { signIn, signUp } from "./supabase.js";

export default function Auth({ onClose, initialMode = "signin" }) {
  const [mode, setMode] = useState(initialMode); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        const { needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation) { setConfirmSent(true); return; }
      }
    } catch (err) {
      setError(err?.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-10 backdrop-blur-sm"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}
      onClick={onClose}
    >
      <div
        className="relative mt-8 w-full max-w-sm rounded-2xl border border-white/40 bg-white/95 p-6 shadow-2xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        )}
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
            <FlaskConical size={22} />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Interactive Paper Playground</h1>
          <p className="mt-1 text-xs text-slate-500">
            {mode === "signin" ? "Sign in to continue" : "Create an account to get started"}
          </p>
        </div>

        {mode === "signup" && !confirmSent && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-800">
            New accounts get <strong>$1.00 of free analysis credit</strong> — no API key or payment
            needed. We'll email you a confirmation link before your account can be used.
          </div>
        )}

        {confirmSent ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
            <MailCheck size={26} className="text-emerald-600" />
            <div className="text-sm font-semibold text-emerald-800">Check your email</div>
            <div className="text-xs leading-relaxed text-emerald-700">
              We sent a confirmation link to <strong>{email}</strong>. Click it, then come back and sign in.
            </div>
            <button
              onClick={() => { setConfirmSent(false); setMode("signin"); }}
              className="mt-1 text-xs font-medium text-emerald-700 underline"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Password</label>
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit" disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {mode === "signin" ? "Sign in" : "Sign up"}
            </button>
          </form>
        )}

        {!confirmSent && (
          <p className="mt-4 text-center text-xs text-slate-500">
            {mode === "signin" ? "No account yet? " : "Already have an account? "}
            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
              className="font-semibold text-blue-600 hover:underline"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
