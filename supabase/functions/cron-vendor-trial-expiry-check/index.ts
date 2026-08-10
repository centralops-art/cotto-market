// Daily cron (see migration 0052): Phase 11's free-trial automation.
// vendors.platform_fee_pct / free_trial_ends_at already existed as schema
// (an admin-only override, guarded by guard_vendor_owner_update) but had no
// automated reset -- HANDOFF.md §3 flagged this as "not built yet." Confirmed
// with the founder before building: once free_trial_ends_at passes, reset
// platform_fee_pct back to null (falls back to system_settings.
// default_platform_fee_pct) and clear free_trial_ends_at, same
// auto-suspend-then-notify shape as cron-cfpm-expiry-check /
// cron-driver-license-expiry-check, but this isn't punitive -- it emails the
// vendor directly (best-effort, matches the established
// never-block-on-a-notification-failure pattern) instead of just warning an
// admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const nowIso = new Date().toISOString();

    const { data: settings } = await service.from("system_settings").select("default_platform_fee_pct").eq("id", 1).single();
    const defaultPct = settings?.default_platform_fee_pct ?? 8;

    const { data: expiredTrials, error } = await service
      .from("vendors")
      .select("id, storefront_name, email, platform_fee_pct")
      .not("free_trial_ends_at", "is", null)
      .lt("free_trial_ends_at", nowIso)
      .not("platform_fee_pct", "is", null);
    if (error) throw error;

    let reset = 0;
    let emailFailures = 0;

    for (const vendor of expiredTrials ?? []) {
      const { error: updateErr } = await service
        .from("vendors")
        .update({ platform_fee_pct: null, free_trial_ends_at: null })
        .eq("id", vendor.id);
      if (updateErr) {
        await service.from("audit_log").insert({
          actor_profile_id: null,
          action: "vendor_trial_expiry_reset_failed",
          target_table: "vendors",
          target_id: vendor.id,
          reason: updateErr.message,
        });
        continue;
      }

      reset++;
      await service.from("audit_log").insert({
        actor_profile_id: null,
        action: "vendor_trial_expired_fee_reset",
        target_table: "vendors",
        target_id: vendor.id,
        reason: `Free trial ended; platform fee reset from ${vendor.platform_fee_pct}% to the platform default (${defaultPct}%)`,
      });

      if (vendor.email && resendKey) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Cotto <notifications@cottomarket.com>",
              to: vendor.email,
              subject: "Your Cotto trial period has ended",
              text: `Hi ${vendor.storefront_name},\n\nYour promotional platform fee rate has ended. Starting now, orders through ${vendor.storefront_name} are subject to Cotto's standard platform fee (currently ${defaultPct}%).\n\nQuestions? Just reply to this email.`,
            }),
          });
          if (!res.ok) throw new Error(`Resend API error (${res.status}): ${await res.text()}`);
        } catch (emailErr) {
          emailFailures++;
          await service.from("audit_log").insert({
            action: "vendor_trial_expired_notify_failed",
            target_table: "vendors",
            target_id: vendor.id,
            reason: (emailErr as Error).message,
          });
        }
      }
    }

    return new Response(JSON.stringify({ reset, emailFailures }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
