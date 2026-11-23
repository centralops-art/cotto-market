// Stripe Connect webhook (HANDOFF.md §39 step 5): events that happen ON the
// cooks' connected accounts. Registered in the Stripe Dashboard as a separate
// endpoint listening to "Events on Connected accounts", with its own signing
// secret (STRIPE_CONNECT_WEBHOOK_SECRET). The platform endpoint
// (stripe-webhook) keeps handling the delivery-fee PaymentIntent.
//
// Handled:
//   payment_intent.succeeded / .payment_failed / .canceled (food charges):
//     settleDirectOrder(allowCharge: false) -- a backstop for checkout-complete
//     (app closed mid-checkout, slow network). Never charges a card.
//   account.updated: keeps vendors.stripe_charges_enabled in step with Stripe.
//   charge.dispute.created: audit_log + email to the admin allow-list, so a
//     cook's dispute on a Cotto order is visible to Central Ops.
//
// Every event's `account` must match the suborder's snapshotted
// stripe_account_id (or a vendor's stripe_account_id for account.updated).
// Deployed with --no-verify-jwt: Stripe authenticates with its signature.
// Requires STRIPE_SECRET_KEY, STRIPE_CONNECT_WEBHOOK_SECRET, RESEND_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { settleDirectOrder } from "../_shared/direct-checkout.ts";

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response("Connect webhook not configured", { status: 503 });
  }
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    return new Response(`Signature verification failed: ${(err as Error).message}`, { status: 400 });
  }
  if (!event.account) return new Response("Not a Connect event", { status: 400 });

  // Same concurrency/idempotency claim as stripe-webhook (0028). Event ids
  // are unique across platform and Connect events.
  const { error: eventInsertError } = await service
    .from("processed_stripe_events")
    .insert({ event_id: event.id, event_type: event.type });
  if (eventInsertError) {
    if (eventInsertError.code === "23505") {
      return new Response(JSON.stringify({ ok: true, alreadyProcessed: true }), { status: 200 });
    }
    return new Response(`Failed to record event: ${eventInsertError.message}`, { status: 500 });
  }

  const ok = (extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ ok: true, ...extra }), { status: 200 });

  try {
    if (
      event.type === "payment_intent.succeeded" ||
      event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.canceled"
    ) {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.order_id;
      const suborderId = pi.metadata?.vendor_suborder_id;
      if (pi.metadata?.charge_model !== "direct" || !orderId || !suborderId) return ok({ ignored: "not a Cotto food charge" });

      const { data: suborder } = await service
        .from("vendor_suborders")
        .select("id, order_id, stripe_account_id")
        .eq("id", suborderId)
        .maybeSingle();
      if (!suborder || suborder.order_id !== orderId || suborder.stripe_account_id !== event.account) {
        await service.from("audit_log").insert({
          action: "connect_webhook_account_mismatch",
          target_table: "vendor_suborders",
          target_id: suborderId,
          reason: `event ${event.id} from ${event.account} doesn't match the suborder's account`,
        });
        return ok({ ignored: "account mismatch" });
      }

      if (event.type === "payment_intent.payment_failed") {
        await service.from("audit_log").insert({
          action: "payment_intent_failed",
          target_table: "orders",
          target_id: orderId,
          reason: pi.last_payment_error?.message ?? "Unknown payment failure",
          metadata: { stripe_account: event.account, kind: "food" },
        });
      }
      const result = await settleDirectOrder(service, stripe, orderId, { allowCharge: false });
      return ok({ settled: result.status });
    }

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      await service
        .from("vendors")
        .update({ stripe_charges_enabled: account.charges_enabled })
        .eq("stripe_account_id", event.account);
      return ok();
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
      const { data: vendor } = await service
        .from("vendors")
        .select("id, storefront_name")
        .eq("stripe_account_id", event.account)
        .maybeSingle();
      await service.from("audit_log").insert({
        action: "connect_dispute_created",
        target_table: "vendors",
        target_id: vendor?.id ?? null,
        reason: dispute.reason,
        metadata: { stripe_account: event.account, dispute_id: dispute.id, charge_id: chargeId, amount_cents: dispute.amount },
      });

      // Best-effort heads-up to the admin allow-list. The cook handles the
      // dispute in their own Stripe dashboard (they're merchant of record).
      const resendKey = Deno.env.get("RESEND_API_KEY");
      // admin_allow_list is service-role-only (0010's column grant).
      const { data: settings } = await service.from("system_settings").select("admin_allow_list").eq("id", 1).maybeSingle();
      const admins = ((settings?.admin_allow_list as string[] | null) ?? []).filter(Boolean);
      if (resendKey && admins.length > 0) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Cotto <notifications@cottomarket.com>",
              to: admins,
              subject: `Card dispute on ${vendor?.storefront_name ?? "a kitchen"}'s order`,
              text: `A customer disputed a $${(dispute.amount / 100).toFixed(2)} charge (${dispute.reason}) on ${vendor?.storefront_name ?? event.account}'s Stripe account. The cook responds in their own Stripe dashboard. Dispute: ${dispute.id}`,
            }),
          });
          if (!res.ok) throw new Error(`Resend API error (${res.status})`);
        } catch (emailErr) {
          await service.from("audit_log").insert({
            action: "connect_dispute_email_failed",
            target_table: "vendors",
            target_id: vendor?.id ?? null,
            reason: (emailErr as Error).message,
          });
        }
      }
      return ok();
    }

    return ok({ ignored: event.type });
  } catch (err) {
    // Release the claim so Stripe's retry is processed (same as stripe-webhook).
    await service.from("processed_stripe_events").delete().eq("event_id", event.id);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
