// Checks whether a vendor's Stripe Connect Express account has finished
// onboarding, so the mobile app knows it's safe to submit for review after
// the user returns from the hosted Stripe flow.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { vendorId } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: vendor, error } = await supabase
      .from("vendors")
      .select("stripe_account_id")
      .eq("id", vendorId)
      .single();
    if (error || !vendor?.stripe_account_id) {
      return new Response(JSON.stringify({ error: "No Stripe account on file for this vendor" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe isn't configured yet." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const account = await stripe.accounts.retrieve(vendor.stripe_account_id);

    return new Response(
      JSON.stringify({ detailsSubmitted: account.details_submitted, chargesEnabled: account.charges_enabled }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
