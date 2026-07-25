/**
 * Manual top-up configuration.
 *
 * Venmo / Cash App / PayPal have no public API a static site could safely use,
 * so top-ups are manual: the buyer pays via a deep link (their handle is only
 * ever inside the link URL, never shown on the page) and puts their account
 * email in the payment note, then the owner adds credit with one SQL statement
 * (README → Operational notes → "Selling credit").
 */
export const PAYMENT = {
  // Handles are used ONLY to build the pay links below — never rendered as
  // visible text. Leave a field "" to hide that button.
  venmo: "Amirreza-Naseri",   // Venmo username (no leading @)
  cashapp: "AVN73M",          // Cash App $Cashtag WITHOUT the $
  paypal: "A9R4N",            // PayPal.me name (paypal.me/A9R4N) — accepts
                              // debit/credit cards from guests, no account needed

  // How long buyers should expect to wait for credit to appear.
  turnaround: "within a few hours",
};

/**
 * Credit is sold in PAPERS, not dollars — "$10" tells a reader nothing, "3
 * Advanced papers" tells them exactly what they get.
 *
 *  price — what the buyer pays for one paper at that level.
 *  grant — USD of analysis balance to put on the account per paper. The
 *          balance is metered against REAL model usage (see
 *          analyze-paper/index.ts), so this is a measured typical cost with
 *          headroom for a long paper plus that paper's narration and tutor
 *          chat. Measured mid-2026 on ~12–20 page papers:
 *            Advanced (Opus 4.8, 3 phases)  ≈ $1.20   → grant 1.60
 *            Standard (Sonnet 5)            ≈ $0.60   → grant 0.85
 *            Basic    (Sonnet 4.6)          ≈ $0.40   → grant 0.55
 *            Fast     (Haiku 4.5)           ≈ $0.15   → grant 0.25
 *          Voice-over (OpenAI tts-1, $15/M chars, cached per line) adds
 *          ≈ $0.03–0.18 per paper; tutor chat (Haiku 4.5, capped context and
 *          700-token replies) ≈ $0.01 per exchange. Both are inside the grant.
 */
export const PAPER_PACKS = [
  { id: "advanced", label: "Advanced", price: 3.0, grant: 1.6,  code: "ADV", blurb: "dense, math-heavy papers" },
  { id: "standard", label: "Standard", price: 1.5, grant: 0.85, code: "STD", blurb: "the recommended default" },
  { id: "basic",    label: "Basic",    price: 1.0, grant: 0.55, code: "BAS", blurb: "straightforward papers" },
  { id: "fast",     label: "Fast",     price: 0.5, grant: 0.25, code: "FST", blurb: "quick skim, long PDFs" },
];

/** Card/Venmo fees make anything under this uneconomic to process. */
export const MIN_TOPUP = 5;

/** counts: { advanced: 2, standard: 1, … } → what to charge and what to grant. */
export function packTotals(counts) {
  let papers = 0, list = 0, grant = 0;
  for (const p of PAPER_PACKS) {
    const n = Math.max(0, Math.floor(counts?.[p.id] || 0));
    if (!n) continue;
    papers += n;
    list += n * p.price;
    grant += n * p.grant;
  }
  // Below the minimum the buyer still pays MIN_TOPUP; the difference isn't
  // pocketed — it rides along as extra balance.
  const charge = papers === 0 ? 0 : Math.max(MIN_TOPUP, Math.ceil(list * 2) / 2);
  const extra = charge - list;
  return {
    papers,
    list: +list.toFixed(2),
    charge: +charge.toFixed(2),
    // Extra paid over the list price is granted too, at the Standard rate.
    grant: +(grant + (extra > 0 ? (extra / 1.5) * 0.85 : 0)).toFixed(2),
    extra: +extra.toFixed(2),
  };
}

/** Short code for the payment note, e.g. "ADV2-STD1" — tells the owner what to grant. */
export function packNote(counts) {
  return PAPER_PACKS
    .map((p) => { const n = Math.max(0, Math.floor(counts?.[p.id] || 0)); return n ? `${p.code}${n}` : null; })
    .filter(Boolean)
    .join("-");
}

export const paymentsConfigured = Boolean(PAYMENT.venmo || PAYMENT.cashapp || PAYMENT.paypal);

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

/** Cash App pay link with amount prefilled. */
export function cashappLink(amount) {
  if (!PAYMENT.cashapp) return null;
  return `https://cash.app/$${PAYMENT.cashapp}/${amount}`;
}

/** PayPal.me link — the debit/credit-card route (guest checkout, no account). */
export function cardLink(amount) {
  if (!PAYMENT.paypal) return null;
  return `https://www.paypal.com/paypalme/${PAYMENT.paypal}/${amount}`;
}
