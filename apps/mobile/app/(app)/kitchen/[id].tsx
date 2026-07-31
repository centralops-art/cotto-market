import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { MessageThread } from "../../../src/components/message-thread";

const NEXT_ACTION: Record<string, { newStatus: string; label: string } | undefined> = {
  received: { newStatus: "confirmed", label: "Confirm order" },
  confirmed: { newStatus: "preparing", label: "Start preparing" },
  preparing: { newStatus: "ready", label: "Mark ready" },
};

export default function KitchenSuborderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const suborderQuery = useQuery({
    queryKey: ["kitchen_suborder_detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_suborders")
        .select("*, order_items(*)")
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
      const { data, error } = await supabase.functions.invoke("update-suborder-status", {
        body: { suborderId: id, newStatus },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["kitchen_suborder_detail", id] });
      queryClient.invalidateQueries({ queryKey: ["kitchen_suborders"] });
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
  const items = (suborder.order_items ?? []) as unknown as { id: string; name_snapshot: string; quantity: number; unit_price_cents: number }[];
  const nextAction = NEXT_ACTION[suborder.status];
  const canMarkReadyComplete = suborder.status === "ready" && suborder.fulfillment === "pickup";
  const canCancel = ["received", "confirmed", "preparing"].includes(suborder.status);

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 48, gap: 16 }}>
      <Pressable onPress={() => router.back()}>
        <Text className="text-white/60">&larr; Back</Text>
      </Pressable>

      <Text className="text-2xl font-bold text-white">{suborder.fulfillment === "pickup" ? "Pickup" : "Delivery"} order</Text>
      <Text className="text-white/60">Status: {suborder.status}</Text>

      {suborder.fulfillment === "pickup" && suborder.pickup_at && (
        <Text className="text-white/60">Pickup time: {new Date(suborder.pickup_at).toLocaleString()}</Text>
      )}
      {suborder.fulfillment === "delivery" && suborder.delivery_address && (
        <Text className="text-white/60">
          Delivering to: {(suborder.delivery_address as { line1: string; city: string; state: string; zip: string }).line1},{" "}
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

      {suborder.status === "ready" && suborder.fulfillment === "delivery" && (
        <Text className="rounded-lg bg-white/5 p-4 text-white/60">
          Order is ready and waiting in the delivery pool for a driver to claim it.
        </Text>
      )}

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
        {canMarkReadyComplete && (
          <Pressable
            className="items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
            disabled={transition.isPending}
            onPress={() => transition.mutate("completed")}
          >
            {transition.isPending ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Mark completed</Text>}
          </Pressable>
        )}
        {canCancel && (
          <Pressable
            className="items-center rounded-lg border border-red-400/50 py-3 disabled:opacity-50"
            disabled={transition.isPending}
            onPress={() => transition.mutate("cancelled")}
          >
            <Text className="text-red-400">Cancel order</Text>
          </Pressable>
        )}
      </View>

      {customerIdQuery.data && <MessageThread vendorSuborderId={id!} otherProfileId={customerIdQuery.data} />}
    </ScrollView>
  );
}
