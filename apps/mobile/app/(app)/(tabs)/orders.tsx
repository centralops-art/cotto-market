import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useAuth } from "../../../src/lib/auth-context";

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  claimed: "Driver assigned",
  en_route_to_pickup: "Driver en route",
  picked_up: "Picked up",
  en_route_to_customer: "Out for delivery",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export default function Orders() {
  const router = useRouter();
  const { profile } = useAuth();

  const ordersQuery = useQuery({
    queryKey: ["my_orders", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, total_cents, status, created_at, vendor_suborders(id, status, fulfillment, vendors(storefront_name))")
        .eq("customer_profile_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (ordersQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  const orders = ordersQuery.data ?? [];

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 48, gap: 16 }}>
      <Text className="text-2xl font-bold text-white">Orders</Text>

      {orders.length === 0 ? (
        <Text className="mt-6 text-white/60">You haven't placed an order yet.</Text>
      ) : (
        orders.map((order) => {
          const suborders = (order.vendor_suborders ?? []) as unknown as {
            id: string;
            status: string;
            fulfillment: string;
            vendors: { storefront_name: string } | null;
          }[];
          if (order.status === "pending_payment") return null;
          return (
            <View key={order.id} className="gap-2 rounded-lg bg-white/5 p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-white/40">{new Date(order.created_at).toLocaleDateString()}</Text>
                <Text className="text-sm text-white/60">${(order.total_cents / 100).toFixed(2)}</Text>
              </View>
              {suborders.map((so) => (
                <Pressable
                  key={so.id}
                  className="flex-row items-center justify-between rounded-md bg-white/5 p-3"
                  onPress={() => router.push({ pathname: "/(app)/order-tracking/[id]", params: { id: so.id } })}
                >
                  <View>
                    <Text className="font-semibold text-white">{so.vendors?.storefront_name ?? "Vendor"}</Text>
                    <Text className="text-xs text-white/50">{so.fulfillment === "pickup" ? "Pickup" : "Delivery"}</Text>
                  </View>
                  <View className="rounded-full bg-cotto-accent/20 px-3 py-1">
                    <Text className="text-xs font-semibold text-cotto-accent">{STATUS_LABELS[so.status] ?? so.status}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
