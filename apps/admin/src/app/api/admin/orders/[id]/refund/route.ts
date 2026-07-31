import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/require-admin";
import { sendEmail } from "@/lib/resend";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: "STRIPE_SECRET_KEY isn't configured" }, { status: 503 });
  const stripe = new Stripe(stripeKey, { apiVersion: "2026-06-24.dahlia" });

  const { data: order, error: orderError } = await admin.service.from("orders").select("*").eq("id", id).single();
  if (orderError || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!order.payment_intent_id) return NextResponse.json({ error: "Order has no payment to refund" }, { status: 400 });
  if (order.status !== "paid") {
    return NextResponse.json({ error: `Cannot refund an order with status "${order.status}"` }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const amountCents: number | undefined = body.amountCents;
  if (amountCents !== undefined && (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > order.total_cents)) {
    return NextResponse.json({ error: "amountCents must be a positive integer no greater than the order total" }, { status: 400 });
  }

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: order.payment_intent_id,
      ...(amountCents !== undefined ? { amount: amountCents } : {}),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const isFullRefund = amountCents === undefined || amountCents === order.total_cents;
  const { error: updateError } = await admin.service
    .from("orders")
    .update({ status: isFullRefund ? "refunded" : "partially_refunded" })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "order_refunded",
    target_table: "orders",
    target_id: id,
    metadata: { stripe_refund_id: refund.id, amount_cents: refund.amount },
  });

  // Reverse each vendor's Transfer so Cotto's platform balance doesn't
  // absorb the refund while the vendor keeps their payout. Only done for a
  // full refund -- there's no UI (or unambiguous business rule) for mapping
  // a partial refund amount to a specific vendor's portion of a multi-vendor
  // order yet, so a partial refund is flagged for manual reconciliation
  // instead of guessed at. Best-effort per suborder, after the customer
  // refund (never blocks it) -- in practice protected by the 2-day Connect
  // payout hold (stripe-connect-onboarding), so the funds should still be in
  // the vendor's Connect balance to reverse from.
  const transferReversalResults: { suborderId: string; reversed: boolean; error?: string }[] = [];
  if (isFullRefund) {
    const { data: suborders } = await admin.service
      .from("vendor_suborders")
      .select("id, stripe_transfer_id")
      .eq("order_id", id)
      .not("stripe_transfer_id", "is", null);

    for (const suborder of suborders ?? []) {
      try {
        const reversal = await stripe.transfers.createReversal(suborder.stripe_transfer_id!);
        await admin.service.from("vendor_suborders").update({ stripe_transfer_reversal_id: reversal.id }).eq("id", suborder.id);
        transferReversalResults.push({ suborderId: suborder.id, reversed: true });
      } catch (err) {
        transferReversalResults.push({ suborderId: suborder.id, reversed: false, error: (err as Error).message });
        await admin.service.from("audit_log").insert({
          actor_profile_id: admin.user.id,
          action: "transfer_reversal_failed",
          target_table: "vendor_suborders",
          target_id: suborder.id,
          reason: (err as Error).message,
          metadata: { order_id: id, stripe_transfer_id: suborder.stripe_transfer_id },
        });
      }
    }
  } else {
    await admin.service.from("audit_log").insert({
      actor_profile_id: admin.user.id,
      action: "partial_refund_transfer_reversal_skipped",
      target_table: "orders",
      target_id: id,
      reason: "Partial refunds are not automatically mapped to a vendor Transfer reversal -- needs manual reconciliation.",
      metadata: { amount_cents: refund.amount },
    });
  }

  let emailError: string | undefined;
  const { data: customerAuth } = await admin.service.auth.admin.getUserById(order.customer_profile_id);
  if (customerAuth?.user?.email) {
    const result = await sendEmail({
      to: customerAuth.user.email,
      subject: isFullRefund ? "Your Cotto order was refunded" : "Part of your Cotto order was refunded",
      text: `$${(refund.amount / 100).toFixed(2)} has been refunded to your original payment method. It may take a few business days to appear on your statement.`,
    });
    emailError = result.error;
  }

  return NextResponse.json({ ok: true, refundId: refund.id, emailError, transferReversalResults });
}
