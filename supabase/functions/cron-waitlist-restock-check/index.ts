// Every-5-minute cron (see migration 0048_waitlist_restock_cron.sql): emails
// each waitlist_entries row still unnotified once its menu_item is back in
// stock (is_sold_out flips false), then sets notified_at -- consumed on
// first notification per the column's own comment (migration 0005), no
// repeat emails on a later restock. Email-only per the founder's decision
// (HANDOFF.md §19 precedent: don't expand SMS message types beyond the
// already-approved Twilio A2P 10DLC campaign scope for a new notification
// type). Safe to invoke with no Authorization header, same as every other
// cron in this project -- it always runs as the service role.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: entries, error } = await service
      .from("waitlist_entries")
      .select("id, profile_id, menu_items!inner(name, is_sold_out, vendors(storefront_name))")
      .is("notified_at", null)
      .eq("menu_items.is_sold_out", false);
    if (error) throw error;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    let notified = 0;
    let emailFailures = 0;

    for (const entry of entries ?? []) {
      const item = entry.menu_items as unknown as { name: string; vendors: { storefront_name: string } | null };
      const vendorName = item.vendors?.storefront_name ?? "the vendor";

      let sendError: string | undefined;
      if (!resendKey) {
        sendError = "RESEND_API_KEY isn't configured yet.";
      } else {
        const { data: userRes } = await service.auth.admin.getUserById(entry.profile_id);
        const email = userRes?.user?.email;
        if (!email) {
          sendError = "No email on file for this profile";
        } else {
          try {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: "Cotto <notifications@cottomarket.com>",
                to: email,
                subject: `${item.name} is back in stock!`,
                text: `Good news -- ${item.name} from ${vendorName} is back in stock. Open the Cotto app to order before it sells out again.`,
              }),
            });
            if (!res.ok) sendError = `Resend API error (${res.status}): ${await res.text()}`;
          } catch (err) {
            sendError = (err as Error).message;
          }
        }
      }

      if (sendError) {
        emailFailures++;
        await service.from("audit_log").insert({
          actor_profile_id: null,
          action: "waitlist_notify_email_failed",
          target_table: "waitlist_entries",
          target_id: entry.id,
          reason: sendError,
        });
      }

      // Mark notified regardless of email success -- matches
      // cron-driver-license-expiry-check's established reasoning: avoids
      // retry-storming Resend on a persistent config/address issue, and
      // audit_log already keeps the failure trail.
      await service.from("waitlist_entries").update({ notified_at: new Date().toISOString() }).eq("id", entry.id);
      notified++;
    }

    return new Response(JSON.stringify({ notified, emailFailures }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
