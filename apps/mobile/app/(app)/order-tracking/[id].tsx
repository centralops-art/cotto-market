import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
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
  const queryClient = useQueryClient();

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

  const existingReviewQuery = useQuery({
    queryKey: ["existing_review", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("reviews").select("id").eq("vendor_suborder_id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Phase 9: non-null once cron-unclaimed-delivery-check has sent the T2
  // pickup-or-refund offer for this suborder's current delivery_cycle and
  // nothing has resolved it yet (a claim, or an earlier choice) -- see
  // suborder_pending_customer_offer (migration 0044).
  const pendingOfferQuery = useQuery({
    queryKey: ["suborder_pending_customer_offer", id],
    enabled: !!id,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("suborder_pending_customer_offer", { so_id: id! });
      if (error) throw error;
      return data as string | null;
    },
  });

  const resolveOffer = useMutation({
    mutationFn: async (choice: "pickup" | "refund") => {
      const { data, error } = await supabase.functions.invoke("resolve-delivery-offer", { body: { suborderId: id, choice } });
      if (error) {
        // supabase-js's FunctionsHttpError.message is just "Edge Function
        // returned a non-2xx status code" -- the actual {error: "..."} body
        // resolve-delivery-offer sent back lives on error.context (the raw
        // Response), unread by default.
        const context = (error as { context?: Response }).context;
        const body = await context?.json().catch(() => null);
        throw new Error(body?.error ?? error.message);
      }
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["order_tracking_detail", id] }),
        queryClient.invalidateQueries({ queryKey: ["suborder_pending_customer_offer", id] }),
      ]);
    },
    onError: (err) => Alert.alert("Couldn't do that", (err as Error).message),
  });

  function confirmChoice(choice: "pickup" | "refund") {
    Alert.alert(
      choice === "pickup" ? "Switch to pickup?" : "Get a refund?",
      choice === "pickup"
        ? "No driver has claimed this delivery yet. We'll refund your delivery fee and set a pickup time about 15 minutes from now."
        : "No driver has claimed this delivery yet. We'll issue a full refund for this order.",
      [
        { text: "Cancel", style: "cancel" },
        { text: choice === "pickup" ? "Switch to pickup" : "Get refund", onPress: () => resolveOffer.mutate(choice) },
      ]
    );
  }

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
      {suborder.fulfillment === "delivery" && driverNameQuery.data && (
        <Text className="text-white/60">Driver: {driverNameQuery.data}</Text>
      )}

      {pendingOfferQuery.data && (
        <View className="gap-3 rounded-lg bg-amber-400/10 p-4">
          <Text className="font-semibold text-amber-400">No driver has claimed this delivery yet</Text>
          <Text className="text-sm text-white/70">
            You can switch to pickup (we'll refund the delivery fee) or get a full refund.
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              className="flex-1 items-center rounded-lg bg-cotto-accent py-2 disabled:opacity-50"
              disabled={resolveOffer.isPending}
              onPress={() => confirmChoice("pickup")}
            >
              <Text className="font-semibold text-white">Switch to pickup</Text>
            </Pressable>
            <Pressable
              className="flex-1 items-center rounded-lg border border-white/20 py-2 disabled:opacity-50"
              disabled={resolveOffer.isPending}
              onPress={() => confirmChoice("refund")}
            >
              <Text className="font-semibold text-white">Get a refund</Text>
            </Pressable>
          </View>
        </View>
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

      {suborder.status === "completed" && !existingReviewQuery.data && (
        <Pressable
          className="items-center rounded-lg bg-cotto-accent py-3"
          onPress={() => router.push({ pathname: "/(app)/review/[id]", params: { id: id! } })}
        >
          <Text className="font-semibold text-white">Leave a review</Text>
        </Pressable>
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
