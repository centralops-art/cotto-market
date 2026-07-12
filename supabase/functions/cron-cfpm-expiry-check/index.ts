// Daily cron (see supabase/config.toml [functions.cron-cfpm-expiry-check] and
// migration comments): auto-suspends vendors whose CFPM cert has expired, and
// sends Central Ops a single digest email 60 days before expiry -- admin
// only, per the confirmed product decision (no vendor-facing warning email).
// Requires RESEND_API_KEY. Safe to invoke with no Authorization header since
// it always runs as the service role (cron, not a user-triggered action).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const WARNING_WINDOW_DAYS = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. Auto-suspend vendors whose cert has already expired.
    const today = new Date().toISOString().slice(0, 10);
    const { data: expired, error: expiredError } = await service
      .from("vendors")
      .update({ status: "suspended" })
      .lt("cfpm_cert_expires_on", today)
      .in("status", ["active", "unpublished"])
      .select("id, storefront_name");
    if (expiredError) throw expiredError;

    for (const vendor of expired ?? []) {
      await service.from("audit_log").insert({
        actor_profile_id: null,
        action: "cfpm_cert_expired_auto_suspend",
        target_table: "vendors",
        target_id: vendor.id,
        reason: "CFPM certificate expired",
      });
    }

    // 2. Warn admins about vendors entering the 60-day expiry window who
    // haven't been warned yet.
    const warningCutoff = new Date();
    warningCutoff.setDate(warningCutoff.getDate() + WARNING_WINDOW_DAYS);
    const { data: nearingExpiry, error: nearingError } = await service
      .from("vendors")
      .select("id, storefront_name, cfpm_cert_expires_on")
      .not("status", "eq", "suspended")
      .is("cfpm_expiry_warned_at", null)
      .not("cfpm_cert_expires_on", "is", null)
      .lte("cfpm_cert_expires_on", warningCutoff.toISOString().slice(0, 10))
      .gte("cfpm_cert_expires_on", today);
    if (nearingError) throw nearingError;

    let emailError: string | undefined;
    if (nearingExpiry && nearingExpiry.length > 0) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const { data: settings } = await service.from("system_settings").select("admin_allow_list").eq("id", 1).single();

      if (resendKey && settings?.admin_allow_list?.length) {
        const lines = nearingExpiry
          .map((v) => `- ${v.storefront_name}: expires ${v.cfpm_cert_expires_on}`)
          .join("\n");
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Cotto <notifications@cottomarket.com>",
            to: settings.admin_allow_list,
            subject: `${nearingExpiry.length} vendor CFPM cert(s) expiring within ${WARNING_WINDOW_DAYS} days`,
            text: `The following vendors' CFPM certs expire soon:\n\n${lines}\n\nReach out before they're auto-suspended on expiry.`,
          }),
        });
        if (!emailRes.ok) emailError = `Resend API error (${emailRes.status}): ${await emailRes.text()}`;
      } else if (!resendKey) {
        emailError = "RESEND_API_KEY isn't configured yet.";
      }

      // Mark warned regardless of email success -- avoids retry-storming
      // Resend on a persistent config issue; the next day's run still tries
      // any newly-eligible vendors, and audit_log keeps the suspend trail.
      await service
        .from("vendors")
        .update({ cfpm_expiry_warned_at: new Date().toISOString() })
        .in("id", nearingExpiry.map((v) => v.id));
    }

    return new Response(
      JSON.stringify({
        suspended: expired?.length ?? 0,
        warned: nearingExpiry?.length ?? 0,
        emailError,
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
