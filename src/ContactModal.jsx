/**
 * "Contact / feedback" modal.
 *
 * No backend: this composes a mailto: link (subject + body prefilled from
 * what the visitor types) and opens the visitor's own mail client. Nothing
 * is stored or transmitted anywhere else — simplest thing that reliably works
 * on a static site with no message-sending infrastructure.
 */

import React, { useState } from "react";
import { X, Mail, Send } from "lucide-react";

const OWNER_EMAIL = "amir73rn@gmail.com";

export default function ContactModal({ onClose, prefillEmail }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(prefillEmail || "");
  const [message, setMessage] = useState("");

  const send = (e) => {
    e.preventDefault();
    const subject = `Interactive Paper Playground — feedback from ${name || "a visitor"}`;
    const body =
      `${message}\n\n---\nFrom: ${name || "(no name given)"}\n` +
      `Reply-to: ${email || "(no email given)"}`;
    const href = `mailto:${OWNER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-10 backdrop-blur-sm"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}
      onClick={onClose}
    >
      <div
        className="relative mt-8 w-full max-w-md rounded-2xl border border-white/40 bg-white/95 p-6 shadow-2xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={16} />
        </button>

        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Mail size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Send feedback</h2>
            <p className="text-xs text-slate-500">Bugs, ideas, questions — goes straight to the owner's inbox.</p>
          </div>
        </div>

        <form onSubmit={send} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Your name (optional)</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Your email (so they can reply)</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Message</label>
            <textarea
              required rows={5} value={message} onChange={(e) => setMessage(e.target.value)}
              className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              placeholder="What worked, what didn't, what you'd love to see…"
            />
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Send size={14} /> Open in my mail app
          </button>
          <p className="text-center text-[11px] text-slate-400">
            This opens your email app addressed to {OWNER_EMAIL} — nothing is sent from here directly.
          </p>
        </form>
      </div>
    </div>
  );
}
