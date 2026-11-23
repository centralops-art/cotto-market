import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/require-admin";
import { sendEmail } from "@/lib/resend";

type AdminService = NonNullable<Awaited<ReturnType<typeof requireAdmin>>>["service"];

interface DirectSuborder {
  id: string;
  subtotal_cents: number;
  tax_cents: number;
  delivery_fee_cents: number;
  stripe_account_id: string | null;
  stripe_payment_intent_id: string | null;
  delivery_payment_intent_id: string | null;
  stripe_tax_transaction_id: string | null;
  stripe_tax_reversal_id: string | null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: "STRIPE_SECRET_KEY isn't configured" }, { status: 503 });
  const stripe = new Stripe(stripeKey, { apiVersion: "2026-06-24.dahlia" });

  const { data: order, error: orderError } = await admin.service.from("orders").select("*").eq("id", id).single();
  if (orderError || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "paid") {
    return NextResponse.json({ error: `Cannot refund an order with status "${order.status}"` }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const amountCents: number | undefined = body.amountCents;
  if (amountCents !== undefined && (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > order.total_cents)) {
    return NextResponse.json({ error: "amountCents must be a positive integer no greater than the order total" }, { status: 400 });
  }

  // Direct charges (HANDOFF.md §39): one suborder, food charged on the cook's
  // account, delivery fee as a separate platform charge.
  const { data: directSuborders } = await admin.service
    .from("vendor_suborders")
    .select(
      "id, subtotal_cents, tax_cents, delivery_fee_cents, stripe_account_id, stripe_payment_intent_id, delivery_payment_intent_id, stripe_tax_transaction_id, stripe_tax_reversal_id"
    )
    .eq("order_id", id)
    .eq("charge_model", "direct");
  if (directSuborders && directSuborders.length > 0) {
    return refundDirectOrder(admin, stripe, order, directSuborders[0] as DirectSuborder, amountCents);
  }

  if (!order.payment_intent_id) return NextResponse.json({ error: "Order has no payment to refund" }, { status: 400 });

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

  // Reverse the Stripe Tax transaction for each suborder (migration 0061),
  // so Stripe's tax reports don't count tax that was refunded. Same rule as
  // the Transfer reversals above: only a full refund is reversed
  // automatically; a partial refund is left for manual reconciliation (the
  // audit_log entry above already flags it).
  if (isFullRefund) {
    const { data: taxSuborders } = await admin.service
      .from("vendor_suborders")
      .select("id, stripe_tax_transaction_id")
      .eq("order_id", id)
      .not("stripe_tax_transaction_id", "is", null)
      .is("stripe_tax_reversal_id", null);

    for (const suborder of taxSuborders ?? []) {
      await reverseTax(admin, stripe, id, suborder.id, suborder.stripe_tax_transaction_id!, undefined);
    }
  }

  const emailError = await emailCustomer(admin.service, order.customer_profile_id, refund.amount, isFullRefund);
  return NextResponse.json({ ok: true, refundId: refund.id, emailError, transferReversalResults });
}

// Food is refunded first (on the cook's account, returning Cotto's platform
// fee with it), then any remainder from the platform delivery charge. A full
// refund also reverses the cook's Stripe Tax transaction; a partial refund
// is flagged for manual tax reconciliation, same as before.
async function refundDirectOrder(
  admin: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>,
  stripe: Stripe,
  order: { id: string; total_cents: number; customer_profile_id: string },
  suborder: DirectSuborder,
  amountCents: number | undefined
) {
  if (!suborder.stripe_payment_intent_id || !suborder.stripe_account_id) {
    return NextResponse.json({ error: "Order has no food payment to refund" }, { status: 400 });
  }
  const total = amountCents ?? order.total_cents;
  const foodTotal = suborder.subtotal_cents + suborder.tax_cents;
  const foodRefundCents = Math.min(total, foodTotal);
  const deliveryRefundCents = Math.min(total - foodRefundCents, suborder.delivery_fee_cents);
  const isFullRefund = total >= order.total_cents;

  const refundIds: string[] = [];
  try {
    const foodRefund = await stripe.refunds.create(
      { payment_intent: suborder.stripe_payment_intent_id, amount: foodRefundCents, refund_application_fee: true },
      { stripeAccount: suborder.stripe_account_id }
    );
    refundIds.push(foodRefund.id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  let deliveryRefundError: string | undefined;
  if (deliveryRefundCents > 0) {
    if (!suborder.delivery_payment_intent_id) {
      deliveryRefundError = "No delivery payment on this order";
    } else {
      try {
        const deliveryRefund = await stripe.refunds.create({
          payment_intent: suborder.delivery_payment_intent_id,
          amount: deliveryRefundCents,
        });
        refundIds.push(deliveryRefund.id);
      } catch (err) {
        deliveryRefundError = (err as Error).message;
      }
    }
    if (deliveryRefundError) {
      await admin.service.from("audit_log").insert({
        actor_profile_id: admin.user.id,
        action: "direct_delivery_refund_failed",
        target_table: "orders",
        target_id: order.id,
        reason: deliveryRefundError,
        metadata: { amount_cents: deliveryRefundCents },
      });
    }
  }

  const refundedCents = foodRefundCents + (deliveryRefundError ? 0 : deliveryRefundCents);
  const { error: updateError } = await admin.service
    .from("orders")
    .update({ status: isFullRefund && !deliveryRefundError ? "refunded" : "partially_refunded" })
    .eq("id", order.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "order_refunded",
    target_table: "orders",
    target_id: order.id,
    metadata: {
      charge_model: "direct",
      stripe_refund_ids: refundIds,
      food_refund_cents: foodRefundCents,
      delivery_refund_cents: deliveryRefundError ? 0 : deliveryRefundCents,
    },
  });

  if (isFullRefund) {
    if (suborder.stripe_tax_transaction_id && !suborder.stripe_tax_reversal_id) {
      await reverseTax(admin, stripe, order.id, suborder.id, suborder.stripe_tax_transaction_id, suborder.stripe_account_id);
    }
  } else {
    await admin.service.from("audit_log").insert({
      actor_profile_id: admin.user.id,
      action: "partial_refund_tax_reversal_skipped",
      target_table: "orders",
      target_id: order.id,
      reason: "Partial refunds don't automatically reverse Stripe Tax -- needs manual reconciliation on the cook's account.",
      metadata: { amount_cents: refundedCents },
    });
  }

  const emailError = await emailCustomer(admin.service, order.customer_profile_id, refundedCents, isFullRefund);
  return NextResponse.json({
    ok: true,
    refundId: refundIds[0],
    refundIds,
    emailError,
    deliveryRefundError,
    transferReversalResults: [],
  });
}

async function reverseTax(
  admin: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>,
  stripe: Stripe,
  orderId: string,
  suborderId: string,
  transactionId: string,
  stripeAccount: string | undefined
) {
  try {
    const reversal = await stripe.tax.transactions.createReversal(
      {
        mode: "full",
        original_transaction: transactionId,
        reference: `suborder-${suborderId}-refund`,
        metadata: { order_id: orderId, vendor_suborder_id: suborderId },
      },
      { idempotencyKey: `tax-reversal-${suborderId}`, stripeAccount }
    );
    await admin.service.from("vendor_suborders").update({ stripe_tax_reversal_id: reversal.id }).eq("id", suborderId);
  } catch (err) {
    await admin.service.from("audit_log").insert({
      actor_profile_id: admin.user.id,
      action: "tax_reversal_failed",
      target_table: "vendor_suborders",
      target_id: suborderId,
      reason: (err as Error).message,
      metadata: { order_id: orderId, stripe_tax_transaction_id: transactionId },
    });
  }
}

async function emailCustomer(service: AdminService, customerProfileId: string, amountCents: number, isFullRefund: boolean) {
  const { data: customerAuth } = await service.auth.admin.getUserById(customerProfileId);
  if (!customerAuth?.user?.email) return undefined;
  const result = await sendEmail({
    to: customerAuth.user.email,
    subject: isFullRefund ? "Your Cotto order was refunded" : "Part of your Cotto order was refunded",
    text: `$${(amountCents / 100).toFixed(2)} has been refunded to your original payment method. It may take a few business days to appear on your statement.`,
  });
  return result.error;
}
