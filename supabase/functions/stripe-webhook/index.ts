// Stripe webhook receiver for payment_intent events. Idempotent on
// orders.payment_intent_id / status: replaying the same event (Stripe retries,
// or a manual resend) is always safe to no-op past the "already paid" check.
//
// payment_intent.succeeded: mark the order paid, fire one Stripe Transfer per
// vendor for their subtotal-minus-platform-fee payout (Separate Charges and
// Transfers -- the delivery fee stays parked in the platform account until a
// driver claims the job, a later phase), flip the cart to checked_out, and
// send best-effort confirmation emails.
// payment_intent.payment_failed: non-destructive, just an audit_log entry.
//
// Requires STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY secrets.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response("Webhook not configured", { status: 503 });
  }
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });

  let event: Stripe.Event;
  try {
    // constructEventAsync (not the sync variant): Deno's SubtleCrypto is async-only.
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    return new Response(`Signature verification failed: ${(err as Error).message}`, { status: 400 });
  }

  // The `order.status === 'paid'` check below only guards against SEQUENTIAL
  // replay (a retry arriving after the first delivery already finished
  // writing) -- two CONCURRENT deliveries of the same event could both read
  // 'pending_payment' before either finishes, and both fire vendor Transfers.
  // event_id's primary key is the atomic arbitrator: whichever concurrent
  // request's insert wins processes the event, the other gets a unique
  // violation and bails out here having done no work.
  const { error: eventInsertError } = await service
    .from("processed_stripe_events")
    .insert({ event_id: event.id, event_type: event.type });
  if (eventInsertError) {
    if (eventInsertError.code === "23505") {
      return new Response(JSON.stringify({ ok: true, alreadyProcessed: true }), { status: 200 });
    }
    return new Response(`Failed to record event: ${eventInsertError.message}`, { status: 500 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata.order_id;
      if (!orderId) return new Response("No order_id in metadata", { status: 400 });

      const { data: order, error: orderError } = await service.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (orderError) throw orderError;
      if (!order) return new Response("Order not found", { status: 404 });

      if (order.status === "paid") {
        // Already processed -- Stripe retry or manual replay. No-op.
        return new Response(JSON.stringify({ ok: true, alreadyProcessed: true }), { status: 200 });
      }

      const { data: suborders, error: suborderError } = await service
        .from("vendor_suborders")
        .select("id, vendor_id, vendor_payout_cents, vendors(email, storefront_name, stripe_account_id)")
        .eq("order_id", orderId);
      if (suborderError) throw suborderError;

      for (const suborder of suborders ?? []) {
        const vendor = suborder.vendors as unknown as { email: string | null; storefront_name: string; stripe_account_id: string | null };
        if (!vendor?.stripe_account_id) {
          await service.from("audit_log").insert({
            action: "checkout_transfer_skipped_no_stripe_account",
            target_table: "vendor_suborders",
            target_id: suborder.id,
            metadata: { order_id: orderId },
          });
          continue;
        }
        try {
          // idempotencyKey scoped to the suborder: even if some other bug
          // ever causes this code to run twice for the same suborder,
          // Stripe itself will only create the Transfer once and return the
          // cached result the second time -- independent of (and a backstop
          // for) the event_id tracking above.
          const transfer = await stripe.transfers.create(
            {
              amount: suborder.vendor_payout_cents,
              currency: "usd",
              destination: vendor.stripe_account_id,
              transfer_group: orderId,
              source_transaction: typeof pi.latest_charge === "string" ? pi.latest_charge : undefined,
            },
            { idempotencyKey: `transfer-${suborder.id}` }
          );
          await service.from("vendor_suborders").update({ stripe_transfer_id: transfer.id }).eq("id", suborder.id);
        } catch (transferErr) {
          await service.from("audit_log").insert({
            action: "checkout_transfer_failed",
            target_table: "vendor_suborders",
            target_id: suborder.id,
            reason: (transferErr as Error).message,
            metadata: { order_id: orderId },
          });
        }
      }

      await service.from("orders").update({ status: "paid" }).eq("id", orderId);
      if (order.cart_id) {
        await service.from("carts").update({ status: "checked_out" }).eq("id", order.cart_id);
      }

      // Best-effort emails -- never block the webhook's 200 response on Resend.
      // Each send is independent: fetch() only rejects on network failure, not
      // HTTP error status, so res.ok must be checked explicitly or a rejection
      // (e.g. Resend's sandbox "verify a domain" 403) is silently swallowed.
      async function sendEmail(to: string, subject: string, text: string) {
        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (!resendKey) return;
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: "Cotto <notifications@cottomarket.com>", to, subject, text }),
          });
          if (!res.ok) throw new Error(`Resend API error (${res.status}): ${await res.text()}`);
        } catch (emailErr) {
          await service.from("audit_log").insert({
            action: "checkout_email_failed",
            target_table: "orders",
            target_id: orderId,
            reason: (emailErr as Error).message,
            metadata: { to },
          });
        }
      }

      const { data: customerAuth } = await service.auth.admin.getUserById(order.customer_profile_id);
      const customerEmail = customerAuth?.user?.email;
      if (customerEmail) {
        await sendEmail(
          customerEmail,
          "Your Cotto order is confirmed",
          `Thanks for your order! Total: $${(order.total_cents / 100).toFixed(2)}.\n\nYou'll hear from each vendor as they prepare your food.`
        );
      }
      for (const suborder of suborders ?? []) {
        const vendor = suborder.vendors as unknown as { email: string | null; storefront_name: string };
        if (!vendor?.email) continue;
        await sendEmail(
          vendor.email,
          "You have a new Cotto order",
          `${vendor.storefront_name}, you have a new order for $${(suborder.vendor_payout_cents / 100).toFixed(2)} (after platform fee). Open the app to confirm it.`
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      await service.from("audit_log").insert({
        action: "payment_intent_failed",
        target_table: "orders",
        target_id: pi.metadata.order_id ?? null,
        reason: pi.last_payment_error?.message ?? "Unknown payment failure",
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true, ignored: event.type }), { status: 200 });
  } catch (err) {
    // The event_id claim above happens before any work starts (that's what
    // makes it an effective concurrency guard), but that means a genuine
    // failure here must release it -- otherwise a legitimate Stripe retry
    // after a real error would be silently swallowed as "already processed"
    // forever, with the order stuck at pending_payment and no transfers/
    // emails ever sent.
    await service.from("processed_stripe_events").delete().eq("event_id", event.id);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
