import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { MessageThread } from "../../../src/components/message-thread";

const PICKUP_STEPS = ["received", "confirmed", "preparing", "ready", "completed"];
const DELIVERY_STEPS = [
  "received",
  "confirmed",
  "preparing",
  "ready",
  "claimed",
  "en_route_to_pickup",
  "picked_up",
  "en_route_to_customer",
  "delivered",
  "completed",
];
const STEP_LABELS: Record<string, string> = {
  received: "Order received",
  confirmed: "Confirmed by vendor",
  preparing: "Preparing",
  ready: "Ready",
  claimed: "Driver assigned",
  en_route_to_pickup: "Driver heading to vendor",
  picked_up: "Driver picked up your order",
  en_route_to_customer: "Out for delivery",
  delivered: "Delivered",
  completed: "Completed",
};

export default function OrderTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const suborderQuery = useQuery({
    queryKey: ["order_tracking_detail", id],
    enabled: !!id,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_suborders")
        .select("*, order_items(*), vendors(storefront_name, owner_profile_id)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const driverNameQuery = useQuery({
    queryKey: ["suborder_driver_display_name", id],
    enabled: !!id,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("suborder_driver_display_name", { so_id: id! });
      if (error) throw error;
      return data as string | null;
    },
  });

  if (suborderQuery.isLoading || !suborderQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  const suborder = suborderQuery.data;
  const vendor = suborder.vendors as unknown as { storefront_name: string; owner_profile_id: string } | null;
  const items = (suborder.order_items ?? []) as unknown as { id: string; name_snapshot: string; quantity: number; unit_price_cents: number }[];
  const steps = suborder.fulfillment === "pickup" ? PICKUP_STEPS : DELIVERY_STEPS;
  const isTerminalIssue = suborder.status === "cancelled" || suborder.status === "refunded";
  const currentIndex = steps.indexOf(suborder.status);

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 48, gap: 16 }}>
      <Pressable onPress={() => router.back()}>
        <Text className="text-white/60">&larr; Back</Text>
      </Pressable>

      <Text className="text-2xl font-bold text-white">{vendor?.storefront_name ?? "Order"}</Text>
      <Text className="text-white/60">{suborder.fulfillment === "pickup" ? "Pickup" : "Delivery"} order</Text>
      {suborder.fulfillment === "delivery" && driverNameQuery.data && (
        <Text className="text-white/60">Driver: {driverNameQuery.data}</Text>
      )}

      {isTerminalIssue ? (
        <View className="rounded-lg bg-red-400/10 p-4">
          <Text className="font-semibold text-red-400">{suborder.status === "cancelled" ? "Order cancelled" : "Order refunded"}</Text>
        </View>
      ) : (
        <View className="gap-3 rounded-lg bg-white/5 p-4">
          {steps.map((step, i) => {
            const reached = i <= currentIndex;
            return (
              <View key={step} className="flex-row items-center gap-3">
                <View className={`h-3 w-3 rounded-full ${reached ? "bg-cotto-accent" : "bg-white/20"}`} />
                <Text className={reached ? "font-semibold text-white" : "text-white/40"}>{STEP_LABELS[step]}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View className="gap-2 rounded-lg bg-white/5 p-4">
        <Text className="font-semibold text-white">Items</Text>
        {items.map((item) => (
          <View key={item.id} className="flex-row justify-between">
            <Text className="text-white/80">
              {item.quantity}x {item.name_snapshot}
            </Text>
            <Text className="text-white/60">${((item.unit_price_cents * item.quantity) / 100).toFixed(2)}</Text>
          </View>
        ))}
      </View>

      {vendor?.owner_profile_id && <MessageThread vendorSuborderId={id!} otherProfileId={vendor.owner_profile_id} />}
    </ScrollView>
  );
}
