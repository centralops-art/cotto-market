// Creates (or reuses) a full-dashboard Stripe Connect account for the calling
// vendor and returns a fresh onboarding Account Link URL. Requires the
// STRIPE_SECRET_KEY secret (`supabase secrets set STRIPE_SECRET_KEY=sk_test_...`),
// live since Phase 8's gate test.
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
      .select("id, stripe_account_id, stripe_account_model, email, storefront_name")
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
      return new Response(JSON.stringify({ error: "Payout setup is temporarily unavailable. Please try again later." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Only a full-dashboard account is reused. A vendor on an old Express
    // account (or none) gets a new one; Express can't be converted.
    let accountId = vendor.stripe_account_model === "full" ? vendor.stripe_account_id : null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        country: "US",
        email: vendor.email ?? undefined,
        business_profile: { name: vendor.storefront_name },
        // Direct charges (§39): full Stripe dashboard, the cook pays Stripe
        // fees, and Stripe/the cook (not Cotto) covers losses. Confirmed in
        // test mode 2026-11-22: Stripe reports these as type "standard".
        controller: {
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          stripe_dashboard: { type: "full" },
          requirement_collection: "stripe",
        },
        // card_payments for the cook's direct food charges; transfers for
        // delivery payouts (every driver is also a vendor, so one account
        // receives both). The payout schedule is the cook's own to set.
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { vendor_id: vendor.id },
      });
      accountId = account.id;

      // Service role: the vendor UPDATE guard (0064) makes these columns
      // server-only. A new account has no Stripe Tax setup yet, so the tax
      // columns reset and the cook redoes stripe-connect-tax-setup.
      const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { error: updateError } = await serviceClient
        .from("vendors")
        .update({
          stripe_account_id: accountId,
          stripe_account_model: "full",
          stripe_tax_registration_id: null,
          stripe_tax_ready_at: null,
        })
        .eq("id", vendorId);
      if (updateError) throw updateError;
    }

    // Stripe requires refresh_url/return_url to be https:// -- a custom app
    // scheme like cotto:// is rejected outright ("Not a valid URL"). Until
    // there's a real deployed domain with universal-link config to bounce
    // straight back into the app, this is just a placeholder page; the
    // mobile app's "I've finished -- check status" button (not automatic
    // redirect detection) is the real completion path either way.
    const returnUrlBase = Deno.env.get("STRIPE_CONNECT_RETURN_URL") ?? "https://cottomarket.com/stripe-connect-return";
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnUrlBase,
      return_url: `${returnUrlBase}?vendor_id=${vendorId}`,
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
