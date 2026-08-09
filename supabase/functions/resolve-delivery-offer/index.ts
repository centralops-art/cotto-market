// Phase 9: the customer's in-app response to a T2 pickup-or-refund offer
// (see cron-unclaimed-delivery-check and suborder_pending_customer_offer,
// migration 0044, which is what makes the mobile UI show these two buttons
// in the first place). Body: {suborderId, choice: "pickup" | "refund"}.
//
// Race-safety: whichever of {this call, a driver's claim_delivery, a
// concurrent T3 cron tick} flips vendor_suborders' status/fulfillment away
// from ("ready","delivery") first wins -- the atomic conditional UPDATEs
// below (and refundSuborder's own internal one) make every loser's write
// affect 0 rows, so they bail out cleanly instead of double-resolving. Same
// idiom as claim_delivery's `update ... where status = 'ready'`.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "../_shared/cors.ts";
import { refundSuborder } from "../_shared/refund-suborder.ts";

async function sendEmail(resendKey: string | undefined, to: string, subject: string, text: string) {
  if (!resendKey) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Cotto <notifications@cottomarket.com>", to, subject, text }),
    });
    if (!res.ok) throw new Error(`Resend API error (${res.status}): ${await res.text()}`);
  } catch {
    // best-effort -- never blocks the customer's action
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const { suborderId, choice } = (await req.json()) as { suborderId?: string; choice?: string };
    if (!suborderId || (choice !== "pickup" && choice !== "refund")) {
      return json({ error: 'suborderId and choice ("pickup" or "refund") are required' }, 400);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    // Read under the caller's own JWT -- vendor_suborders_select's
    // is_customer_of_order clause is what actually scopes this, but we
    // still explicitly compare customer_profile_id below rather than
    // trusting visibility alone (same defensive style as
    // update-suborder-status's vendor-ownership check).
    const { data: so } = await supabase
      .from("vendor_suborders")
      .select(
        "id, order_id, vendor_id, status, fulfillment, delivery_cycle, subtotal_cents, delivery_fee_cents, tax_cents, stripe_transfer_id, delivery_address, delivery_lat, delivery_lng, delivery_instructions"
      )
      .eq("id", suborderId)
      .maybeSingle();
    if (!so) return json({ error: "Order not found" }, 404);

    const { data: order } = await supabase
      .from("orders")
      .select("id, customer_profile_id, payment_intent_id, total_cents, status")
      .eq("id", so.order_id)
      .maybeSingle();
    if (!order || order.customer_profile_id !== user.id) {
      return json({ error: "This isn't your order" }, 403);
    }

    if (so.status !== "ready" || so.fulfillment !== "delivery") {
      return json({ error: "This order is no longer awaiting a delivery decision (it may already have been claimed)." }, 409);
    }

    // Defense in depth: only act if there's genuinely an active T2 offer for
    // the current cycle -- mirrors suborder_pending_customer_offer's own
    // check, so the two stay consistent.
    const { data: events } = await service
      .from("delivery_dispatch_events")
      .select("event_type, payload")
      .eq("vendor_suborder_id", suborderId);
    const forThisCycle = (type: string) =>
      (events ?? []).some((e) => e.event_type === type && Number((e.payload as Record<string, unknown>)?.delivery_cycle) === so.delivery_cycle);
    const resolved =
      forThisCycle("customer_chose_pickup") ||
      forThisCycle("customer_chose_refund") ||
      forThisCycle("t3_auto_refunded") ||
      forThisCycle("claim_cancelled_pending_offer");
    if (!forThisCycle("t2_customer_offer_sent") || resolved) {
      return json({ error: "There's no pending pickup-or-refund decision on this order right now." }, 409);
    }

    const { data: vendor } = await service.from("vendors").select("storefront_name, owner_profile_id").eq("id", so.vendor_id).single();
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });

    if (choice === "refund") {
      const result = await refundSuborder(
        service,
        stripe,
        {
          id: so.id,
          order_id: so.order_id,
          subtotal_cents: so.subtotal_cents,
          delivery_fee_cents: so.delivery_fee_cents,
          tax_cents: so.tax_cents,
          stripe_transfer_id: so.stripe_transfer_id,
          delivery_cycle: so.delivery_cycle,
        },
        { id: order.id, payment_intent_id: order.payment_intent_id, total_cents: order.total_cents, status: order.status }
      );
      if (!result.ok) return json({ error: result.error }, 400);

      await service.from("delivery_dispatch_events").insert({
        vendor_suborder_id: suborderId,
        event_type: "customer_chose_refund",
        payload: { delivery_cycle: so.delivery_cycle, stripe_refund_id: result.refundId, amount_cents: result.amountCents },
      });
      await service.from("audit_log").insert({
        actor_profile_id: user.id,
        action: "customer_chose_delivery_refund",
        target_table: "vendor_suborders",
        target_id: suborderId,
      });

      if (vendor?.owner_profile_id) {
        const { data: vendorAuth } = await service.auth.admin.getUserById(vendor.owner_profile_id);
        if (vendorAuth?.user?.email) {
          await sendEmail(
            resendKey,
            vendorAuth.user.email,
            "A delivery order was refunded",
            `The customer chose a refund for an unclaimed delivery order (suborder ${suborderId}) since no driver claimed it in time. No payout will be issued for this order.`
          );
        }
      }

      return json({ ok: true, refunded: true });
    }

    // choice === "pickup": convert this suborder to pickup, refund only the
    // delivery fee (subtotal + tax stay charged -- the food is still being
    // fulfilled), pickup window starts ~15 minutes out (spec 3.7's literal
    // wording -- deliberately not run through generatePickupSlots'
    // business-hours grid, since this is an emergency fallback, not a
    // normal checkout-time slot pick).
    const pickupAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: locked } = await service
      .from("vendor_suborders")
      .update({
        fulfillment: "pickup",
        pickup_at: pickupAt,
        delivery_address: null,
        delivery_lat: null,
        delivery_lng: null,
        delivery_instructions: null,
      })
      .eq("id", suborderId)
      .eq("status", "ready")
      .eq("fulfillment", "delivery")
      .eq("delivery_cycle", so.delivery_cycle)
      .select("id");
    if (!locked || locked.length === 0) {
      return json({ error: "This order is no longer eligible (it may already have been claimed)." }, 409);
    }

    if (so.delivery_fee_cents > 0) {
      try {
        const refund = await stripe.refunds.create(
          { payment_intent: order.payment_intent_id!, amount: so.delivery_fee_cents },
          { idempotencyKey: `pickup-conversion-refund-${suborderId}-cycle-${so.delivery_cycle}` }
        );
        await service.from("vendor_suborders").update({ delivery_fee_cents: 0 }).eq("id", suborderId);
        await service.from("delivery_dispatch_events").insert({
          vendor_suborder_id: suborderId,
          event_type: "customer_chose_pickup",
          payload: { delivery_cycle: so.delivery_cycle, stripe_refund_id: refund.id, refunded_delivery_fee_cents: so.delivery_fee_cents },
        });
        if (order.status !== "refunded") {
          await service.from("orders").update({ status: "partially_refunded" }).eq("id", order.id);
        }
      } catch (err) {
        // Compensate: revert the fulfillment change so the order stays a
        // normal, poolable delivery -- a customer shouldn't end up
        // converted to pickup without actually getting their delivery fee
        // back.
        await service
          .from("vendor_suborders")
          .update({
            fulfillment: "delivery",
            pickup_at: null,
            delivery_address: so.delivery_address,
            delivery_lat: so.delivery_lat,
            delivery_lng: so.delivery_lng,
            delivery_instructions: so.delivery_instructions,
          })
          .eq("id", suborderId);
        return json({ error: `Couldn't process your delivery fee refund: ${(err as Error).message}. Please try again.` }, 500);
      }
    } else {
      await service.from("delivery_dispatch_events").insert({
        vendor_suborder_id: suborderId,
        event_type: "customer_chose_pickup",
        payload: { delivery_cycle: so.delivery_cycle, refunded_delivery_fee_cents: 0 },
      });
    }

    await service.from("audit_log").insert({
      actor_profile_id: user.id,
      action: "customer_chose_pickup_conversion",
      target_table: "vendor_suborders",
      target_id: suborderId,
      metadata: { pickup_at: pickupAt },
    });

    if (vendor?.owner_profile_id) {
      const { data: vendorAuth } = await service.auth.admin.getUserById(vendor.owner_profile_id);
      if (vendorAuth?.user?.email) {
        await sendEmail(
          resendKey,
          vendorAuth.user.email,
          "A delivery order switched to pickup",
          `Since no driver claimed it in time, the customer switched an order (suborder ${suborderId}) from delivery to pickup. New pickup time: ${new Date(pickupAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}.`
        );
      }
    }

    return json({ ok: true, convertedToPickup: true, pickupAt });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
