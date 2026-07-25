// @ts-nocheck
/**
 * Stripe → credit. The only path that adds balance to an account.
 *
 * Stripe POSTs here when a Checkout session completes. We verify the
 * signature (so nobody can forge a "payment succeeded" call), record the
 * session id in `purchases` — a unique constraint makes replays a no-op — and
 * add the granted balance the checkout function computed.
 *
 * This function must be deployed WITHOUT JWT verification, because Stripe
 * doesn't carry a Supabase session:
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 * Its authentication is the Stripe signature, checked below.
 *
 * Secrets:
 *   STRIPE_SECRET_KEY      sk_live_… / sk_test_…
 *   STRIPE_WEBHOOK_SECRET  whsec_…  (Stripe dashboard → Developers → Webhooks)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

/** Stripe replays inside this window are accepted; older ones are not. */
const TOLERANCE_SECONDS = 5 * 60;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("Webhook secret not configured", { status: 500 });

  const signature = req.headers.get("stripe-signature") || "";
  const payload = await req.text();

  if (!(await verifyStripeSignature(payload, signature, secret))) {
    // Wrong/absent signature means this isn't Stripe. Say nothing useful.
    return new Response("Invalid signature", { status: 400 });
  }

  let event;
  try { event = JSON.parse(payload); } catch { return new Response("Bad payload", { status: 400 }); }

  // Only completed, actually-paid checkouts grant anything.
  if (event.type !== "checkout.session.completed") return ok();

  const session = event.data?.object || {};
  if (session.payment_status !== "paid") return ok();

  const userId = session.metadata?.user_id || session.client_reference_id;
  const grant = Number(session.metadata?.grant_usd || 0);
  const pack = session.metadata?.pack || "";
  const papers = Number(session.metadata?.papers || 0);
  const amount = Number(session.amount_total || 0) / 100;

  if (!userId || !(grant > 0)) {
    console.error("checkout.session.completed without usable metadata", session.id);
    return ok(); // 200 so Stripe stops retrying something we can't fix
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );

  // Claim this session first. The unique index on stripe_session_id means a
  // replayed webhook (Stripe retries on any non-2xx, and at-least-once
  // delivery is normal) fails here and grants nothing a second time.
  const { error: claimErr } = await admin.from("purchases").insert({
    user_id: userId,
    stripe_session_id: session.id,
    amount_usd: amount,
    granted_usd: grant,
    pack,
    papers,
  });
  if (claimErr) {
    if (claimErr.code === "23505") return ok(); // already processed
    console.error("purchase insert failed", claimErr);
    return new Response("Could not record purchase", { status: 500 }); // let Stripe retry
  }

  // Add the credit. Done through an RPC so the read-modify-write is atomic —
  // two purchases landing at once must not clobber each other.
  const { error: creditErr } = await admin.rpc("add_credit", {
    p_user_id: userId,
    p_amount: grant,
  });
  if (creditErr) {
    console.error("credit grant failed", creditErr, session.id);
    // Roll the claim back so Stripe's retry can try the grant again.
    await admin.from("purchases").delete().eq("stripe_session_id", session.id);
    return new Response("Could not grant credit", { status: 500 });
  }

  return ok();
});

function ok() { return new Response(JSON.stringify({ received: true }), { status: 200 }); }

/**
 * Verify Stripe's `Stripe-Signature` header: HMAC-SHA256 of "<timestamp>.<body>"
 * keyed with the endpoint secret, compared in constant time, within tolerance.
 */
async function verifyStripeSignature(payload, header, secret) {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=").map((s) => s.trim())).filter((p) => p.length === 2),
  );
  const timestamp = Number(parts.t);
  const provided = parts.v1;
  if (!timestamp || !provided) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, provided);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
