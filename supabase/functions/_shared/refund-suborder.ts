// Shared by cron-unclaimed-delivery-check (T3 auto-refund) and
// resolve-delivery-offer (customer's T2 "get a refund" choice). Phase 9.
//
// Refunds exactly ONE suborder's share of a possibly multi-vendor order
// (subtotal + delivery fee + this suborder's own tax_cents -- migration
// 0042) and reverses ONLY that suborder's own Stripe Transfer, if it has
// one. This is deliberately narrower than the admin app's order-level
// refund route (apps/admin/src/app/api/admin/orders/[id]/refund), which
// loops over every suborder on the order -- reusing that route here would
// incorrectly reverse an unrelated vendor's payout in a multi-vendor cart
// just because ONE vendor's delivery went unclaimed.
//
// The cook is paid immediately at payment_intent.succeeded (see
// stripe-webhook), well before delivery -- so "the cook is paid nothing"
// (spec 3.7 known-risk item 6) requires an explicit reversal here, same
// mechanism the admin route already established (migration 0026).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type Stripe from "npm:stripe@17";

export type RefundableSuborder = {
  id: string;
  order_id: string;
  subtotal_cents: number;
  delivery_fee_cents: number;
  tax_cents: number;
  stripe_transfer_id: string | null;
  delivery_cycle: number;
};

export type RefundableOrder = {
  id: string;
  payment_intent_id: string | null;
  total_cents: number;
  status: string;
};

export async function refundSuborder(
  service: SupabaseClient,
  stripe: Stripe,
  suborder: RefundableSuborder,
  order: RefundableOrder
): Promise<
  | { ok: true; refundId: string; amountCents: number; reversed: boolean; reversalError?: string }
  | { ok: false; error: string; alreadyResolved?: boolean }
> {
  if (!order.payment_intent_id) return { ok: false, error: "Order has no payment to refund" };

  const amountCents = suborder.subtotal_cents + suborder.delivery_fee_cents + suborder.tax_cents;
  if (amountCents <= 0) return { ok: false, error: "Nothing to refund on this suborder" };

  // Atomic race guard: only proceed if this suborder is still ('ready',
  // this exact delivery_cycle) -- whichever caller (a driver's
  // claim_delivery, this refund, or a concurrent second call to this same
  // function) flips status away from 'ready' first wins; everyone else's
  // conditional UPDATE affects 0 rows and bails out cleanly. Same idiom as
  // claim_delivery's `update ... where status = 'ready'`.
  const { data: locked, error: lockErr } = await service
    .from("vendor_suborders")
    .update({ status: "refunded" })
    .eq("id", suborder.id)
    .eq("status", "ready")
    .eq("delivery_cycle", suborder.delivery_cycle)
    .select("id");
  if (lockErr) return { ok: false, error: lockErr.message };
  if (!locked || locked.length === 0) {
    return { ok: false, error: "This order is no longer eligible for a refund (already claimed or resolved)", alreadyResolved: true };
  }

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      { payment_intent: order.payment_intent_id, amount: amountCents },
      { idempotencyKey: `unclaimed-refund-${suborder.id}-cycle-${suborder.delivery_cycle}` }
    );
  } catch (err) {
    // Compensate: the status flip above already "spent" this suborder's
    // only shot at being refunded -- revert it back to 'ready' so it's
    // still poolable/retryable rather than stuck in a limbo 'refunded'
    // status with no money actually moved.
    await service.from("vendor_suborders").update({ status: "ready" }).eq("id", suborder.id);
    return { ok: false, error: (err as Error).message };
  }

  let reversed = false;
  let reversalError: string | undefined;
  if (suborder.stripe_transfer_id) {
    try {
      const reversal = await stripe.transfers.createReversal(suborder.stripe_transfer_id);
      await service.from("vendor_suborders").update({ stripe_transfer_reversal_id: reversal.id }).eq("id", suborder.id);
      reversed = true;
    } catch (err) {
      reversalError = (err as Error).message;
      await service.from("audit_log").insert({
        action: "transfer_reversal_failed",
        target_table: "vendor_suborders",
        target_id: suborder.id,
        reason: reversalError,
        metadata: { order_id: order.id, stripe_transfer_id: suborder.stripe_transfer_id },
      });
    }
  }

  // Same simplification as the admin refund route: compares this refund
  // against the order's total rather than tracking cumulative refunds
  // across multiple suborders, and never downgrades an order already fully
  // 'refunded'.
  if (order.status !== "refunded") {
    const isFullRefund = amountCents >= order.total_cents;
    await service
      .from("orders")
      .update({ status: isFullRefund ? "refunded" : "partially_refunded" })
      .eq("id", order.id);
  }

  await service.from("audit_log").insert({
    action: "suborder_unclaimed_refunded",
    target_table: "vendor_suborders",
    target_id: suborder.id,
    metadata: { stripe_refund_id: refund.id, amount_cents: amountCents, reversed, reversal_error: reversalError },
  });

  return { ok: true, refundId: refund.id, amountCents, reversed, reversalError };
}
