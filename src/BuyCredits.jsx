/**
 * "Add credit" modal — manual Venmo / Cash App / card top-up.
 *
 * Buttons deep-link to the owner's hosted pay pages; the handle lives only in
 * the link URL, never shown as text. The buyer puts their ACCOUNT EMAIL in the
 * payment note so the owner can match the payment and add credit manually
 * (one SQL statement, see README). No card data or payment API touches this site.
 */

import React, { useState } from "react";
import { X, Wallet, Copy, Check, CircleDollarSign, CreditCard } from "lucide-react";
import { PAYMENT, paymentsConfigured, venmoLink, cashappLink, cardLink } from "./payments.js";

function EmailChip({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        try { navigator.clipboard.writeText(text); } catch { /* ignore */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-blue-800 hover:border-blue-400"
      title="Copy your email"
    >
      <span className="max-w-[12rem] truncate">{text}</span>
      {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} className="text-blue-400" />}
    </button>
  );
}

/* Simple brand marks (inline SVG so nothing loads from a CDN). */
const VenmoMark = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M19.5 3c.66 1.09.96 2.2.96 3.61 0 4.49-3.83 10.33-6.94 14.43H6.4L3.6 4.02l6.28-.6 1.48 11.9c1.38-2.25 3.08-5.78 3.08-8.19 0-1.32-.23-2.22-.58-2.96L19.5 3z"/></svg>
);
const CashMark = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm.9 4.2h-1.6v1.1c-1.6.2-2.7 1.2-2.7 2.7 0 1.7 1.4 2.4 3 2.9 1.2.4 1.6.7 1.6 1.2 0 .5-.5.9-1.3.9-1 0-2-.5-2.7-1.1l-1 1.4c.7.7 1.7 1.1 2.8 1.3v1.1h1.6v-1.1c1.7-.2 2.8-1.3 2.8-2.8 0-1.7-1.4-2.4-3.1-2.9-1.1-.3-1.5-.6-1.5-1.1 0-.4.4-.8 1.2-.8.9 0 1.7.4 2.3.9l1-1.4c-.6-.5-1.4-.9-2.3-1v-1z"/></svg>
);

export default function BuyCredits({ onClose, email }) {
  const [amount, setAmount] = useState(PAYMENT.amounts?.[1] ?? 10);

  const note = email || "";
  const venmo = venmoLink(amount, note);
  const cash = cashappLink(amount);
  const card = cardLink(amount);

  const methods = [
    venmo && { key: "venmo", label: "Pay with Venmo", href: venmo, cls: "border-[#008CFF] bg-[#008CFF] text-white hover:brightness-95", icon: <VenmoMark /> },
    cash && { key: "cashapp", label: "Pay with Cash App", href: cash, cls: "border-[#00D632] bg-[#00D632] text-white hover:brightness-95", icon: <CashMark /> },
    card && { key: "card", label: "Pay with debit / credit card", href: card, cls: "border-slate-300 bg-white text-slate-800 hover:border-slate-400", icon: <CreditCard size={16} /> },
  ].filter(Boolean);

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
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Wallet size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Add analysis credit</h2>
            <p className="text-xs text-slate-500">$1 ≈ one Advanced paper.</p>
          </div>
        </div>

        {!paymentsConfigured ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
            Payments aren't set up yet — contact the site owner to add credit to your account.
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="mb-1.5 text-xs font-semibold text-slate-600">1 · Choose an amount</div>
              <div className="flex gap-2">
                {(PAYMENT.amounts || [5, 10, 20]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAmount(a)}
                    className={`flex-1 rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${
                      amount === a
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
                    }`}
                  >
                    ${a}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="mb-1.5 text-xs font-semibold text-slate-600">
                2 · Add your account email as the payment note
              </div>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
                <span className="text-[11px] text-blue-800">This is how your payment finds your account</span>
                {email ? <EmailChip text={email} /> : <span className="text-xs text-blue-800">your sign-in email</span>}
              </div>
            </div>

            <div className="mb-3">
              <div className="mb-1.5 text-xs font-semibold text-slate-600">3 · Pay</div>
              <div className="space-y-2">
                {methods.map((m) => (
                  <a
                    key={m.key}
                    href={m.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold shadow-sm transition ${m.cls}`}
                  >
                    {m.icon} {m.label}
                  </a>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-800">
              <CircleDollarSign size={14} className="mt-0.5 shrink-0" />
              <span>
                Your <strong>${amount}.00</strong> of credit is applied manually,
                usually {PAYMENT.turnaround} — it appears in the balance badge on this page.
                Make sure your account email is in the note.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
