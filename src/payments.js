/**
 * Buying credit.
 *
 * Card payments go through Stripe Checkout: `startCheckout` asks the
 * create-checkout edge function to price the basket and open a hosted Stripe
 * page, and credit lands automatically when Stripe confirms the payment.
 * No card details, and no price the buyer could tamper with, exist on this
 * site — the server prices the basket from the same shared table the UI
 * renders (supabase/functions/_shared/packs.js).
 *
 * Venmo remains as a manual fallback for anyone who'd rather not use a card:
 * the buyer pays via a deep link (the handle lives only inside the link URL,
 * never as visible text) and puts their account email and pack code in the
 * payment note, then the owner grants the credit by hand (README →
 * Operational notes → "Selling credit").
 */
import { getAccessToken, functionsUrl, supabaseAnonKey } from "./supabase.js";
import { PAPER_PACKS, STRIPE_MIN_CHARGE, packTotals, packNote, packDescription } from "../supabase/functions/_shared/packs.js";

export const PAYMENT = {
  // Handle is used ONLY to build the pay link below — never rendered as
  // visible text. Leave "" to hide the button.
  venmo: "Amirreza-Naseri",   // Venmo username (no leading @)

  // How long buyers should expect to wait for credit to appear.
  turnaround: "within a few hours",
};

export { PAPER_PACKS, STRIPE_MIN_CHARGE, packTotals, packNote, packDescription };

export const paymentsConfigured = Boolean(PAYMENT.venmo);

/** Venmo web-pay deep link with amount + note (account email) prefilled. */
export function venmoLink(amount, note) {
  if (!PAYMENT.venmo) return null;
  const p = new URLSearchParams({
    txn: "pay",
    recipients: PAYMENT.venmo,
    amount: String(amount),
    note: note || "",
  });
  return `https://venmo.com/?${p.toString()}`;
}

/* ---------------- Stripe Checkout (the primary path) ---------------- */

/** Card checkout is available when the site has a backend to price it. */
export const stripeConfigured = Boolean(functionsUrl);

/**
 * Hand the basket to the server, get back a Stripe-hosted checkout URL, go
 * there. The amount is decided server-side; this only says WHAT was picked.
 * Throws an Error with a user-readable message on failure.
 *
 * `tab` is a window opened by the CALLER, synchronously inside the click
 * handler (see BuyCredits.jsx). Opening a tab AFTER an `await` loses the
 * browser's "this came from a user gesture" trust, so popup blockers kill it
 * — which used to trigger the window.location.assign fallback below on the
 * ORIGINAL tab too, sending both tabs to checkout instead of one.
 */
export async function startCheckout(counts, tab) {
  if (!functionsUrl) throw new Error("Card payments aren't configured on this deployment.");

  const token = await getAccessToken();
  if (!token) {
    const e = new Error("Sign in (free) to add credit.");
    e.code = "auth";
    throw e;
  }

  const res = await fetch(`${functionsUrl}/create-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ counts }),
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || `Could not start checkout (${res.status}).`);
  }
  // Send the pre-opened tab to Stripe; this (original) tab never navigates,
  // so the reader doesn't lose the page they were on. Only if the caller
  // couldn't open a tab at all (blocked before we even got here) do we fall
  // back to navigating here.
  if (tab && !tab.closed) tab.location.href = data.url;
  else window.location.assign(data.url);
  return data;
}
