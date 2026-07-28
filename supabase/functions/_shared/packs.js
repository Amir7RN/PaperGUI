/**
 * What a paper costs, in one place.
 *
 * Shared by the browser (src/payments.js re-exports this) and by the checkout
 * edge function. The client uses it to render prices; the SERVER uses it to
 * compute the amount actually charged and the credit actually granted — a
 * client-supplied price is never trusted.
 *
 *  price — what the buyer pays for one paper at that level.
 *  grant — USD of analysis balance added per paper. The balance is metered
 *          against REAL model usage (analyze-paper deducts the true token
 *          cost), so this is a measured typical cost plus headroom for a long
 *          paper and that paper's narration and tutor chat.
 *
 * ⚠️ grant MUST exceed the real cost of one paper at that level. If it
 * doesn't, someone who buys "1 Advanced paper" receives less credit than the
 * analysis consumes and cannot finish the paper they paid for. That was live:
 * Advanced granted 1.60 against a measured 3.32.
 *
 * Advanced re-measured 2026-07-27 on a real paper: $3.32 for one run. That
 * was inflated by two caching faults (5-minute TTL expiring mid-run, and an
 * uncached system prompt) both fixed in analyze-paper — expect ≈$2.30 now,
 * dominated by Opus output tokens at $25/M, which no caching can reduce.
 *
 * The other three levels are still carrying the ORIGINAL mid-2026 estimates
 * below, taken over three phases rather than today's four and before the
 * caching faults were understood. Treat them as unverified: re-measure from
 * the `phase cost` logs in analyze-paper and correct them the same way.
 *   Standard (Sonnet 5)   ≈ $0.60?  → grant 0.85   [unverified]
 *   Basic    (Sonnet 4.6) ≈ $0.40?  → grant 0.55   [unverified]
 *   Fast     (Haiku 4.5)  ≈ $0.15?  → grant 0.25   [unverified]
 * Narration (OpenAI tts-1, $15/M chars, cached per line in Storage) adds
 * ≈ $0.03–0.18 per paper; the section tutor (Haiku 4.5, capped context and
 * 700-token replies) ≈ $0.01 per exchange. Both ride inside the grant.
 */

export const PAPER_PACKS = [
  // $5.00 / grant 3.00: covers the ≈$2.30 run plus narration, tutor and a
  // long-paper margin. At 2.9% + $0.30 Stripe, this nets ≈$2.05 per sale.
  { id: "advanced", label: "Advanced", price: 5.0, grant: 3.0,  code: "ADV", blurb: "dense, math-heavy papers" },
  { id: "standard", label: "Standard", price: 1.5, grant: 0.85, code: "STD", blurb: "the recommended default" },
  { id: "basic",    label: "Basic",    price: 1.0, grant: 0.55, code: "BAS", blurb: "straightforward papers" },
  { id: "fast",     label: "Fast",     price: 0.5, grant: 0.25, code: "FST", blurb: "quick skim, long PDFs" },
];

/**
 * The only floor is Stripe's own: it rejects charges under $0.50. There is no
 * business minimum — buying a single paper is the point, and a reader who has
 * to buy $5 of credit to read one paper mostly buys nothing. Card fees
 * (2.9% + $0.30) eat more of a small sale; that's priced in above, not
 * pushed onto the buyer as a minimum.
 */
export const STRIPE_MIN_CHARGE = 0.5;

/** Sanity cap so one session can't be built into an absurd charge. */
export const MAX_PER_LEVEL = 20;

/** Normalize whatever the client sent into integer counts we're willing to sell. */
export function cleanCounts(raw) {
  const out = {};
  for (const p of PAPER_PACKS) {
    const n = Math.floor(Number(raw?.[p.id]) || 0);
    out[p.id] = Math.max(0, Math.min(MAX_PER_LEVEL, Number.isFinite(n) ? n : 0));
  }
  return out;
}

/** counts → what to charge and what to grant. Authoritative on the server. */
export function packTotals(counts) {
  const c = cleanCounts(counts);
  let papers = 0, list = 0, grant = 0;
  for (const p of PAPER_PACKS) {
    const n = c[p.id];
    if (!n) continue;
    papers += n;
    list += n * p.price;
    grant += n * p.grant;
  }
  // You pay for exactly what you picked.
  const charge = papers === 0 ? 0 : Math.max(STRIPE_MIN_CHARGE, list);
  const extra = charge - list;
  // Any forced top-up to Stripe's floor is granted too, at the Standard
  // rate — read off the pack rather than hardcoded, so it can't silently
  // drift the next time a price or grant changes.
  const std = PAPER_PACKS.find((p) => p.id === "standard");
  const topUpGrant = extra > 0 ? (extra / std.price) * std.grant : 0;
  return {
    papers,
    list: +list.toFixed(2),
    charge: +charge.toFixed(2),
    grant: +(grant + topUpGrant).toFixed(2),
    extra: +extra.toFixed(2),
  };
}

/** Short code for a payment note / receipt line, e.g. "ADV2-STD1". */
export function packNote(counts) {
  const c = cleanCounts(counts);
  return PAPER_PACKS.map((p) => (c[p.id] ? `${p.code}${c[p.id]}` : null)).filter(Boolean).join("-");
}

/** Human line for the Stripe checkout page, e.g. "2 Advanced + 1 Standard paper". */
export function packDescription(counts) {
  const c = cleanCounts(counts);
  const parts = PAPER_PACKS.filter((p) => c[p.id]).map((p) => `${c[p.id]} ${p.label}`);
  if (!parts.length) return "Paper analysis credit";
  const papers = parts.reduce((n, _, i) => n + c[PAPER_PACKS.filter((p) => c[p.id])[i].id], 0);
  return `${parts.join(" + ")} paper${papers === 1 ? "" : "s"}`;
}
