// Reports a vendor's Stripe setup: whether they have a full-dashboard
// account (§39 Direct charges), whether Stripe onboarding is finished, and
// whether Stripe Tax is set up on their account. The mobile app uses it after
// the user returns from the hosted Stripe flow and on the Payments screen.
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
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role: app users can't read the Stripe columns (0069). It bypasses
    // RLS, so the owner_profile_id filter IS the ownership check -- keep it.
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: vendor, error } = await service
      .from("vendors")
      .select("stripe_account_id, stripe_account_model, stripe_charges_enabled, il_tax_account_id, stripe_tax_ready_at")
      .eq("id", vendorId)
      .eq("owner_profile_id", caller.id)
      .single();
    if (error || !vendor) {
      return new Response(JSON.stringify({ error: "Vendor not found or not yours" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // No account, or an old Express account: the cook has to (re)do Stripe
    // onboarding before they can take direct charges (§39).
    if (!vendor.stripe_account_id || vendor.stripe_account_model !== "full") {
      return new Response(
        JSON.stringify({
          hasAccount: false,
          needsNewAccount: !!vendor.stripe_account_id,
          detailsSubmitted: false,
          chargesEnabled: false,
          taxReady: false,
          ilTaxAccountId: vendor.il_tax_account_id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Keep the cached flag (0065) current for the dashboard banner. Service
    // role: the vendor guard makes it server-only.
    if (account.charges_enabled !== vendor.stripe_charges_enabled) {
      await service.from("vendors").update({ stripe_charges_enabled: account.charges_enabled }).eq("id", vendorId);
    }

    return new Response(
      JSON.stringify({
        hasAccount: true,
        needsNewAccount: false,
        detailsSubmitted: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        taxReady: !!vendor.stripe_tax_ready_at,
        ilTaxAccountId: vendor.il_tax_account_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
