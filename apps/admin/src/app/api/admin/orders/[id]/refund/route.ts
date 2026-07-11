import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/require-admin";

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

  return NextResponse.json({ ok: true, refundId: refund.id });
}
