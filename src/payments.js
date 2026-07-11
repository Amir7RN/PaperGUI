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

  // Suggested amounts (USD). $1 of credit ≈ one Advanced paper.
  amounts: [5, 10, 20],

  // How long buyers should expect to wait for credit to appear.
  turnaround: "within a few hours",
};

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
