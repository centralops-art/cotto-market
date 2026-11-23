// Called by the app after the customer finishes PaymentSheet for a
// direct-charge order (HANDOFF.md §39 step 4), and again after any 3DS step.
//
//   Pickup: the food charge was confirmed in PaymentSheet on the cook's
//     account; this marks the order paid.
//   Delivery: PaymentSheet authorized the delivery fee on the platform and
//     saved the card; this charges the food on the cook's account with that
//     card, then captures the delivery fee (or cancels it if the food fails).
//
// Request: { orderId }. Response: a SettleResult (see _shared/direct-checkout.ts).
// Requires STRIPE_SECRET_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "../_shared/cors.ts";
import { settleDirectOrder } from "../_shared/direct-checkout.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const { orderId } = (await req.json()) as { orderId?: string };
    if (!orderId) return json({ error: "orderId is required" }, 400);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Payments are temporarily unavailable. Please try again later." }, 503);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    // Ownership check on the service client: only the customer who placed
    // the order can drive its payment forward.
    const { data: order } = await service.from("orders").select("id, customer_profile_id").eq("id", orderId).maybeSingle();
    if (!order || order.customer_profile_id !== user.id) return json({ error: "Order not found" }, 404);

    const result = await settleDirectOrder(service, stripe, orderId, { allowCharge: true });
    return json(result);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
