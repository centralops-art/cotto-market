import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useAuth } from "../../../src/lib/auth-context";

const STATUS_LABELS: Record<string, string> = {
  received: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  claimed: "Claimed by driver",
  en_route_to_pickup: "Driver en route to you",
  picked_up: "Picked up by driver",
  en_route_to_customer: "Out for delivery",
  delivered: "Delivered",
};

export default function Kitchen() {
  const router = useRouter();
  const { session } = useAuth();

  // Distinct key from ["vendor", ...] (account.tsx/use-vendor.ts select the
  // full row) -- sharing a key across different `select()` shapes previously
  // caused a cache-collision bug in this codebase (see HANDOFF §9).
  const vendorQuery = useQuery({
    queryKey: ["vendor_for_kitchen", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, storefront_name").eq("owner_profile_id", session!.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const suborderQuery = useQuery({
    queryKey: ["kitchen_suborders", vendorQuery.data?.id],
    enabled: !!vendorQuery.data,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_suborders")
        .select("id, status, fulfillment, pickup_at, created_at, order_items(id)")
        .eq("vendor_id", vendorQuery.data!.id)
        .not("status", "in", "(completed,cancelled,refunded)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  if (vendorQuery.isLoading || suborderQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  const suborders = suborderQuery.data ?? [];

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 48, gap: 12 }}>
      <Text className="text-2xl font-bold text-white">Kitchen</Text>
      <Text className="text-sm text-white/60">Open orders, oldest first.</Text>

      {suborders.length === 0 ? (
        <Text className="mt-6 text-white/60">No open orders right now.</Text>
      ) : (
        suborders.map((so) => {
          const itemCount = (so.order_items as unknown as { id: string }[]).length;
          return (
            <Pressable
              key={so.id}
              className="gap-1 rounded-lg bg-white/5 p-4"
              onPress={() => router.push({ pathname: "/(app)/kitchen/[id]", params: { id: so.id } })}
            >
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold text-white">{so.fulfillment === "pickup" ? "Pickup" : "Delivery"} order</Text>
                <View className="rounded-full bg-cotto-accent/20 px-3 py-1">
                  <Text className="text-xs font-semibold text-cotto-accent">{STATUS_LABELS[so.status] ?? so.status}</Text>
                </View>
              </View>
              <Text className="text-sm text-white/60">
                {itemCount} item{itemCount === 1 ? "" : "s"}
                {so.fulfillment === "pickup" && so.pickup_at ? ` · Pickup ${new Date(so.pickup_at).toLocaleString()}` : ""}
              </Text>
              <Text className="text-xs text-white/40">Received {new Date(so.created_at).toLocaleString()}</Text>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
