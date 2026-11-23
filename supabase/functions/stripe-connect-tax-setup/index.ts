// Sets up Stripe Tax on a cook's own connected account (HANDOFF.md §39).
//
// Under Direct charges the cook is merchant of record, so tax calculations
// and transactions run on the cook's account. Without a head office and an
// Illinois registration there, Stripe Tax calculates $0. Cotto does the setup
// by API (founder decision 2026-11-22) from:
//   - the kitchen address already on the vendor row (head office), and
//   - the cook's Illinois Department of Revenue account ID, which they enter.
// Stripe's US registration doesn't take the state ID; it's stored for records.
//
// Request: { vendorId, ilTaxAccountId }. Requires STRIPE_SECRET_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const { vendorId, ilTaxAccountId } = await req.json();
    if (!vendorId) return json({ error: "vendorId is required" }, 400);

    // IDOR account IDs are 8 digits, usually written 1234-5678.
    const digits = String(ilTaxAccountId ?? "").replace(/[\s-]/g, "");
    if (!/^\d{8}$/.test(digits)) {
      return json({ error: "Enter your 8-digit Illinois Department of Revenue account ID (e.g. 1234-5678)." }, 400);
    }
    const normalizedTaxId = `${digits.slice(0, 4)}-${digits.slice(4)}`;

    // Caller's own JWT identifies them; ownership is checked explicitly
    // (vendors_select RLS lets anyone read an ACTIVE vendor row).
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller) return json({ error: "Not signed in" }, 401);
    // Service role for the read: the street address isn't readable by app
    // users once 0068 is applied (§44). Scoped to the caller's own vendor.
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const callerId = caller.id;
    const { data: vendor, error: vendorError } = await service
      .from("vendors")
      .select("id, stripe_account_id, stripe_account_model, address_line1, city, state, zip")
      .eq("id", vendorId)
      .eq("owner_profile_id", callerId)
      .single();
    if (vendorError || !vendor) return json({ error: "Vendor not found or not yours" }, 404);

    if (!vendor.stripe_account_id || vendor.stripe_account_model !== "full") {
      return json({ error: "Connect with Stripe first, then set up sales tax." }, 409);
    }
    if (!vendor.address_line1 || !vendor.city || !vendor.state || !vendor.zip) {
      return json({ error: "Add your kitchen's full address to your storefront first." }, 409);
    }
    if (vendor.state.trim().toUpperCase() !== "IL") {
      return json({ error: "Cotto currently supports kitchens in Illinois only." }, 409);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Tax setup is temporarily unavailable. Please try again later." }, 503);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const stripeAccount = vendor.stripe_account_id;

    await stripe.tax.settings.update(
      {
        head_office: {
          address: {
            line1: vendor.address_line1,
            city: vendor.city,
            state: "IL",
            postal_code: vendor.zip,
            country: "US",
          },
        },
      },
      { stripeAccount }
    );

    // Reuse an existing active IL registration (e.g. a retry, or the cook
    // added one in their own dashboard) rather than creating a duplicate.
    const existing = await stripe.tax.registrations.list({ status: "active", limit: 100 }, { stripeAccount });
    let registration = existing.data.find(
      (r) => r.country === "US" && r.country_options.us?.state === "IL" && r.country_options.us?.type === "state_sales_tax"
    );
    if (!registration) {
      registration = await stripe.tax.registrations.create(
        { country: "US", country_options: { us: { state: "IL", type: "state_sales_tax" } }, active_from: "now" },
        { stripeAccount }
      );
    }

    // Service role: these vendor columns are server-only (guard, 0064).
    const { error: updateError } = await service
      .from("vendors")
      .update({
        il_tax_account_id: normalizedTaxId,
        stripe_tax_registration_id: registration.id,
        stripe_tax_ready_at: new Date().toISOString(),
      })
      .eq("id", vendor.id)
      // Don't mark a replaced account ready if onboarding swapped it meanwhile.
      .eq("stripe_account_id", stripeAccount);
    if (updateError) throw updateError;

    return json({ taxReady: true, ilTaxAccountId: normalizedTaxId });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
