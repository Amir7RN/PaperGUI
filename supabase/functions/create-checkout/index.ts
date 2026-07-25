// @ts-nocheck
/**
 * Start a Stripe Checkout session for a credit top-up.
 *
 * The browser sends WHAT it wants (2 Advanced + 1 Standard); this function
 * decides what that COSTS. Prices come from _shared/packs.js on the server
 * side, so a tampered client can't buy ten Advanced papers for a dollar.
 *
 * Card details never touch this site: we hand back Stripe's hosted Checkout
 * URL and the browser goes there. Credit is granted by the stripe-webhook
 * function when Stripe confirms the payment — never here, and never by the
 * client, so a user who closes the tab mid-payment can't self-grant.
 *
 * Secrets (supabase secrets set …):
 *   STRIPE_SECRET_KEY   sk_live_… (or sk_test_… while testing)
 *   SITE_URL            https://your-site — where Stripe returns the buyer
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { cleanCounts, packTotals, packNote, packDescription } from "../_shared/packs.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json(500, { error: "Card payments aren't configured on this deployment." });

  // --- who's buying ---------------------------------------------------------
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "Sign in to add credit." });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json(401, { error: "Your session has expired — sign in again." });
  const user = userData.user;

  // --- what they're buying, priced here and nowhere else ---------------------
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON body." }); }

  const counts = cleanCounts(body?.counts);
  const totals = packTotals(counts);
  if (!totals.papers) return json(400, { error: "Pick at least one paper." });

  const code = packNote(counts);
  const siteUrl = (Deno.env.get("SITE_URL") || req.headers.get("origin") || "").replace(/\/+$/, "");

  // Stripe's REST API takes form encoding; using it directly keeps this
  // function dependency-free (no SDK to pin or audit).
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(Math.round(totals.charge * 100)),
    "line_items[0][price_data][product_data][name]": packDescription(counts),
    "line_items[0][price_data][product_data][description]":
      "Interactive Paper Playground — analysis credit, including narrated walkthroughs and the section tutor.",
    customer_email: user.email || "",
    client_reference_id: user.id,
    success_url: `${siteUrl}/?paid=1`,
    cancel_url: `${siteUrl}/?paid=0`,
    // The webhook reads these back — it must not have to trust anything the
    // browser says about what was bought.
    "metadata[user_id]": user.id,
    "metadata[pack]": code,
    "metadata[papers]": String(totals.papers),
    "metadata[grant_usd]": totals.grant.toFixed(4),
  });

  let session;
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // Retrying this exact request can't create a second charge.
        "Idempotency-Key": `${user.id}:${code}:${totals.charge}:${Math.floor(Date.now() / 60000)}`,
      },
      body: form,
    });
    session = await res.json();
    if (!res.ok) {
      console.error("stripe checkout error", session?.error);
      return json(502, { error: session?.error?.message || "Stripe rejected the request." });
    }
  } catch (e) {
    console.error("stripe checkout failed", e);
    return json(502, { error: "Could not reach Stripe — try again." });
  }

  return json(200, {
    url: session.url,
    sessionId: session.id,
    charge: totals.charge,
    papers: totals.papers,
    pack: code,
  });
});

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
