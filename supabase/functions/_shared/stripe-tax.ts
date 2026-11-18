// Records collected sales tax with Stripe Tax, and reverses it on refund.
// See migration 0061 for why: a tax calculation alone is never reported or
// filed by Stripe -- only a tax transaction is.
//
// Both helpers are best-effort, like the vendor Transfers in stripe-webhook:
// a failure is written to audit_log for manual follow-up and never blocks
// the payment or refund it belongs to.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type Stripe from "npm:stripe@17";

// Called once payment has succeeded. Idempotent per suborder: the Stripe
// idempotency key and the unique `reference` both stop a second
// transaction for the same suborder.
export async function recordTaxTransaction(
  service: SupabaseClient,
  stripe: Stripe,
  suborder: { id: string; order_id: string; stripe_tax_calculation_id: string | null; stripe_tax_transaction_id: string | null }
): Promise<void> {
  // Orders checked out before 0061 have no calculation id to record from.
  if (!suborder.stripe_tax_calculation_id || suborder.stripe_tax_transaction_id) return;
  try {
    const transaction = await stripe.tax.transactions.createFromCalculation(
      {
        calculation: suborder.stripe_tax_calculation_id,
        reference: `suborder-${suborder.id}`,
        metadata: { order_id: suborder.order_id, vendor_suborder_id: suborder.id },
      },
      { idempotencyKey: `tax-transaction-${suborder.id}` }
    );
    await service.from("vendor_suborders").update({ stripe_tax_transaction_id: transaction.id }).eq("id", suborder.id);
  } catch (err) {
    await service.from("audit_log").insert({
      action: "tax_transaction_failed",
      target_table: "vendor_suborders",
      target_id: suborder.id,
      reason: (err as Error).message,
      metadata: { order_id: suborder.order_id, stripe_tax_calculation_id: suborder.stripe_tax_calculation_id },
    });
  }
}

// Fully reverses one suborder's tax transaction. Only for a refund of that
// suborder's whole food subtotal plus its tax -- a refund of the delivery
// fee alone (untaxed) needs no reversal.
export async function reverseTaxTransaction(
  service: SupabaseClient,
  stripe: Stripe,
  suborder: { id: string; order_id: string; stripe_tax_transaction_id: string | null; stripe_tax_reversal_id: string | null }
): Promise<void> {
  if (!suborder.stripe_tax_transaction_id || suborder.stripe_tax_reversal_id) return;
  try {
    const reversal = await stripe.tax.transactions.createReversal(
      {
        mode: "full",
        original_transaction: suborder.stripe_tax_transaction_id,
        reference: `suborder-${suborder.id}-refund`,
        metadata: { order_id: suborder.order_id, vendor_suborder_id: suborder.id },
      },
      { idempotencyKey: `tax-reversal-${suborder.id}` }
    );
    await service.from("vendor_suborders").update({ stripe_tax_reversal_id: reversal.id }).eq("id", suborder.id);
  } catch (err) {
    await service.from("audit_log").insert({
      action: "tax_reversal_failed",
      target_table: "vendor_suborders",
      target_id: suborder.id,
      reason: (err as Error).message,
      metadata: { order_id: suborder.order_id, stripe_tax_transaction_id: suborder.stripe_tax_transaction_id },
    });
  }
}
