// Phase 12: self-service account deletion (App Store Review Guideline
// 5.1.1(v) / Play Store's equivalent -- an app that supports account
// creation must also support in-app account deletion). Confirmed with the
// founder: soft-delete (deactivate + scrub PII), not a hard delete --
// orders.customer_profile_id is `on delete restrict` (0006) anyway, so a
// real DELETE FROM profiles would just fail once the account has any order
// history. Blocks deletion (400, with a specific reason) if the caller:
//   - owns a vendor that's pending_review/active/suspended (must be
//     unpublished or still draft first),
//   - owns a vendor with any non-final vendor_suborders as the cook,
//   - owns a vendor with any active (unreleased) delivery_claims as the
//     driver,
//   - has any non-final vendor_suborders as the customer.
// Same "never disrupt money/orders already in motion" reasoning as vendor
// suspend (Phase 11) and the unclaimed-delivery fallback (Phase 9).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const NON_FINAL_SUBORDER_STATUSES = [
  "received",
  "confirmed",
  "preparing",
  "ready",
  "claimed",
  "en_route_to_pickup",
  "picked_up",
  "en_route_to_customer",
  "delivered",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const { data: profile } = await service.from("profiles").select("status").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "Profile not found" }, 404);
    if (profile.status === "deleted") return json({ ok: true, alreadyDeleted: true });

    const { data: vendor } = await service.from("vendors").select("id, status").eq("owner_profile_id", user.id).maybeSingle();

    if (vendor && ["pending_review", "active", "suspended"].includes(vendor.status)) {
      return json(
        { error: "Please unpublish your storefront (Manage Storefront > set status to Unpublished) before deleting your account." },
        400
      );
    }

    if (vendor) {
      const { data: cookOrders } = await service
        .from("vendor_suborders")
        .select("id")
        .eq("vendor_id", vendor.id)
        .in("status", NON_FINAL_SUBORDER_STATUSES)
        .limit(1);
      if (cookOrders && cookOrders.length > 0) {
        return json({ error: "You have an order in progress as a vendor. Please resolve it before deleting your account." }, 400);
      }

      const { data: activeClaims } = await service
        .from("delivery_claims")
        .select("id, vendor_suborders!inner(status)")
        .eq("driver_vendor_id", vendor.id)
        .is("released_at", null)
        .in("vendor_suborders.status", NON_FINAL_SUBORDER_STATUSES)
        .limit(1);
      if (activeClaims && activeClaims.length > 0) {
        return json({ error: "You have an active delivery in progress. Please finish or release it before deleting your account." }, 400);
      }
    }

    const { data: customerOrders } = await service
      .from("orders")
      .select("id, vendor_suborders!inner(status)")
      .eq("customer_profile_id", user.id)
      .in("vendor_suborders.status", NON_FINAL_SUBORDER_STATUSES)
      .limit(1);
    if (customerOrders && customerOrders.length > 0) {
      return json({ error: "You have an order in progress. Please wait until it's completed, cancelled, or refunded before deleting your account." }, 400);
    }

    const { error: updateError } = await service
      .from("profiles")
      .update({ status: "deleted", full_name: null, phone: null, username: null, avatar_url: null })
      .eq("id", user.id);
    if (updateError) throw updateError;

    // Blocks future sign-ins without touching the auth.users row (which
    // cascades to profiles, orders, reviews, etc. via `on delete cascade` --
    // exactly what the soft-delete decision above is avoiding). 100 years is
    // GoTrue's documented stand-in for "permanent" (no literal forever).
    await service.auth.admin.updateUserById(user.id, { ban_duration: "876000h" });
    // Also kill any already-issued session tokens immediately, not just
    // future sign-ins.
    await service.auth.admin.signOut(authHeader.replace(/^Bearer\s+/i, ""), "global").catch(() => {});

    await service.from("audit_log").insert({
      actor_profile_id: user.id,
      action: "self_account_deletion",
      target_table: "profiles",
      target_id: user.id,
    });

    return json({ ok: true, deleted: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
