/**
 * "Add credit" modal — manual Venmo / Cash App top-up.
 *
 * The buyer sends money to the owner's handle with their ACCOUNT EMAIL in the
 * payment note; the owner then adds the credit manually (one SQL statement,
 * see README). No card data or payment API touches this site.
 */

import React, { useState } from "react";
import { X, Wallet, Copy, Check, CircleDollarSign } from "lucide-react";
import { PAYMENT, paymentsConfigured } from "./payments.js";

function CopyChip({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        try { navigator.clipboard.writeText(text); } catch { /* ignore */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 hover:border-blue-300"
      title="Copy"
    >
      {text}
      {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} className="text-slate-400" />}
    </button>
  );
}

export default function BuyCredits({ onClose, email }) {
  const [amount, setAmount] = useState(PAYMENT.amounts?.[1] ?? 10);

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
            <p className="text-xs text-slate-500">$1 ≈ one Advanced paper, or ~2 on Standard.</p>
          </div>
        </div>

        {!paymentsConfigured ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
            Top-ups aren't set up yet — contact the site owner to add credit to your account.
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="mb-1.5 text-xs font-semibold text-slate-600">1 · Pick an amount</div>
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
              <div className="mb-1.5 text-xs font-semibold text-slate-600">2 · Send it to</div>
              <div className="space-y-2">
                {PAYMENT.venmo && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <span className="text-sm font-semibold text-[#008CFF]">Venmo</span>
                    <CopyChip text={PAYMENT.venmo} />
                  </div>
                )}
                {PAYMENT.cashapp && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <span className="text-sm font-semibold text-[#00D632]">Cash App</span>
                    <CopyChip text={PAYMENT.cashapp} />
                  </div>
                )}
              </div>
            </div>

            <div className="mb-4">
              <div className="mb-1.5 text-xs font-semibold text-slate-600">
                3 · Put YOUR account email in the payment note
              </div>
              <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
                <span className="truncate text-xs text-blue-800">{email || "your sign-in email"}</span>
                {email && <CopyChip text={email} />}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                The note is how your payment gets matched to your account — without it the
                credit can't be applied.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-800">
              <CircleDollarSign size={14} className="mt-0.5 shrink-0" />
              <span>
                Your <strong>${amount}.00</strong> of credit is added manually,
                usually {PAYMENT.turnaround}. You'll see it in the balance badge on this page.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
