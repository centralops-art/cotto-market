// Direct charges checkout settlement (HANDOFF.md §39 step 4).
//
// A direct-charge order has exactly one suborder:
//   - food PaymentIntent on the cook's connected account
//     (vendor_suborders.stripe_payment_intent_id, account = stripe_account_id)
//   - delivery orders only: a manual-capture PaymentIntent on the platform
//     for the delivery fee (vendor_suborders.delivery_payment_intent_id).
//
// settleDirectOrder moves an order forward as far as Stripe's current state
// allows and is safe to call any number of times, from any caller
// (checkout-complete, cron-direct-checkout-cleanup, and the webhooks in
// step 5):
//   - delivery authorized + no food charge yet -> clone the card to the
//     cook's account and charge the food (only when allowCharge)
//   - food succeeded -> capture the delivery authorization, mark paid
//   - food failed after a delivery authorization -> cancel everything
// The customer is never charged for delivery without food.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type Stripe from "npm:stripe@17";
import { recordTaxTransaction } from "./stripe-tax.ts";

export type SettleResult =
  | { status: "paid" }
  | { status: "cancelled"; message?: string }
  | { status: "awaiting_payment" }
  | { status: "processing" }
  | { status: "requires_action"; clientSecret: string; stripeAccountId: string }
  | { status: "failed"; message: string };

interface DirectSuborder {
  id: string;
  order_id: string;
  vendor_id: string;
  fulfillment: "pickup" | "delivery";
  charge_model: string;
  stripe_account_id: string | null;
  stripe_payment_intent_id: string | null;
  delivery_payment_intent_id: string | null;
  subtotal_cents: number;
  tax_cents: number;
  platform_fee_cents: number;
  vendor_payout_cents: number;
  stripe_tax_calculation_id: string | null;
  stripe_tax_transaction_id: string | null;
}

const SUBORDER_COLUMNS =
  "id, order_id, vendor_id, fulfillment, charge_model, stripe_account_id, stripe_payment_intent_id, delivery_payment_intent_id, subtotal_cents, tax_cents, platform_fee_cents, vendor_payout_cents, stripe_tax_calculation_id, stripe_tax_transaction_id";

async function audit(service: SupabaseClient, action: string, orderId: string, reason: string, metadata: Record<string, unknown> = {}) {
  await service.from("audit_log").insert({ action, target_table: "orders", target_id: orderId, reason, metadata });
}

async function loadOrder(service: SupabaseClient, orderId: string) {
  const { data: order, error } = await service
    .from("orders")
    .select("id, status, cart_id, customer_profile_id, total_cents, created_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;
  const { data: suborders, error: subError } = await service.from("vendor_suborders").select(SUBORDER_COLUMNS).eq("order_id", orderId);
  if (subError) throw subError;
  const suborder = (suborders ?? [])[0] as DirectSuborder | undefined;
  if (!suborder || suborders!.length !== 1 || suborder.charge_model !== "direct" || !suborder.stripe_account_id) {
    throw new Error(`Order ${orderId} is not a direct-charge order`);
  }
  return { order, suborder };
}

// Cancels whatever is still cancelable and marks the order cancelled. Only
// acts on a pending order; a paid order is left alone.
export async function cancelDirectOrder(
  service: SupabaseClient,
  stripe: Stripe,
  orderId: string,
  reason: string
): Promise<void> {
  const loaded = await loadOrder(service, orderId);
  if (!loaded || loaded.order.status !== "pending_payment") return;
  const { suborder } = loaded;

  if (suborder.stripe_payment_intent_id) {
    try {
      const food = await stripe.paymentIntents.retrieve(suborder.stripe_payment_intent_id, {}, { stripeAccount: suborder.stripe_account_id! });
      if (food.status === "succeeded") {
        // Food was charged after all -- never cancel a paid order. Let the
        // next settle pass finish it.
        throw new Error("Food charge succeeded; settle instead of cancel");
      }
      if (food.status !== "canceled") {
        await stripe.paymentIntents.cancel(food.id, {}, { stripeAccount: suborder.stripe_account_id! });
      }
    } catch (err) {
      if ((err as Error).message.startsWith("Food charge succeeded")) throw err;
      await audit(service, "direct_food_cancel_failed", orderId, (err as Error).message);
    }
  }
  if (suborder.delivery_payment_intent_id) {
    try {
      const delivery = await stripe.paymentIntents.retrieve(suborder.delivery_payment_intent_id);
      if (delivery.status !== "canceled" && delivery.status !== "succeeded") {
        await stripe.paymentIntents.cancel(delivery.id);
      }
    } catch (err) {
      await audit(service, "direct_delivery_cancel_failed", orderId, (err as Error).message);
    }
  }

  const { data: cancelled } = await service
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("status", "pending_payment")
    .select("id");
  if (cancelled && cancelled.length > 0) {
    await service.from("vendor_suborders").update({ status: "cancelled" }).eq("order_id", orderId);
    await audit(service, "direct_checkout_cancelled", orderId, reason);
  }
}

export async function settleDirectOrder(
  service: SupabaseClient,
  stripe: Stripe,
  orderId: string,
  opts: { allowCharge: boolean }
): Promise<SettleResult> {
  const loaded = await loadOrder(service, orderId);
  if (!loaded) throw new Error(`Order ${orderId} not found`);
  const { order, suborder } = loaded;
  if (order.status === "paid") return { status: "paid" };
  if (order.status !== "pending_payment") return { status: "cancelled" };

  const stripeAccount = suborder.stripe_account_id!;
  const isDelivery = suborder.fulfillment === "delivery";

  // 1. Delivery orders: the customer must have authorized the delivery fee
  //    (PaymentSheet on the platform) before the food is charged.
  let deliveryPi: Stripe.PaymentIntent | null = null;
  if (isDelivery) {
    if (!suborder.delivery_payment_intent_id) throw new Error(`Order ${orderId} has no delivery PaymentIntent`);
    deliveryPi = await stripe.paymentIntents.retrieve(suborder.delivery_payment_intent_id);
    if (deliveryPi.status === "canceled") {
      await cancelDirectOrder(service, stripe, orderId, "delivery authorization canceled");
      return { status: "cancelled" };
    }
    if (deliveryPi.status !== "requires_capture" && deliveryPi.status !== "succeeded") {
      return deliveryPi.status === "processing" ? { status: "processing" } : { status: "awaiting_payment" };
    }
  }

  // 2. Food charge on the cook's account.
  let foodPi: Stripe.PaymentIntent;
  if (suborder.stripe_payment_intent_id) {
    foodPi = await stripe.paymentIntents.retrieve(suborder.stripe_payment_intent_id, {}, { stripeAccount });
  } else {
    // Only delivery orders get here: pickup creates the food PI at checkout.
    if (!isDelivery || !deliveryPi) throw new Error(`Order ${orderId} has no food PaymentIntent`);
    if (!opts.allowCharge) return { status: "awaiting_payment" };

    const paymentMethodId =
      typeof deliveryPi.payment_method === "string" ? deliveryPi.payment_method : deliveryPi.payment_method?.id;
    const customerId = typeof deliveryPi.customer === "string" ? deliveryPi.customer : deliveryPi.customer?.id;
    if (!paymentMethodId || !customerId) throw new Error(`Delivery PaymentIntent for ${orderId} has no saved card`);

    // Clone the platform customer's saved card onto the cook's account.
    const cloned = await stripe.paymentMethods.create(
      { customer: customerId, payment_method: paymentMethodId },
      { stripeAccount, idempotencyKey: `clone-pm-${suborder.id}` }
    );
    try {
      foodPi = await stripe.paymentIntents.create(
        {
          amount: suborder.subtotal_cents + suborder.tax_cents,
          currency: "usd",
          payment_method: cloned.id,
          payment_method_types: ["card"],
          confirm: true,
          // 3DS on a server-confirmed charge is finished by the app's
          // handleNextAction (with the cook's stripeAccountId).
          use_stripe_sdk: true,
          application_fee_amount: suborder.platform_fee_cents,
          metadata: { order_id: orderId, vendor_suborder_id: suborder.id, charge_model: "direct", kind: "food" },
          description: `Cotto order ${orderId}`,
        },
        { stripeAccount, idempotencyKey: `food-pi-${suborder.id}` }
      );
    } catch (err) {
      // A decline on confirm throws; the PaymentIntent still exists.
      const stripeErr = err as Stripe.errors.StripeError;
      const failedPi = (stripeErr.raw as { payment_intent?: Stripe.PaymentIntent } | undefined)?.payment_intent;
      if (failedPi?.id) {
        await service.from("vendor_suborders").update({ stripe_payment_intent_id: failedPi.id }).eq("id", suborder.id);
      }
      await cancelDirectOrder(service, stripe, orderId, `food charge failed: ${stripeErr.message}`);
      return { status: "failed", message: stripeErr.message ?? "Your card was declined." };
    }
    await service.from("vendor_suborders").update({ stripe_payment_intent_id: foodPi.id }).eq("id", suborder.id);
  }

  switch (foodPi.status) {
    case "succeeded":
      break;
    case "requires_action":
      return { status: "requires_action", clientSecret: foodPi.client_secret!, stripeAccountId: stripeAccount };
    case "processing":
      return { status: "processing" };
    case "canceled":
      await cancelDirectOrder(service, stripe, orderId, "food PaymentIntent canceled");
      return { status: "cancelled" };
    default:
      // requires_payment_method / requires_confirmation.
      if (isDelivery) {
        // The server confirmed this charge, so this means it failed (e.g.
        // 3DS was abandoned or failed). Release the delivery authorization.
        const message = foodPi.last_payment_error?.message ?? "Your card couldn't be charged.";
        await cancelDirectOrder(service, stripe, orderId, `food charge failed: ${message}`);
        return { status: "failed", message };
      }
      // Pickup: the customer hasn't finished PaymentSheet yet.
      return { status: "awaiting_payment" };
  }

  // 3. Food succeeded: capture the delivery authorization.
  if (deliveryPi && deliveryPi.status === "requires_capture") {
    try {
      await stripe.paymentIntents.capture(deliveryPi.id, {}, { idempotencyKey: `capture-delivery-${suborder.id}` });
    } catch (err) {
      // The food is already charged, so the order goes ahead regardless;
      // flag the uncollected delivery fee for manual follow-up.
      await audit(service, "direct_delivery_capture_failed", orderId, (err as Error).message, {
        delivery_payment_intent_id: deliveryPi.id,
      });
    }
  }

  await finalizeDirectOrder(service, stripe, order, suborder, foodPi);
  return { status: "paid" };
}

// Marks the order paid and does the one-time side effects. The conditional
// update makes exactly one caller the winner, so tax recording, cart cleanup
// and emails happen once even if several callers settle at the same time.
async function finalizeDirectOrder(
  service: SupabaseClient,
  stripe: Stripe,
  order: { id: string; cart_id: string | null; customer_profile_id: string; total_cents: number },
  suborder: DirectSuborder,
  foodPi: Stripe.PaymentIntent
): Promise<void> {
  const { data: won, error } = await service
    .from("orders")
    .update({ status: "paid" })
    .eq("id", order.id)
    .eq("status", "pending_payment")
    .select("id");
  if (error) throw error;
  if (!won || won.length === 0) return;

  const stripeAccount = suborder.stripe_account_id!;

  await recordTaxTransaction(service, stripe, suborder);

  // Application fee id, for refunds with refund_application_fee (step 6).
  try {
    const chargeId = typeof foodPi.latest_charge === "string" ? foodPi.latest_charge : foodPi.latest_charge?.id;
    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId, {}, { stripeAccount });
      const feeId = typeof charge.application_fee === "string" ? charge.application_fee : charge.application_fee?.id;
      if (feeId) await service.from("vendor_suborders").update({ stripe_application_fee_id: feeId }).eq("id", suborder.id);
    }
  } catch (err) {
    await audit(service, "direct_application_fee_lookup_failed", order.id, (err as Error).message);
  }

  // Only this kitchen's items leave the cart; the cart is checked out once
  // it's empty.
  if (order.cart_id) {
    await service.from("cart_items").delete().eq("cart_id", order.cart_id).eq("vendor_id", suborder.vendor_id);
    const { count } = await service.from("cart_items").select("id", { count: "exact", head: true }).eq("cart_id", order.cart_id);
    if ((count ?? 0) === 0) {
      await service.from("carts").update({ status: "checked_out" }).eq("id", order.cart_id);
    }
  }

  await sendConfirmationEmails(service, order, suborder);
}

async function sendConfirmationEmails(
  service: SupabaseClient,
  order: { id: string; customer_profile_id: string; total_cents: number },
  suborder: DirectSuborder
) {
  // Best-effort, same as stripe-webhook: failures go to audit_log.
  async function sendEmail(to: string, subject: string, text: string) {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "Cotto <notifications@cottomarket.com>", to, subject, text }),
      });
      if (!res.ok) throw new Error(`Resend API error (${res.status}): ${await res.text()}`);
    } catch (emailErr) {
      await audit(service, "checkout_email_failed", order.id, (emailErr as Error).message, { to });
    }
  }

  const { data: customerAuth } = await service.auth.admin.getUserById(order.customer_profile_id);
  const customerEmail = customerAuth?.user?.email;
  if (customerEmail) {
    await sendEmail(
      customerEmail,
      "Your Cotto order is confirmed",
      `Thanks for your order! Total: $${(order.total_cents / 100).toFixed(2)}.\n\nYou'll hear from the kitchen as they prepare your food.`
    );
  }
  const { data: vendor } = await service.from("vendors").select("email, storefront_name").eq("id", suborder.vendor_id).maybeSingle();
  if (vendor?.email) {
    await sendEmail(
      vendor.email,
      "You have a new Cotto order",
      `${vendor.storefront_name}, you have a new order for $${(suborder.vendor_payout_cents / 100).toFixed(2)} (after platform fee, before Stripe's processing fee). Open the app to confirm it.`
    );
  }
}
