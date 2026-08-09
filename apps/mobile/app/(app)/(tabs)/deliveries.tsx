import { calculateDeliverySplit, formatCents } from "@cotto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import * as Location from "expo-location";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Switch, Text, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useAuth } from "../../../src/lib/auth-context";
import { haversineMiles } from "../../../src/lib/geo";

type Coords = { lat: number; lng: number };
type LocationStatus = "idle" | "requesting" | "granted" | "denied";
type Tab = "available" | "queue" | "history";

const LOCATION_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Location request timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

const QUEUE_STATUS_LABELS: Record<string, string> = {
  claimed: "Claimed",
  en_route_to_pickup: "Heading to pickup",
  picked_up: "Picked up",
  en_route_to_customer: "Out for delivery",
};

export default function Deliveries() {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [tab, setTab] = useState<Tab>("available");

  // Distinct key from ["vendor", ...] / ["vendor_for_kitchen", ...] -- see
  // this codebase's query-key-per-select-shape rule (HANDOFF §9 bug #1).
  const vendorQuery = useQuery({
    queryKey: ["vendor_for_deliveries", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, storefront_name, region_id, regions(name, delivery_payout_split_pct, delivery_conflict_rule)")
        .eq("owner_profile_id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const vendor = vendorQuery.data;
  const splitPct = vendor?.regions?.delivery_payout_split_pct ?? 80;
  const conflictRule = vendor?.regions?.delivery_conflict_rule ?? "soft_warning";

  const profileQuery = useQuery({
    queryKey: ["delivery_profile_for_deliveries", vendor?.id],
    enabled: !!vendor,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_delivery_profiles")
        .select("id, on_duty")
        .eq("vendor_id", vendor!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const profile = profileQuery.data;

  const toggleOnDuty = useMutation({
    mutationFn: async (value: boolean) => {
      if (!profile) return;
      const { error } = await supabase.from("vendor_delivery_profiles").update({ on_duty: value }).eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["delivery_profile_for_deliveries", vendor?.id] });
      await queryClient.invalidateQueries({ queryKey: ["delivery_pool", vendor?.id] });
    },
  });

  // Used only to decide the claim confirm-dialog's copy (and, for hard_block
  // regions, whether to attempt the claim at all) -- own query key, not
  // shared with kitchen.tsx's own suborder queries.
  const openKitchenOrdersQuery = useQuery({
    queryKey: ["driver_open_kitchen_orders", vendor?.id],
    enabled: !!vendor,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("vendor_suborders")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", vendor!.id)
        .in("status", ["received", "confirmed", "preparing"]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const requestLocation = useCallback(async () => {
    setLocationStatus("requesting");
    try {
      // App-level permission can stay "granted" even after the user turns
      // system Location Services off entirely -- check that separately, or
      // getCurrentPositionAsync below hangs/rejects on some devices without
      // ever surfacing a usable state.
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setLocationStatus("denied");
        return;
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationStatus("denied");
        return;
      }
      const position = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        LOCATION_TIMEOUT_MS
      );
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      setLocationStatus("granted");
    } catch {
      // Any failure here (permission revoked mid-flight, services disabled,
      // the OS prompt dismissed, a timeout) should land on the same visible
      // "location required" state with a retry button -- never leave the
      // screen stuck on the loading spinner indefinitely.
      setLocationStatus("denied");
    }
  }, []);

  // GPS is read once per focus/pull-to-refresh, not on every 10s poll tick --
  // re-acquiring GPS that often is unnecessary battery drain for a list
  // screen. Only the pool query itself polls every 10s, reusing the last
  // coordinate for distance math.
  useFocusEffect(
    useCallback(() => {
      requestLocation();
    }, [requestLocation])
  );

  const poolQuery = useQuery({
    queryKey: ["delivery_pool", vendor?.id],
    enabled: !!vendor && locationStatus === "granted" && tab === "available",
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_suborders")
        .select("id, delivery_fee_cents, delivery_lat, delivery_lng, ready_at, vendors(storefront_name, lat, lng)")
        .eq("fulfillment", "delivery")
        .eq("status", "ready");
      if (error) throw error;

      // RLS (can_view_pool_suborder) is the actual security boundary here --
      // this select already only returns rows the caller is eligible for.
      const withNames = await Promise.all(
        (data ?? []).map(async (row) => {
          const { data: firstName } = await supabase.rpc("pool_suborder_customer_first_name", { so_id: row.id });
          return { ...row, customerFirstName: firstName as string | null };
        })
      );
      return withNames;
    },
  });

  const queueQuery = useQuery({
    queryKey: ["delivery_claims_queue", vendor?.id],
    enabled: !!vendor && tab === "queue",
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_claims")
        .select("id, vendor_suborder_id, claimed_at, vendor_suborders(id, status, vendors(storefront_name))")
        .eq("driver_vendor_id", vendor!.id)
        .is("released_at", null)
        .order("claimed_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const historyQuery = useQuery({
    queryKey: ["delivery_claims_history", vendor?.id],
    enabled: !!vendor && tab === "history",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_claims")
        .select(
          "id, vendor_suborder_id, claimed_at, delivered_at, released_at, driver_payout_cents, vendor_suborders(id, status, vendors(storefront_name))"
        )
        .eq("driver_vendor_id", vendor!.id)
        .order("claimed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const claim = useMutation({
    mutationFn: async (suborderId: string) => {
      const { data, error } = await supabase.rpc("claim_delivery", { so_id: suborderId });
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, suborderId) => {
      await queryClient.invalidateQueries({ queryKey: ["delivery_pool", vendor?.id] });
      await queryClient.invalidateQueries({ queryKey: ["delivery_claims_queue", vendor?.id] });
      // Best-effort -- keeps the claim's critical path free of an external
      // HTTP call. ETA shows "Calculating..." on the detail screen until
      // this lands.
      supabase.functions.invoke("compute-delivery-eta", { body: { suborderId } }).catch(() => {});
      router.push({ pathname: "/(app)/deliveries/[id]", params: { id: suborderId } });
    },
    onError: (err) => Alert.alert("Couldn't claim this order", (err as Error).message),
  });

  function confirmAndClaim(suborderId: string) {
    const openCount = openKitchenOrdersQuery.data ?? 0;
    if (openCount === 0) {
      claim.mutate(suborderId);
      return;
    }
    const regionName = vendor?.regions?.name ?? "This region";
    const plural = openCount === 1 ? "order" : "orders";
    if (conflictRule === "hard_block") {
      Alert.alert(
        "Finish your kitchen orders first",
        `You have ${openCount} ${plural} still in your kitchen queue. ${regionName} requires you to finish those before claiming a delivery.`
      );
      return;
    }
    Alert.alert(
      "Claim this delivery?",
      `You still have ${openCount} ${plural} in your own kitchen queue. Claiming this delivery won't block you from finishing them, but juggling both may slow you down.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Claim", onPress: () => claim.mutate(suborderId) },
      ]
    );
  }

  async function onRefresh() {
    await Promise.all([requestLocation(), poolQuery.refetch()]);
  }

  const cards = (poolQuery.data ?? [])
    .map((row) => {
      const pickupVendor = row.vendors as unknown as { storefront_name: string; lat: number | null; lng: number | null } | null;
      const distanceToPickup =
        coords && pickupVendor?.lat != null && pickupVendor?.lng != null
          ? haversineMiles(coords, { lat: pickupVendor.lat, lng: pickupVendor.lng })
          : null;
      const distancePickupToDropoff =
        pickupVendor?.lat != null && pickupVendor?.lng != null && row.delivery_lat != null && row.delivery_lng != null
          ? haversineMiles({ lat: pickupVendor.lat, lng: pickupVendor.lng }, { lat: row.delivery_lat, lng: row.delivery_lng })
          : null;
      const { driverPayoutCents } = calculateDeliverySplit(row.delivery_fee_cents, splitPct);
      return {
        id: row.id,
        vendorName: pickupVendor?.storefront_name ?? "Unknown vendor",
        distanceToPickup,
        distancePickupToDropoff,
        payoutCents: driverPayoutCents,
        customerFirstName: row.customerFirstName,
      };
    })
    .sort((a, b) => (a.distanceToPickup ?? Infinity) - (b.distanceToPickup ?? Infinity));

  if (vendorQuery.isLoading || profileQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-cotto-dark"
      contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 48, gap: 12 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#D96A3E" />}
    >
      <Text className="text-2xl font-bold text-white">Deliveries</Text>

      <View className="flex-row items-center justify-between rounded-lg bg-white/5 p-4">
        <View>
          <Text className="font-semibold text-white">Delivery Mode</Text>
          <Text className="text-sm text-white/60">{profile?.on_duty ? "On -- visible in the pool" : "Off"}</Text>
        </View>
        <Switch
          value={profile?.on_duty ?? false}
          disabled={!profile || toggleOnDuty.isPending}
          onValueChange={(value) => toggleOnDuty.mutate(value)}
        />
      </View>

      <View className="flex-row gap-2">
        {(["available", "queue", "history"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            className={`rounded-full border px-3 py-1.5 ${tab === t ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
            onPress={() => setTab(t)}
          >
            <Text className={tab === t ? "text-cotto-accent" : "text-white/70"}>
              {t === "available" ? "Available" : t === "queue" ? "My Queue" : "History"}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "available" &&
        (locationStatus === "denied" ? (
          <View className="mt-6 items-center gap-3 rounded-lg bg-white/5 p-6">
            <Text className="text-center text-white/70">
              Location access is required to see distances in the delivery pool. Make sure Location Services are
              turned on for Cotto in your phone's settings, then try again.
            </Text>
            <Pressable className="items-center rounded-lg bg-cotto-accent px-4 py-2" onPress={requestLocation}>
              <Text className="font-semibold text-white">Try again</Text>
            </Pressable>
          </View>
        ) : !profile?.on_duty ? (
          <Text className="mt-6 text-white/60">Turn on Delivery Mode to see available orders.</Text>
        ) : locationStatus !== "granted" || poolQuery.isLoading ? (
          <ActivityIndicator color="#D96A3E" className="mt-6" />
        ) : cards.length === 0 ? (
          <Text className="mt-6 text-white/60">No available orders right now.</Text>
        ) : (
          cards.map((card) => (
            <View key={card.id} className="gap-2 rounded-lg bg-white/5 p-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold text-white">{card.vendorName}</Text>
                <Text className="font-semibold text-cotto-accent">Est. {formatCents(card.payoutCents)}</Text>
              </View>
              <Text className="text-sm text-white/60">
                {card.distanceToPickup != null ? `${card.distanceToPickup.toFixed(1)} mi to pickup` : "— mi to pickup"}
                {" · "}
                {card.distancePickupToDropoff != null ? `${card.distancePickupToDropoff.toFixed(1)} mi to drop-off` : "— mi to drop-off"}
              </Text>
              <Text className="text-xs text-white/40">For {card.customerFirstName ?? "a customer"}</Text>
              <Pressable
                className="mt-1 items-center rounded-lg bg-cotto-accent py-2 disabled:opacity-50"
                disabled={claim.isPending}
                onPress={() => confirmAndClaim(card.id)}
              >
                {claim.isPending ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Claim</Text>}
              </Pressable>
            </View>
          ))
        ))}

      {tab === "queue" &&
        (queueQuery.isLoading ? (
          <ActivityIndicator color="#D96A3E" className="mt-6" />
        ) : !queueQuery.data || queueQuery.data.length === 0 ? (
          <Text className="mt-6 text-white/60">No claimed deliveries right now.</Text>
        ) : (
          queueQuery.data.map((claimRow) => {
            const so = claimRow.vendor_suborders as unknown as { id: string; status: string; vendors: { storefront_name: string } | null } | null;
            return (
              <Pressable
                key={claimRow.id}
                className="gap-1 rounded-lg bg-white/5 p-4"
                onPress={() => router.push({ pathname: "/(app)/deliveries/[id]", params: { id: claimRow.vendor_suborder_id } })}
              >
                <Text className="font-semibold text-white">{so?.vendors?.storefront_name ?? "Unknown vendor"}</Text>
                <Text className="text-sm text-white/60">{so ? (QUEUE_STATUS_LABELS[so.status] ?? so.status) : ""}</Text>
              </Pressable>
            );
          })
        ))}

      {tab === "history" &&
        (historyQuery.isLoading ? (
          <ActivityIndicator color="#D96A3E" className="mt-6" />
        ) : !historyQuery.data || historyQuery.data.length === 0 ? (
          <Text className="mt-6 text-white/60">No delivery history yet.</Text>
        ) : (
          historyQuery.data.map((claimRow) => {
            const so = claimRow.vendor_suborders as unknown as { id: string; status: string; vendors: { storefront_name: string } | null } | null;
            const outcome = claimRow.released_at ? "Released" : claimRow.delivered_at ? "Delivered" : so?.status ?? "In progress";
            return (
              <View key={claimRow.id} className="flex-row items-center justify-between gap-1 rounded-lg bg-white/5 p-4">
                <View>
                  <Text className="font-semibold text-white">{so?.vendors?.storefront_name ?? "Unknown vendor"}</Text>
                  <Text className="text-sm text-white/60">{outcome}</Text>
                </View>
                {claimRow.delivered_at && (
                  <Text className="font-semibold text-cotto-accent">{formatCents(claimRow.driver_payout_cents)}</Text>
                )}
              </View>
            );
          })
        ))}
    </ScrollView>
  );
}
