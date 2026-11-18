import { formatCents } from "@cotto/shared";
import { useStripe } from "@stripe/stripe-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../src/lib/auth-context";
import { formatDeliveryMiles, parseCheckoutBreakdownParam } from "../../src/lib/checkout-breakdown";

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row justify-between">
      <Text className={bold ? "font-bold text-white" : "text-white/70"}>{label}</Text>
      <Text className={bold ? "font-bold text-white" : "text-white"}>{value}</Text>
    </View>
  );
}

export default function Checkout() {
  const { clientSecret, orderId, breakdown: breakdownParam } = useLocalSearchParams<{
    clientSecret: string;
    orderId: string;
    breakdown?: string;
  }>();
  const breakdown = useMemo(() => parseCheckoutBreakdownParam(breakdownParam), [breakdownParam]);
  const router = useRouter();
  const { profile } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: "Cotto",
        paymentIntentClientSecret: clientSecret,
        defaultBillingDetails: profile?.full_name ? { name: profile.full_name } : undefined,
      });
      if (cancelled) return;
      if (initError) setError(initError.message);
      else setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientSecret, initPaymentSheet, profile?.full_name]);

  async function pay() {
    setPresenting(true);
    setError(null);
    const { error: presentError } = await presentPaymentSheet();
    setPresenting(false);
    if (presentError) {
      if (presentError.code !== "Canceled") setError(presentError.message);
      return;
    }
    router.replace({ pathname: "/(app)/order-confirmation", params: { orderId } });
  }

  const multiVendor = (breakdown?.vendors.length ?? 0) > 1;

  return (
    <ScrollView
      className="flex-1 bg-cotto-dark"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingVertical: 48, gap: 24 }}
    >
      <Text className="text-center text-2xl font-bold text-white">Review your order</Text>

      {breakdown ? (
        <View className="gap-4 rounded-lg border border-white/10 p-4">
          {breakdown.vendors.map((v) => (
            <View key={v.vendorId} className="gap-1">
              {multiVendor && <Text className="font-semibold text-white">{v.vendorName}</Text>}
              <Row label="Food subtotal" value={formatCents(v.subtotalCents)} />
              {v.fulfillment === "delivery" ? (
                <Row
                  label={
                    v.deliveryMiles === null ? "Delivery fee" : `Delivery fee (${formatDeliveryMiles(v.deliveryMiles)})`
                  }
                  value={formatCents(v.deliveryFeeCents)}
                />
              ) : (
                <Row label="Pickup" value="Free" />
              )}
              <Row label="Tax" value={formatCents(v.taxCents)} />
            </View>
          ))}
          <View className="h-px bg-white/10" />
          {multiVendor && (
            <View className="gap-1">
              <Row label="Food subtotal" value={formatCents(breakdown.subtotalCents)} />
              <Row label="Delivery fees" value={formatCents(breakdown.deliveryFeeCents)} />
              <Row label="Tax" value={formatCents(breakdown.taxCents)} />
            </View>
          )}
          <Row label="Total" value={formatCents(breakdown.totalCents)} bold />
          {multiVendor && breakdown.deliveryFeeCents > 0 && (
            <Text className="text-xs text-white/40">
              Each kitchen's order is delivered separately, so delivery is priced per kitchen.
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
          disabled={presenting}
          onPress={pay}
        >
          {presenting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-semibold text-white">
              {breakdown ? `Continue to payment · ${formatCents(breakdown.totalCents)}` : "Continue to payment"}
            </Text>
          )}
        </Pressable>
      )}
      <Pressable className="items-center" onPress={() => router.back()}>
        <Text className="text-white/60">Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}
