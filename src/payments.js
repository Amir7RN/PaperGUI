/**
 * Manual top-up configuration — EDIT THESE VALUES.
 *
 * Venmo / Cash App have no public API a static site could safely use, so
 * top-ups are manual: the buyer sends money with their account email in the
 * payment note, and the owner adds credit with one SQL statement (see
 * README → Operational notes → "Top up a user's balance").
 */
export const PAYMENT = {
  // Your handles — shown to the buyer. Leave "" to hide that option.
  venmo: "",        // e.g. "@Amir-Rezaei-7"
  cashapp: "",      // e.g. "$amir7rn"

  // Suggested amounts (USD). $1 of credit ≈ one Advanced paper or ~2 Standard.
  amounts: [5, 10, 20],

  // How long buyers should expect to wait for the credit to appear.
  turnaround: "within a few hours",
};

/** True once the owner has filled in at least one payment handle. */
export const paymentsConfigured = Boolean(PAYMENT.venmo || PAYMENT.cashapp);
