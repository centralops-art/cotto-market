import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { MessageThread } from "../../../src/components/message-thread";

const NEXT_ACTION: Record<string, { newStatus: string; label: string } | undefined> = {
  claimed: { newStatus: "en_route_to_pickup", label: "Heading to pickup" },
  en_route_to_pickup: { newStatus: "picked_up", label: "Picked up" },
  picked_up: { newStatus: "en_route_to_customer", label: "Out for delivery" },
  en_route_to_customer: { newStatus: "delivered", label: "Mark delivered" },
};

const STATUS_LABELS: Record<string, string> = {
  claimed: "Claimed",
  en_route_to_pickup: "Heading to pickup",
  picked_up: "Picked up",
  en_route_to_customer: "Out for delivery",
  delivered: "Delivered",
  completed: "Completed",
};

export default function DeliveryClaimDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const suborderQuery = useQuery({
    queryKey: ["delivery_claim_detail", id],
    enabled: !!id,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_suborders")
        .select("*, order_items(*), vendors(storefront_name, lat, lng)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const customerIdQuery = useQuery({
    queryKey: ["suborder_customer_id", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("suborder_customer_profile_id", { so_id: id! });
      if (error) throw error;
      return data as string | null;
    },
  });

  const transition = useMutation({
    mutationFn: async (newStatus: string) => {
      const { data, error } = await supabase.functions.invoke("update-delivery-status", {
        body: { suborderId: id, newStatus },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["delivery_claim_detail", id] });
      queryClient.invalidateQueries({ queryKey: ["delivery_claims_queue"] });
      queryClient.invalidateQueries({ queryKey: ["delivery_claims_history"] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const release = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("release_delivery_claim", { so_id: id!, reason: "driver cancelled" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery_pool"] });
      queryClient.invalidateQueries({ queryKey: ["delivery_claims_queue"] });
      router.back();
    },
    onError: (err) => setError((err as Error).message),
  });

  if (suborderQuery.isLoading || !suborderQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  const suborder = suborderQuery.data;
  const vendor = suborder.vendors as unknown as { storefront_name: string; lat: number | null; lng: number | null } | null;
  const items = (suborder.order_items ?? []) as unknown as { id: string; name_snapshot: string; quantity: number; unit_price_cents: number }[];
  const nextAction = NEXT_ACTION[suborder.status];
  const canRelease = ["claimed", "en_route_to_pickup"].includes(suborder.status);
  const headingToPickup = suborder.status === "claimed" || suborder.status === "en_route_to_pickup";
  const destination = headingToPickup
    ? { lat: vendor?.lat, lng: vendor?.lng, label: vendor?.storefront_name ?? "pickup" }
    : { lat: suborder.delivery_lat, lng: suborder.delivery_lng, label: "the customer" };

  function openInMaps() {
    if (destination.lat == null || destination.lng == null) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`);
  }

  function confirmRelease() {
    Alert.alert("Release this claim?", "This order will go back into the pool for another driver to claim.", [
      { text: "Cancel", style: "cancel" },
      { text: "Release", style: "destructive", onPress: () => release.mutate() },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 48, gap: 16 }}>
      <Pressable onPress={() => router.back()}>
        <Text className="text-white/60">&larr; Back</Text>
      </Pressable>

      <Text className="text-2xl font-bold text-white">{vendor?.storefront_name ?? "Delivery"}</Text>
      <Text className="text-white/60">Status: {STATUS_LABELS[suborder.status] ?? suborder.status}</Text>
      <Text className="text-white/60">
        ETA: {suborder.mapbox_eta_minutes != null ? `${suborder.mapbox_eta_minutes} min` : "Calculating..."}
      </Text>

      {suborder.delivery_address && (
        <Text className="text-white/60">
          Delivering to: {(suborder.delivery_address as { line1: string; city: string }).line1},{" "}
          {(suborder.delivery_address as { city: string }).city}
        </Text>
      )}
      {suborder.delivery_instructions && <Text className="text-white/60">Instructions: {suborder.delivery_instructions}</Text>}

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

      <Pressable className="items-center rounded-lg border border-white/20 py-3" onPress={openInMaps}>
        <Text className="text-white">Open in Maps ({destination.label})</Text>
      </Pressable>

      {error && <Text className="text-red-400">{error}</Text>}

      <View className="gap-2">
        {nextAction && (
          <Pressable
            className="items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
            disabled={transition.isPending}
            onPress={() => transition.mutate(nextAction.newStatus)}
          >
            {transition.isPending ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">{nextAction.label}</Text>}
          </Pressable>
        )}
        {canRelease && (
          <Pressable
            className="items-center rounded-lg border border-red-400/50 py-3 disabled:opacity-50"
            disabled={release.isPending}
            onPress={confirmRelease}
          >
            {release.isPending ? <ActivityIndicator color="#D96A3E" /> : <Text className="text-red-400">Release claim</Text>}
          </Pressable>
        )}
      </View>

      {customerIdQuery.data && <MessageThread vendorSuborderId={id!} otherProfileId={customerIdQuery.data} />}
    </ScrollView>
  );
}
