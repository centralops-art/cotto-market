import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../../src/lib/supabase";

export default function OrderConfirmation() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();

  const orderQuery = useQuery({
    queryKey: ["order_confirmation", orderId],
    enabled: !!orderId,
    // Payment succeeded client-side already -- this polls briefly until the
    // stripe-webhook has flipped the order to 'paid' (fires per-vendor
    // Transfers + emails), which is normally near-instant but is a separate
    // async step from the PaymentSheet's own success callback.
    refetchInterval: (query) => (query.state.data?.status === "paid" ? false : 1500),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, vendor_suborders(*, vendors(storefront_name))")
        .eq("id", orderId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const order = orderQuery.data;
  const suborders = (order?.vendor_suborders ?? []) as unknown as {
    id: string;
    fulfillment: string;
    pickup_at: string | null;
    vendors: { storefront_name: string } | null;
  }[];

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 16, flexGrow: 1 }}>
      <Text className="text-center text-3xl font-bold text-cotto-accent">
        {order?.status === "paid" ? "Order confirmed!" : "Confirming your order..."}
      </Text>

      {!order ? (
        <ActivityIndicator color="#D96A3E" />
      ) : (
        <>
          <Text className="text-center text-white/70">
            {order.status === "paid"
              ? "Thanks for your order -- you'll hear from each vendor as they prepare it."
              : "Your payment went through. We're wrapping up the order details now."}
          </Text>

          <View className="mt-4 gap-3">
            {suborders.map((suborder) => (
              <View key={suborder.id} className="rounded-lg bg-white/5 p-4">
                <Text className="font-semibold text-white">{suborder.vendors?.storefront_name ?? "Vendor"}</Text>
                <Text className="text-sm text-white/60">
                  {suborder.fulfillment === "pickup"
                    ? `Pickup${suborder.pickup_at ? " at " + new Date(suborder.pickup_at).toLocaleString() : ""}`
                    : "Delivery"}
                </Text>
              </View>
            ))}
          </View>

          <View className="mt-4 flex-row justify-between border-t border-white/10 pt-4">
            <Text className="text-white/70">Total charged</Text>
            <Text className="font-semibold text-white">${(order.total_cents / 100).toFixed(2)}</Text>
          </View>
        </>
      )}

      <Pressable
        className="mt-8 items-center rounded-lg bg-cotto-accent py-3"
        onPress={() => router.replace("/(app)/(tabs)")}
      >
        <Text className="font-semibold text-white">Continue browsing</Text>
      </Pressable>
    </ScrollView>
  );
}
