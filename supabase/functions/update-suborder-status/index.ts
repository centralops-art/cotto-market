// Cook-driven suborder status transitions (Phase 6). The mobile Kitchen tab
// calls this instead of a raw postgrest `.update()` so that a single place
// owns "who gets notified for which transition" -- the actual transition
// legality is still enforced independently at the DB layer by migration
// 0017's guard_suborder_status_transition trigger (defense in depth: this
// function's own allow-list below exists only to return a clean 400 instead
// of a raw Postgres exception message for garbage input).
//
// Requires RESEND_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
// TWILIO_FROM_NUMBER secrets. Notification failures never block the status
// update itself -- each send is independent and failures are logged to
// audit_log (see stripe-webhook for the established pattern).
//
// SMS only sends when profiles.sms_opt_in is true (migration 0019) -- this
// has to match what's registered with Twilio's A2P 10DLC campaign exactly,
// or carriers reject every message with error 30034/30909 regardless of
// account credentials being correct.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const NOTIFIABLE_STATUSES = new Set(["confirmed", "preparing", "ready", "completed", "cancelled"]);

function messageFor(status: string, vendorName: string, fulfillment: string): { subject: string; text: string } {
  switch (status) {
    case "confirmed":
      return { subject: `${vendorName} confirmed your order`, text: `${vendorName} confirmed your order and will start preparing it soon.` };
    case "preparing":
      return { subject: `${vendorName} is preparing your order`, text: `${vendorName} is preparing your order now.` };
    case "ready":
      return fulfillment === "pickup"
        ? { subject: `Your order from ${vendorName} is ready`, text: `Your order from ${vendorName} is ready for pickup!` }
        : { subject: `Your order from ${vendorName} is ready`, text: `Your order from ${vendorName} is ready and will be on its way soon.` };
    case "completed":
      return { subject: `Order from ${vendorName} complete`, text: `Your order from ${vendorName} is complete. Thanks for ordering on Cotto!` };
    case "cancelled":
      return { subject: `Order from ${vendorName} cancelled`, text: `Your order from ${vendorName} was cancelled. If you were charged, a refund will be issued.` };
    default:
      return { subject: "Order update", text: `Your order from ${vendorName} was updated to ${status}.` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const { suborderId, newStatus } = (await req.json()) as { suborderId?: string; newStatus?: string };
    if (!suborderId || !newStatus) return json({ error: "suborderId and newStatus are required" }, 400);
    if (!NOTIFIABLE_STATUSES.has(newStatus)) {
      return json({ error: `newStatus must be one of ${[...NOTIFIABLE_STATUSES].join(", ")}` }, 400);
    }

    // Scoped to the caller's JWT -- RLS (owns_vendor) ensures they can only
    // read/update suborders for a vendor they own, and the guard trigger
    // (migration 0017) independently enforces the transition is legal.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const { data: before, error: beforeError } = await supabase
      .from("vendor_suborders")
      .select("id, status, order_id, vendor_id, fulfillment")
      .eq("id", suborderId)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return json({ error: "Suborder not found or not yours" }, 404);

    // vendors_select is publicly readable for active vendors, so checking the
    // row is visible isn't enough -- compare owner_profile_id directly rather
    // than relying on RLS to filter this one out.
    const { data: vendorCheck } = await supabase
      .from("vendors")
      .select("owner_profile_id")
      .eq("id", before.vendor_id)
      .maybeSingle();
    if (!vendorCheck || vendorCheck.owner_profile_id !== user.id) {
      return json({ error: "You don't own this vendor" }, 403);
    }

    const { data: updated, error: updateError } = await supabase
      .from("vendor_suborders")
      .update({ status: newStatus })
      .eq("id", suborderId)
      .select()
      .single();
    if (updateError) return json({ error: updateError.message }, 400);

    await service.from("audit_log").insert({
      actor_profile_id: user.id,
      action: "suborder_status_changed",
      target_table: "vendor_suborders",
      target_id: suborderId,
      metadata: { from: before.status, to: newStatus, order_id: before.order_id },
    });

    // Best-effort notifications -- never fail the status update itself.
    const [{ data: order }, { data: vendor }] = await Promise.all([
      service.from("orders").select("customer_profile_id").eq("id", before.order_id).single(),
      service.from("vendors").select("storefront_name").eq("id", before.vendor_id).single(),
    ]);

    if (order && vendor) {
      const { data: customerProfile } = await service
        .from("profiles")
        .select("phone, sms_opt_in")
        .eq("id", order.customer_profile_id)
        .maybeSingle();
      const { data: customerAuth } = await service.auth.admin.getUserById(order.customer_profile_id);
      const customerEmail = customerAuth?.user?.email;
      const { subject, text } = messageFor(newStatus, vendor.storefront_name, before.fulfillment);

      async function logNotifyFailure(channel: "email" | "sms", reason: string) {
        await service.from("audit_log").insert({
          action: `suborder_notify_${channel}_failed`,
          target_table: "vendor_suborders",
          target_id: suborderId,
          reason,
          metadata: { status: newStatus },
        });
      }

      if (customerEmail) {
        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (resendKey) {
          try {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: "Cotto <notifications@cottomarket.com>", to: customerEmail, subject, text }),
            });
            if (!res.ok) throw new Error(`Resend API error (${res.status}): ${await res.text()}`);
          } catch (err) {
            await logNotifyFailure("email", (err as Error).message);
          }
        }
      }

      if (customerProfile?.phone && customerProfile.sms_opt_in) {
        const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
        const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");
        if (twilioSid && twilioToken && twilioFrom) {
          try {
            const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
              method: "POST",
              headers: {
                Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({ To: customerProfile.phone, From: twilioFrom, Body: text }),
            });
            if (!res.ok) throw new Error(`Twilio API error (${res.status}): ${await res.text()}`);
          } catch (err) {
            await logNotifyFailure("sms", (err as Error).message);
          }
        }
      }
    }

    return json({ ok: true, suborder: updated });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
