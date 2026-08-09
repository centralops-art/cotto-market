// Driver-driven delivery status transitions (Phase 8): en_route_to_pickup ->
// picked_up -> en_route_to_customer -> delivered. Drivers have NO
// client-facing UPDATE grant on vendor_suborders (see migration 0010) --
// this function verifies claim ownership under the caller's own JWT, then
// switches to the service-role client for the actual writes. The DB trigger
// (migration 0037's extended guard_suborder_status_transition) is still the
// real enforcement of legal single-step transitions; the NEXT map below is
// defense-in-depth for a clean error message.
//
// On 'delivered': fires the driver's Stripe Transfer (mirrors the cook-side
// Transfer in stripe-webhook exactly -- same idempotencyKey convention, same
// graceful degradation via audit_log on failure, never blocks completion),
// then a SEPARATE update to 'completed' -- the guard trigger only allows one
// status-step per statement, so en_route_to_customer -> completed in one
// call would be silently rejected.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "../_shared/cors.ts";

const NEXT: Record<string, string> = {
  claimed: "en_route_to_pickup",
  en_route_to_pickup: "picked_up",
  picked_up: "en_route_to_customer",
  en_route_to_customer: "delivered",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const { suborderId, newStatus } = (await req.json()) as { suborderId?: string; newStatus?: string };
    if (!suborderId || !newStatus) return json({ error: "suborderId and newStatus are required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    // Ownership check: reads under the caller's OWN JWT. vendor_suborders_select
    // (is_active_driver_for_suborder) and delivery_claims_select
    // (owns_vendor(driver_vendor_id)) both only succeed if this user is
    // really the claiming driver.
    const { data: so } = await supabase
      .from("vendor_suborders")
      .select("id, status, order_id, vendor_id")
      .eq("id", suborderId)
      .maybeSingle();
    if (!so) return json({ error: "Order not found or you don't have an active claim on it" }, 404);

    const { data: driverVendor } = await supabase
      .from("vendors")
      .select("id, stripe_account_id")
      .eq("owner_profile_id", user.id)
      .maybeSingle();
    const { data: claim } = await supabase
      .from("delivery_claims")
      .select("*")
      .eq("vendor_suborder_id", suborderId)
      .is("released_at", null)
      .maybeSingle();
    if (!claim || !driverVendor || claim.driver_vendor_id !== driverVendor.id) {
      return json({ error: "You don't have an active claim on this order" }, 403);
    }

    if (NEXT[so.status] !== newStatus) {
      return json({ error: `Cannot move from ${so.status} to ${newStatus}` }, 400);
    }

    if (newStatus !== "delivered") {
      const timestampColumn = `${newStatus}_at`;
      const { error: updateErr } = await service.from("vendor_suborders").update({ status: newStatus }).eq("id", suborderId);
      if (updateErr) return json({ error: updateErr.message }, 400);
      await service.from("delivery_claims").update({ [timestampColumn]: new Date().toISOString() }).eq("id", claim.id);

      await service.from("audit_log").insert({
        actor_profile_id: user.id,
        action: "delivery_status_changed",
        target_table: "vendor_suborders",
        target_id: suborderId,
        metadata: { from: so.status, to: newStatus, claim_id: claim.id },
      });

      return json({ ok: true });
    }

    // 'delivered': first update, en_route_to_customer -> delivered.
    const { error: deliveredErr } = await service.from("vendor_suborders").update({ status: "delivered" }).eq("id", suborderId);
    if (deliveredErr) return json({ error: deliveredErr.message }, 400);
    await service.from("delivery_claims").update({ delivered_at: new Date().toISOString() }).eq("id", claim.id);

    await service.from("audit_log").insert({
      actor_profile_id: user.id,
      action: "delivery_status_changed",
      target_table: "vendor_suborders",
      target_id: suborderId,
      metadata: { from: so.status, to: "delivered", claim_id: claim.id },
    });

    // Best-effort driver payout Transfer -- graceful degradation, same
    // pattern as the cook-side Transfer in stripe-webhook. Never blocks
    // marking the delivery complete.
    if (!driverVendor.stripe_account_id) {
      await service.from("audit_log").insert({
        action: "delivery_transfer_skipped_no_stripe_account",
        target_table: "delivery_claims",
        target_id: claim.id,
        metadata: { vendor_suborder_id: suborderId },
      });
    } else {
      try {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });
        const { data: order } = await service.from("orders").select("payment_intent_id").eq("id", so.order_id).single();
        let sourceCharge: string | undefined;
        if (order?.payment_intent_id) {
          const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id);
          sourceCharge = typeof pi.latest_charge === "string" ? pi.latest_charge : undefined;
        }
        const transfer = await stripe.transfers.create(
          {
            amount: claim.driver_payout_cents,
            currency: "usd",
            destination: driverVendor.stripe_account_id,
            transfer_group: so.order_id,
            source_transaction: sourceCharge,
          },
          { idempotencyKey: `driver-transfer-${claim.id}` }
        );
        await service.from("delivery_claims").update({ stripe_transfer_id: transfer.id }).eq("id", claim.id);
      } catch (transferErr) {
        await service.from("audit_log").insert({
          action: "delivery_transfer_failed",
          target_table: "delivery_claims",
          target_id: claim.id,
          reason: (transferErr as Error).message,
          metadata: { vendor_suborder_id: suborderId },
        });
      }
    }

    // Second, separate update: delivered -> completed. Spec's UI has no
    // separate "mark completed" tap for delivery orders once delivered --
    // completion is automatic.
    const { error: completedErr } = await service.from("vendor_suborders").update({ status: "completed" }).eq("id", suborderId);
    if (completedErr) {
      await service.from("audit_log").insert({
        action: "delivery_completion_update_failed",
        target_table: "vendor_suborders",
        target_id: suborderId,
        reason: completedErr.message,
      });
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
