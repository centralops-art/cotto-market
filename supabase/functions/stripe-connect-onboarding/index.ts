// Creates (or reuses) a Stripe Connect Express account for the calling
// vendor and returns a fresh onboarding Account Link URL. Requires the
// STRIPE_SECRET_KEY secret (`supabase secrets set STRIPE_SECRET_KEY=sk_test_...`).
// TODO: blocked on the founder's Stripe Connect platform account approval --
// this runs against a stubbed/incomplete Connect account until then.
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
    if (!vendorId) {
      return new Response(JSON.stringify({ error: "vendorId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Scoped to the caller's own JWT so RLS (owns_vendor) enforces that they
    // can only do this for their own vendor row.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, stripe_account_id, email, storefront_name")
      .eq("id", vendorId)
      .single();
    if (vendorError || !vendor) {
      return new Response(JSON.stringify({ error: "Vendor not found or not yours" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe isn't configured yet -- ask the founder to set STRIPE_SECRET_KEY." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let accountId = vendor.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: vendor.email ?? undefined,
        business_profile: { name: vendor.storefront_name },
        // Same Connect account is used for both cooking revenue and delivery
        // payouts (spec 3.1) -- separate Transfers, not destination charges.
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      });
      accountId = account.id;

      // service role: bypass RLS to write stripe_account_id (not owner-editable per the guard trigger's intent for admin-managed fields, but this one is set by the system, not the vendor, so a service-role write here is correct).
      const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { error: updateError } = await serviceClient
        .from("vendors")
        .update({ stripe_account_id: accountId })
        .eq("id", vendorId);
      if (updateError) throw updateError;
    }

    const appUrl = Deno.env.get("APP_SCHEME_URL") ?? "cotto://vendor-onboarding";
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: appUrl,
      return_url: `${appUrl}?stripe_return=1`,
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url, stripeAccountId: accountId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
