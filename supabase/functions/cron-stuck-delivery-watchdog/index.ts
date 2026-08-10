// Every-5-minute cron (see migration 0040): a driver claims a delivery,
// then goes dark. For claims stuck in claimed/en_route_to_pickup
// past the 20-minute threshold, auto-release back to the pool (food hasn't
// left the kitchen yet, safe to re-offer). For claims stuck in
// picked_up/en_route_to_customer past the same threshold, the food has
// already left the kitchen -- NOT safely auto-recoverable -- just notify
// dispatch once (idempotency marker: delivery_claims.stuck_notified_at,
// same pattern as drivers_license_expiry_warned_at).
//
// Queries vendor_suborders filtered by status, not delivery_claims filtered
// by released_at is null -- a successfully delivered/completed claim's
// released_at stays null forever (it was never released, it finished), so
// filtering on the claims table alone would scan an ever-growing set of
// historical completed claims too.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const STUCK_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes (founder's decision -- spec suggested 60)

type StuckClaim = {
  id: string;
  claimed_at: string;
  en_route_to_pickup_at: string | null;
  picked_up_at: string | null;
  en_route_to_customer_at: string | null;
  stuck_notified_at: string | null;
  driver_vendor_id: string;
  released_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = Date.now();

    const { data: stuckCandidates, error } = await service
      .from("vendor_suborders")
      .select(
        "id, status, vendors(storefront_name, regions(dispatch_emails)), delivery_claims(id, claimed_at, en_route_to_pickup_at, picked_up_at, en_route_to_customer_at, stuck_notified_at, driver_vendor_id, released_at)"
      )
      .in("status", ["claimed", "en_route_to_pickup", "picked_up", "en_route_to_customer"]);
    if (error) throw error;

    let autoReleased = 0;
    let notified = 0;

    for (const so of stuckCandidates ?? []) {
      const claims = (so.delivery_claims ?? []) as unknown as StuckClaim[];
      // Invariant: a suborder in these 4 statuses always has exactly one
      // active (released_at is null) claim -- release always flips status
      // back to 'ready' as part of the same transaction.
      const claim = claims.find((c) => c.released_at === null);
      if (!claim) continue;

      if (so.status === "claimed" || so.status === "en_route_to_pickup") {
        const since = so.status === "en_route_to_pickup" && claim.en_route_to_pickup_at ? claim.en_route_to_pickup_at : claim.claimed_at;
        if (now - new Date(since).getTime() < STUCK_THRESHOLD_MS) continue;

        // Reuse the exact release logic drivers use, via the service-role
        // client (auth.role() = 'service_role' inside the function skips
        // the ownership check) -- single source of truth, no drift.
        const { error: releaseErr } = await service.rpc("release_delivery_claim", {
          so_id: so.id,
          reason: "auto-released: driver went dark before pickup (20-minute watchdog)",
        });
        if (!releaseErr) {
          autoReleased++;
          await service.from("audit_log").insert({
            action: "delivery_claim_stuck_auto_released",
            target_table: "vendor_suborders",
            target_id: so.id,
            metadata: { claim_id: claim.id, stuck_status: so.status },
          });
        } else {
          await service.from("audit_log").insert({
            action: "delivery_claim_stuck_auto_release_failed",
            target_table: "vendor_suborders",
            target_id: so.id,
            reason: releaseErr.message,
            metadata: { claim_id: claim.id },
          });
        }
        continue;
      }

      // picked_up / en_route_to_customer: food is already out. NOT
      // auto-recoverable this phase -- notify dispatch once, don't
      // re-email on subsequent 5-minute runs for the same claim.
      if (claim.stuck_notified_at) continue;
      const since = so.status === "en_route_to_customer" && claim.en_route_to_customer_at ? claim.en_route_to_customer_at : claim.picked_up_at;
      if (!since || now - new Date(since).getTime() < STUCK_THRESHOLD_MS) continue;

      const cookVendor = so.vendors as unknown as { storefront_name: string; regions: { dispatch_emails: string[] } | null } | null;
      const dispatchEmails = cookVendor?.regions?.dispatch_emails ?? [];
      const { data: driverVendor } = await service.from("vendors").select("storefront_name").eq("id", claim.driver_vendor_id).single();

      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (dispatchEmails.length > 0 && resendKey) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Cotto <notifications@cottomarket.com>",
              to: dispatchEmails,
              subject: `Stuck delivery needs attention -- ${cookVendor?.storefront_name ?? "order"}`,
              text: `A delivery from ${cookVendor?.storefront_name ?? "a vendor"} has been stuck in status "${so.status}" for over 20 minutes.\n\nDriver: ${driverVendor?.storefront_name ?? claim.driver_vendor_id}\nSuborder: ${so.id}\n\nThis order cannot be auto-released (the food has already left the kitchen) -- please follow up with the driver directly.`,
            }),
          });
          if (!res.ok) throw new Error(`Resend API error (${res.status}): ${await res.text()}`);
        } catch (emailErr) {
          await service.from("audit_log").insert({
            action: "delivery_claim_stuck_notify_failed",
            target_table: "vendor_suborders",
            target_id: so.id,
            reason: (emailErr as Error).message,
            metadata: { claim_id: claim.id },
          });
        }
      }

      // Mark notified regardless of email success -- avoids retry-storming
      // Resend on a persistent config issue, same pattern as the driver's
      // license expiry cron (0034).
      await service.from("delivery_claims").update({ stuck_notified_at: new Date().toISOString() }).eq("id", claim.id);
      await service.from("audit_log").insert({
        action: "delivery_claim_stuck_notified",
        target_table: "vendor_suborders",
        target_id: so.id,
        metadata: { claim_id: claim.id, stuck_status: so.status },
      });
      notified++;
    }

    return new Response(JSON.stringify({ autoReleased, notified }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
