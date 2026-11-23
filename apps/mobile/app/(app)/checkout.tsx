import { formatCents } from "@cotto/shared";
import { useStripe } from "@stripe/stripe-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../src/lib/auth-context";
import { formatDeliveryMiles, parseCheckoutBreakdownParam } from "../../src/lib/checkout-breakdown";
import { invokeFunction } from "../../src/lib/invoke-function";
import { setStripeAccount } from "../../src/lib/stripe-config";

type CompleteResult =
  | { status: "paid" | "processing" | "awaiting_payment" | "cancelled"; message?: string }
  | { status: "requires_action"; clientSecret: string; stripeAccountId: string }
  | { status: "failed"; message: string };

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className={bold ? "flex-1 font-bold text-white" : "flex-1 text-white/70"}>{label}</Text>
      <Text className={bold ? "font-bold text-white" : "text-white"}>{value}</Text>
    </View>
  );
}

/**
 * One kitchen's checkout under Stripe Direct charges (HANDOFF.md §39).
 *
 * pickup:   PaymentSheet pays the food directly on the cook's Stripe account.
 * delivery: PaymentSheet authorizes Cotto's delivery fee and saves the card;
 *           checkout-complete then charges the food on the cook's account
 *           with that card (3DS, if asked, runs against the cook's account).
 */
export default function Checkout() {
  const { mode, clientSecret, stripeAccountId, orderId, vendorName, breakdown: breakdownParam } = useLocalSearchParams<{
    mode: "pickup" | "delivery";
    clientSecret: string;
    stripeAccountId?: string;
    orderId: string;
    vendorName?: string;
    breakdown?: string;
  }>();
  const breakdown = useMemo(() => parseCheckoutBreakdownParam(breakdownParam), [breakdownParam]);
  const router = useRouter();
  const { profile } = useAuth();
  const { initPaymentSheet, presentPaymentSheet, handleNextAction } = useStripe();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isDelivery = mode === "delivery";
  const kitchenName = vendorName || breakdown?.vendors[0]?.vendorName || "the kitchen";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Pickup pays on the cook's account; delivery's PaymentSheet is on Cotto's.
      await setStripeAccount(isDelivery ? undefined : stripeAccountId);
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: isDelivery ? "Cotto" : kitchenName,
        paymentIntentClientSecret: clientSecret,
        defaultBillingDetails: profile?.full_name ? { name: profile.full_name } : undefined,
        // Delivery: the sheet's own amount is only the delivery-fee hold, so
        // label the button with the full total the customer will pay.
        primaryButtonLabel: isDelivery && breakdown ? `Pay ${formatCents(breakdown.totalCents)}` : undefined,
      });
      if (cancelled) return;
      if (initError) setError(initError.message);
      else setReady(true);
    })();
    return () => {
      cancelled = true;
      void setStripeAccount();
    };
  }, [clientSecret, stripeAccountId, isDelivery, kitchenName, breakdown, initPaymentSheet, profile?.full_name]);

  async function complete(): Promise<void> {
    // At most a couple of rounds: one optional 3DS step, then the final settle.
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await invokeFunction<CompleteResult>("checkout-complete", { orderId });
      if (result.status === "paid" || result.status === "processing") {
        router.replace({ pathname: "/(app)/order-confirmation", params: { orderId } });
        return;
      }
      if (result.status === "requires_action") {
        await setStripeAccount(result.stripeAccountId);
        const { error: actionError } = await handleNextAction(result.clientSecret);
        await setStripeAccount();
        if (actionError && actionError.code === "Canceled") {
          // Let the server see the abandoned verification and release the hold.
          await invokeFunction<CompleteResult>("checkout-complete", { orderId }).catch(() => null);
          throw new Error("Card verification was cancelled. Your card hasn't been charged.");
        }
        continue;
      }
      if (result.status === "failed") {
        throw new Error(`${result.message} Your card hasn't been charged.`);
      }
      if (result.status === "cancelled") {
        throw new Error("This checkout expired. Please go back to your cart and try again.");
      }
      // awaiting_payment right after PaymentSheet succeeded: Stripe hasn't
      // caught up yet. The confirmation screen keeps checking.
      router.replace({ pathname: "/(app)/order-confirmation", params: { orderId } });
      return;
    }
    router.replace({ pathname: "/(app)/order-confirmation", params: { orderId } });
  }

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== "Canceled") setError(presentError.message);
        return;
      }
      await complete();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const vendor = breakdown?.vendors[0];

  return (
    <ScrollView
      className="flex-1 bg-cotto-dark"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingVertical: 48, gap: 24 }}
    >
      <Text className="text-center text-2xl font-bold text-white">Review your order</Text>
      <Text className="text-center text-white/70">{kitchenName}</Text>

      {breakdown && vendor ? (
        <View className="gap-4 rounded-lg border border-white/10 p-4">
          <View className="gap-1">
            <Row label="Food subtotal" value={formatCents(vendor.subtotalCents)} />
            <Row label="Tax" value={formatCents(vendor.taxCents)} />
            {vendor.fulfillment === "delivery" ? (
              <Row
                label={
                  vendor.deliveryMiles === null ? "Delivery fee" : `Delivery fee (${formatDeliveryMiles(vendor.deliveryMiles)})`
                }
                value={formatCents(vendor.deliveryFeeCents)}
              />
            ) : (
              <Row label="Pickup" value="Free" />
            )}
          </View>
          <View className="h-px bg-white/10" />
          <Row label="Total" value={formatCents(breakdown.totalCents)} bold />
          {isDelivery && (
            <Text className="text-xs text-white/40">
              You'll see two charges on your card: {formatCents(vendor.subtotalCents + vendor.taxCents)} from {kitchenName}{" "}
              for your food, and {formatCents(vendor.deliveryFeeCents)} from Cotto for delivery.
            </Text>
          )}
        </View>
      ) : (
        <Text className="text-center text-white/60">Your total is shown on the next screen.</Text>
      )}

      {error && <Text className="text-center text-red-400">{error}</Text>}
      {!ready ? (
        <ActivityIndicator color="#D96A3E" />
      ) : (
        <Pressable
          className="w-full items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
          disabled={busy}
          onPress={pay}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-semibold text-white">
              {breakdown ? `Continue to payment · ${formatCents(breakdown.totalCents)}` : "Continue to payment"}
            </Text>
          )}
        </Pressable>
      )}
      <Pressable className="items-center" disabled={busy} onPress={() => router.back()}>
        <Text className="text-white/60">Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}
