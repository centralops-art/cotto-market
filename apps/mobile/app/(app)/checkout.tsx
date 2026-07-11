import { useStripe } from "@stripe/stripe-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useAuth } from "../../src/lib/auth-context";

export default function Checkout() {
  const { clientSecret, orderId } = useLocalSearchParams<{ clientSecret: string; orderId: string }>();
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

  return (
    <View className="flex-1 items-center justify-center gap-6 bg-cotto-dark px-6">
      <Text className="text-2xl font-bold text-white">Checkout</Text>
      {error && <Text className="text-center text-red-400">{error}</Text>}
      {!ready ? (
        <ActivityIndicator color="#D96A3E" />
      ) : (
        <Pressable
          className="w-full items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
          disabled={presenting}
          onPress={pay}
        >
          {presenting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Pay now</Text>}
        </Pressable>
      )}
      <Pressable onPress={() => router.back()}>
        <Text className="text-white/60">Cancel</Text>
      </Pressable>
    </View>
  );
}
