/**
 * "Add credit" modal — buy papers, not dollars.
 *
 * A dollar amount tells a reader nothing; "2 Advanced + 1 Standard = $7.50"
 * tells them exactly what they're buying. They pick how many papers of each
 * analysis level they want, see the price update live, and pay.
 *
 * Buttons deep-link to the owner's hosted pay pages; the handle lives only in
 * the link URL, never shown as text. The buyer puts their ACCOUNT EMAIL plus a
 * short pack code (e.g. "ADV2-STD1") in the payment note, so the owner can
 * match the payment and grant the matching balance (one SQL statement, see
 * README). No card data or payment API touches this site.
 */

import React, { useMemo, useRef, useState } from "react";
import {
  X, Wallet, Copy, Check, CircleDollarSign, CreditCard, Minus, Plus, Mic, Bot,
  Loader2, ShieldCheck, ChevronDown,
} from "lucide-react";
import {
  PAYMENT, paymentsConfigured, venmoLink,
  PAPER_PACKS, packTotals, packNote, startCheckout, stripeConfigured,
} from "./payments.js";

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

/* Simple brand mark (inline SVG so nothing loads from a CDN). */
const VenmoMark = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M19.5 3c.66 1.09.96 2.2.96 3.61 0 4.49-3.83 10.33-6.94 14.43H6.4L3.6 4.02l6.28-.6 1.48 11.9c1.38-2.25 3.08-5.78 3.08-8.19 0-1.32-.23-2.22-.58-2.96L19.5 3z"/></svg>
);

export default function BuyCredits({ onClose, email }) {
  const [counts, setCounts] = useState({ advanced: 1, standard: 0, basic: 0, fast: 0 });
  const totals = useMemo(() => packTotals(counts), [counts]);
  const code = packNote(counts);
  const amount = totals.charge;

  const [payErr, setPayErr] = useState(null);
  const [redirecting, setRedirecting] = useState(false);
  // With no backend configured (local dev, or a static deploy) card checkout
  // can't work — so lead with the manual routes instead of an empty step.
  const [showManual, setShowManual] = useState(!stripeConfigured);
  // setRedirecting(true) doesn't block a second click that lands before React
  // re-renders — this ref is checked synchronously so a fast double-click
  // can't open checkout (and a second tab) twice.
  const submittingRef = useRef(false);

  const bump = (id, d) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(20, (c[id] || 0) + d)) }));

  const payByCard = async () => {
    if (!totals.papers || submittingRef.current) return;
    submittingRef.current = true;
    setPayErr(null);
    setRedirecting(true);
    // Opened synchronously, inside the click handler, so the browser still
    // trusts this as user-initiated and won't block it — startCheckout only
    // navigates it once the Stripe URL comes back.
    const tab = window.open("", "_blank", "noopener,noreferrer");
    try {
      await startCheckout(counts, tab);
    } catch (e) {
      if (tab && !tab.closed) tab.close();
      setPayErr(e?.message || "Could not start checkout.");
      setRedirecting(false);
    } finally {
      submittingRef.current = false;
    }
  };

  const note = [email, code].filter(Boolean).join(" · ");
  const venmo = venmoLink(amount, note);

  const methods = [
    venmo && { key: "venmo", label: "Pay with Venmo", href: venmo, cls: "border-[#008CFF] bg-[#008CFF] text-white hover:brightness-95", icon: <VenmoMark /> },
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
            <p className="text-xs text-slate-500">Buy papers, not dollars — pick what you need.</p>
          </div>
        </div>

        {!paymentsConfigured && !stripeConfigured ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
            Payments aren't set up yet — contact the site owner to add credit to your account.
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="mb-1.5 text-xs font-semibold text-slate-600">1 · How many papers, at which level?</div>
              <div className="space-y-1.5">
                {PAPER_PACKS.map((p) => {
                  const n = counts[p.id] || 0;
                  return (
                    <div key={p.id}
                      className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2 transition ${
                        n > 0 ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200 bg-white"
                      }`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[13px] font-bold text-slate-900">{p.label}</span>
                          <span className="text-[11px] font-semibold text-slate-400">${p.price.toFixed(2)} / paper</span>
                        </div>
                        <div className="truncate text-[11px] text-slate-500">{p.blurb}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => bump(p.id, -1)} disabled={n === 0} aria-label={`One fewer ${p.label} paper`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-400 disabled:opacity-30">
                          <Minus size={13} />
                        </button>
                        <span className="w-6 text-center text-[14px] font-bold tabular-nums text-slate-900">{n}</span>
                        <button onClick={() => bump(p.id, 1)} aria-label={`One more ${p.label} paper`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-400 hover:text-emerald-600">
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-2.5 flex items-baseline justify-between rounded-xl bg-slate-900 px-3.5 py-2.5">
                <span className="text-[12px] font-medium text-slate-300">
                  {totals.papers > 0
                    ? <>{totals.papers} paper{totals.papers === 1 ? "" : "s"}</>
                    : "Pick at least one paper"}
                </span>
                <span className="text-[19px] font-extrabold tabular-nums text-white">${totals.charge.toFixed(2)}</span>
              </div>
              {totals.extra > 0 && totals.papers > 0 && (
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
                  Card networks won't process a charge under $0.50, so that's the floor — the extra
                  ${totals.extra.toFixed(2)} stays on your account as credit.
                </p>
              )}
              <p className="mt-1.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-slate-500">
                <Mic size={11} className="mt-0.5 shrink-0 text-slate-400" />
                <span>
                  Each paper includes its narrated walkthroughs
                  <Bot size={11} className="mx-1 inline-block -translate-y-px text-slate-400" />
                  and the section tutor &amp; quizzes. Credit is metered against real usage and never expires.
                </span>
              </p>
            </div>

            {/* Card is the whole flow: Stripe's hosted page, credit granted
                the moment the payment confirms. */}
            <div className="mb-3">
              <div className="mb-1.5 text-xs font-semibold text-slate-600">2 · Pay</div>
              {stripeConfigured ? (
                <>
                  <button
                    onClick={payByCard}
                    disabled={!totals.papers || redirecting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:opacity-40"
                  >
                    {redirecting
                      ? <><Loader2 size={16} className="animate-spin" /> Opening secure checkout…</>
                      : <><CreditCard size={16} /> Pay ${totals.charge.toFixed(2)} by card</>}
                  </button>
                  <p className="mt-1.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-slate-500">
                    <ShieldCheck size={11} className="mt-0.5 shrink-0 text-slate-400" />
                    <span>
                      Card details are entered on Stripe's own page — they never reach this site.
                      Credit lands on your account as soon as the payment confirms.
                    </span>
                  </p>
                </>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-600">
                  Card checkout isn't available on this deployment — use one of the options below.
                </div>
              )}
              {payErr && (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-800">
                  {payErr}
                </div>
              )}
            </div>

            {/* Manual routes, folded away — they need the owner in the loop. */}
            {methods.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <button
                  onClick={() => setShowManual((s) => !s)}
                  className="flex w-full items-center justify-between text-[11.5px] font-semibold text-slate-500 hover:text-slate-700"
                >
                  <span>Rather not use a card? Pay with Venmo</span>
                  <ChevronDown size={14} className={`transition ${showManual ? "rotate-180" : ""}`} />
                </button>

                {showManual && (
                  <div className="mt-2.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
                      <span className="text-[11px] text-blue-800">Put this in the payment note</span>
                      {note ? <EmailChip text={note} /> : <span className="text-xs text-blue-800">your sign-in email</span>}
                    </div>
                    <div className={`space-y-2 ${totals.papers === 0 ? "pointer-events-none opacity-40" : ""}`}>
                      {methods.map((m) => (
                        <a
                          key={m.key}
                          href={m.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold shadow-sm transition ${m.cls}`}
                        >
                          {m.icon} {m.label} · ${totals.charge.toFixed(2)}
                        </a>
                      ))}
                    </div>
                    <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-800">
                      <CircleDollarSign size={14} className="mt-0.5 shrink-0" />
                      <span>
                        These are applied by hand, usually {PAYMENT.turnaround}. Make sure your
                        account email{code ? <> and <strong>{code}</strong></> : null} are in the note.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
