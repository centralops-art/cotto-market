// Emails the admin allow-list (system_settings.admin_allow_list) when a
// vendor submits their cook application for review. Requires the
// RESEND_API_KEY secret (`supabase secrets set RESEND_API_KEY=re_...`).
import { createClient } from "npm:@supabase/supabase-js@2";
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

    // Scoped to the caller's JWT -- RLS (owns_vendor) ensures they can only
    // trigger this for their own vendor row.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, storefront_name, status")
      .eq("id", vendorId)
      .single();
    if (vendorError || !vendor) {
      return new Response(JSON.stringify({ error: "Vendor not found or not yours" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (vendor.status !== "pending_review") {
      return new Response(JSON.stringify({ error: "Vendor is not pending review" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "Resend isn't configured yet -- set RESEND_API_KEY." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // admin_allow_list is service-role-only (see migration 0010's column grant).
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings, error: settingsError } = await serviceClient
      .from("system_settings")
      .select("admin_allow_list")
      .eq("id", 1)
      .single();
    if (settingsError || !settings) throw settingsError ?? new Error("system_settings not found");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Cotto <notifications@cottomarket.com>",
        to: settings.admin_allow_list,
        subject: `New vendor pending review: ${vendor.storefront_name}`,
        text: `${vendor.storefront_name} has submitted a cook application and is waiting for review.\n\nOpen the admin dashboard to approve or reject.`,
      }),
    });
    if (!emailRes.ok) {
      const body = await emailRes.text();
      throw new Error(`Resend API error (${emailRes.status}): ${body}`);
    }

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
