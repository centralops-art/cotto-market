// Every-5-minute cron (migration 0065), HANDOFF.md §39 step 4.
//
// Direct-charge checkouts left in pending_payment for 30+ minutes:
//   - food charge already succeeded (e.g. the app closed before calling
//     checkout-complete) -> settle it: capture delivery, mark paid.
//   - anything else -> cancel: release the delivery-fee authorization and
//     the unpaid food PaymentIntent, mark the order cancelled.
// Never charges a card itself (allowCharge: false).
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "../_shared/cors.ts";
import { cancelDirectOrder, settleDirectOrder } from "../_shared/direct-checkout.ts";

const ABANDON_AFTER_MS = 30 * 60 * 1000; // founder default, 2026-11-22

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return new Response("STRIPE_SECRET_KEY not set", { status: 503 });
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const cutoff = new Date(Date.now() - ABANDON_AFTER_MS).toISOString();
    const { data: stale, error } = await service
      .from("orders")
      .select("id, vendor_suborders!inner(charge_model)")
      .eq("status", "pending_payment")
      .eq("vendor_suborders.charge_model", "direct")
      .lt("created_at", cutoff)
      .limit(100);
    if (error) throw error;

    let settled = 0;
    let cancelled = 0;
    let errors = 0;
    for (const order of stale ?? []) {
      try {
        const result = await settleDirectOrder(service, stripe, order.id, { allowCharge: false });
        if (result.status === "paid") {
          settled++;
        } else if (result.status !== "processing" && result.status !== "cancelled") {
          await cancelDirectOrder(service, stripe, order.id, `abandoned checkout (${result.status})`);
          cancelled++;
        }
      } catch (err) {
        errors++;
        await service.from("audit_log").insert({
          action: "direct_checkout_cleanup_failed",
          target_table: "orders",
          target_id: order.id,
          reason: (err as Error).message,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: stale?.length ?? 0, settled, cancelled, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
