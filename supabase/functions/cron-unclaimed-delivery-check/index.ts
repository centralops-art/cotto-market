// Every-5-minute cron (see migration 0045): Phase 9's unclaimed-delivery
// fallback. Scans 'ready' delivery suborders by how long they've sat
// unclaimed (vendor_suborders.ready_at, reset to now() on every claim
// release -- see migration 0036's release_delivery_claim) against the
// region's configurable T1/T2/T3 minutes (regions.claim_window_t1/2/3_minutes,
// migration 0001), and fires each stage exactly once per delivery_cycle:
//
//   T1 (default 10 min): email the region's dispatch contact with full
//     order details. NOTE: spec 3.7 says "SMS + email" here, but this stays
//     email-only, deliberately deviating from the literal spec -- this
//     project's Twilio A2P 10DLC campaign was rejected twice already (see
//     HANDOFF.md section 11) for sending message types outside its
//     registered scope (consumer order-status updates to opted-in
//     customers). An ops-alert SMS to a business dispatch number is a
//     different message type the approved campaign doesn't cover, and this
//     project can't afford a third rejection. cron-stuck-delivery-watchdog
//     (Phase 8) already set this precedent -- dispatch gets email only.
//   T2 (default 30 min): email + SMS (gated on profiles.sms_opt_in, same as
//     every other customer notification) telling the customer to open the
//     app to choose pickup-or-refund. Logs t2_customer_offer_sent with the
//     T3 deadline in the payload -- suborder_pending_customer_offer()
//     (migration 0044) reads this to show the in-app buttons.
//   T3 (default 60 min): auto full refund (refundSuborder, shared with the
//     customer's own T2 refund choice) if the customer never responded.
//
// Idempotency for all three stages: delivery_dispatch_events, keyed by
// event_type + the suborder's CURRENT delivery_cycle in the payload -- a
// released-and-reclaimed suborder gets a fresh cycle and its own fresh
// T1/T2/T3 countdown, matching release_delivery_claim's "fresh ready_at"
// comment.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "../_shared/cors.ts";
import { refundSuborder } from "../_shared/refund-suborder.ts";

type Candidate = {
  id: string;
  order_id: string;
  vendor_id: string;
  ready_at: string;
  delivery_cycle: number;
  subtotal_cents: number;
  delivery_fee_cents: number;
  tax_cents: number;
  stripe_transfer_id: string | null;
  delivery_address: { line1?: string; city?: string; state?: string; zip?: string } | null;
  vendors: {
    storefront_name: string;
    region_id: string;
    regions: {
      claim_window_t1_minutes: number;
      claim_window_t2_minutes: number;
      claim_window_t3_minutes: number;
      dispatch_emails: string[];
    } | null;
  } | null;
  orders: { customer_profile_id: string; payment_intent_id: string | null; total_cents: number; status: string } | null;
};

async function sendEmail(resendKey: string | undefined, to: string | string[], subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!resendKey) return { ok: false, error: "RESEND_API_KEY not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Cotto <notifications@cottomarket.com>", to, subject, text }),
    });
    if (!res.ok) throw new Error(`Resend API error (${res.status}): ${await res.text()}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!twilioSid || !twilioToken || !twilioFrom) return { ok: false, error: "Twilio secrets not configured" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: twilioFrom, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio API error (${res.status}): ${await res.text()}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const now = Date.now();

    const { data: candidates, error } = await service
      .from("vendor_suborders")
      .select(
        "id, order_id, vendor_id, ready_at, delivery_cycle, subtotal_cents, delivery_fee_cents, tax_cents, stripe_transfer_id, delivery_address, " +
          "vendors(storefront_name, region_id, regions(claim_window_t1_minutes, claim_window_t2_minutes, claim_window_t3_minutes, dispatch_emails)), " +
          "orders(customer_profile_id, payment_intent_id, total_cents, status)"
      )
      .eq("fulfillment", "delivery")
      .eq("status", "ready")
      .not("ready_at", "is", null);
    if (error) throw error;

    let t1Sent = 0;
    let t2Sent = 0;
    let t3Refunded = 0;

    for (const so of (candidates ?? []) as unknown as Candidate[]) {
      const region = so.vendors?.regions;
      const order = so.orders;
      if (!region || !order) continue;

      const elapsedMinutes = (now - new Date(so.ready_at).getTime()) / 60000;

      const { data: events } = await service
        .from("delivery_dispatch_events")
        .select("event_type, payload")
        .eq("vendor_suborder_id", so.id);
      const forThisCycle = (evts: { event_type: string; payload: Record<string, unknown> }[] | null, type: string) =>
        (evts ?? []).some((e) => e.event_type === type && Number(e.payload?.delivery_cycle) === so.delivery_cycle);

      const resolved =
        forThisCycle(events, "customer_chose_pickup") ||
        forThisCycle(events, "customer_chose_refund") ||
        forThisCycle(events, "t3_auto_refunded") ||
        forThisCycle(events, "claim_cancelled_pending_offer");
      if (resolved) continue;

      // Human-readable item list -- every email in this function that
      // references "this order" uses this instead of a raw suborder UUID
      // (gate-test finding: an opaque UUID means nothing to a human
      // reading a dispatch/refund alert).
      const { data: orderItems } = await service.from("order_items").select("name_snapshot, quantity").eq("vendor_suborder_id", so.id);
      const itemsText = (orderItems ?? []).map((i) => `${i.quantity}x ${i.name_snapshot}`).join(", ") || "(items unavailable)";
      const adminLink = `https://admin.cottomarket.com/dashboard/orders/${so.order_id}`;

      // --- T1: dispatch alert (email only -- see file header) ---
      if (elapsedMinutes >= region.claim_window_t1_minutes && !forThisCycle(events, "t1_sms_sent")) {
        if (region.dispatch_emails.length > 0) {
          const addr = so.delivery_address;
          const addrText = addr ? `${addr.line1 ?? ""}, ${addr.city ?? ""}, ${addr.state ?? ""} ${addr.zip ?? ""}`.trim() : "unknown address";
          const { error: emailErr } = await sendEmail(
            resendKey,
            region.dispatch_emails,
            `Unclaimed delivery needs attention -- ${so.vendors?.storefront_name ?? "order"}`,
            `A delivery from ${so.vendors?.storefront_name ?? "a vendor"} has been ready and unclaimed for over ${region.claim_window_t1_minutes} minutes.\n\nItems: ${itemsText}\nDelivery address: ${addrText}\n\nView this order: ${adminLink}\n\nPlease help find a driver for this order.`
          );
          if (emailErr) {
            await service.from("audit_log").insert({
              action: "unclaimed_delivery_t1_notify_failed",
              target_table: "vendor_suborders",
              target_id: so.id,
              reason: emailErr,
            });
          }
        }
        await service
          .from("delivery_dispatch_events")
          .insert({ vendor_suborder_id: so.id, event_type: "t1_sms_sent", payload: { delivery_cycle: so.delivery_cycle } });
        t1Sent++;
      }

      // --- T2: customer pickup-or-refund offer ---
      if (elapsedMinutes >= region.claim_window_t2_minutes && !forThisCycle(events, "t2_customer_offer_sent")) {
        const t3DeadlineMs = new Date(so.ready_at).getTime() + region.claim_window_t3_minutes * 60000;
        const expiresAt = new Date(t3DeadlineMs).toISOString();

        const { data: customerAuth } = await service.auth.admin.getUserById(order.customer_profile_id);
        const { data: customerProfile } = await service
          .from("profiles")
          .select("phone, sms_opt_in")
          .eq("id", order.customer_profile_id)
          .maybeSingle();

        const text = `No driver has claimed your delivery from ${so.vendors?.storefront_name ?? "your vendor"} yet. Open the Cotto app to switch to pickup or get a full refund.`;
        if (customerAuth?.user?.email) {
          const { error: emailErr } = await sendEmail(resendKey, customerAuth.user.email, "No driver available yet -- action needed", text);
          if (emailErr) {
            await service.from("audit_log").insert({
              action: "unclaimed_delivery_t2_notify_email_failed",
              target_table: "vendor_suborders",
              target_id: so.id,
              reason: emailErr,
            });
          }
        }
        if (customerProfile?.phone && customerProfile.sms_opt_in) {
          const { error: smsErr } = await sendSms(customerProfile.phone, text);
          if (smsErr) {
            await service.from("audit_log").insert({
              action: "unclaimed_delivery_t2_notify_sms_failed",
              target_table: "vendor_suborders",
              target_id: so.id,
              reason: smsErr,
            });
          }
        }

        await service.from("delivery_dispatch_events").insert({
          vendor_suborder_id: so.id,
          event_type: "t2_customer_offer_sent",
          payload: { delivery_cycle: so.delivery_cycle, expires_at: expiresAt },
        });
        t2Sent++;
      }

      // --- T3: auto-refund ---
      if (elapsedMinutes >= region.claim_window_t3_minutes) {
        const result = await refundSuborder(
          service,
          stripe,
          {
            id: so.id,
            order_id: so.order_id,
            subtotal_cents: so.subtotal_cents,
            delivery_fee_cents: so.delivery_fee_cents,
            tax_cents: so.tax_cents,
            stripe_transfer_id: so.stripe_transfer_id,
            delivery_cycle: so.delivery_cycle,
          },
          { id: so.order_id, payment_intent_id: order.payment_intent_id, total_cents: order.total_cents, status: order.status }
        );

        if (result.ok) {
          await service.from("delivery_dispatch_events").insert({
            vendor_suborder_id: so.id,
            event_type: "t3_auto_refunded",
            payload: { delivery_cycle: so.delivery_cycle, stripe_refund_id: result.refundId, amount_cents: result.amountCents },
          });
          t3Refunded++;

          const customerText = `Since no driver claimed your delivery from ${so.vendors?.storefront_name ?? "your vendor"} in time, we've issued a full refund. We're sorry for the inconvenience.`;
          const { data: customerAuth } = await service.auth.admin.getUserById(order.customer_profile_id);
          if (customerAuth?.user?.email) await sendEmail(resendKey, customerAuth.user.email, "Your order was refunded", customerText);

          const { data: vendor } = await service.from("vendors").select("owner_profile_id").eq("id", so.vendor_id).single();
          if (vendor?.owner_profile_id) {
            const { data: vendorAuth } = await service.auth.admin.getUserById(vendor.owner_profile_id);
            if (vendorAuth?.user?.email) {
              await sendEmail(
                resendKey,
                vendorAuth.user.email,
                "A delivery order went unclaimed and was refunded",
                `Your order for ${itemsText} went unclaimed by any driver and has been automatically refunded to the customer. No payout will be issued for this order.`
              );
            }
          }
        } else if (!result.alreadyResolved) {
          // alreadyResolved is benign (a claim or another resolution won
          // the race at the T3 boundary) -- not worth logging as a failure.
          await service.from("audit_log").insert({
            action: "unclaimed_delivery_t3_refund_failed",
            target_table: "vendor_suborders",
            target_id: so.id,
            reason: result.error,
          });
        }
      }
    }

    return new Response(JSON.stringify({ t1Sent, t2Sent, t3Refunded }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
