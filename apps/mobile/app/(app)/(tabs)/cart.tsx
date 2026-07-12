import { chicagoPartsOf, generatePickupSlots, weekHoursSchema, defaultWeekHours, type WeekHours } from "@cotto/shared";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { clearCart, useCartItems, useInvalidateCart, useOpenCart } from "../../../src/lib/use-cart";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

interface FulfillmentUI {
  type: "pickup" | "delivery";
  dayOffset: number;
  slot: Date | null;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  coords: { lat: number; lng: number } | null;
  instructions: string;
  geocoding: boolean;
  error: string | null;
}

function defaultFulfillment(): FulfillmentUI {
  return {
    type: "pickup",
    dayOffset: 0,
    slot: null,
    addressLine1: "",
    city: "",
    state: "",
    zip: "",
    coords: null,
    instructions: "",
    geocoding: false,
    error: null,
  };
}

function chicagoTodayYMD() {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" });
  const [year, month, day] = fmt.format(new Date()).split("-").map(Number);
  return { year, month, day };
}

function addDaysYMD({ year, month, day }: { year: number; month: number; day: number }, offset: number) {
  const anchor = new Date(Date.UTC(year, month - 1, day + offset, 12));
  return { year: anchor.getUTCFullYear(), month: anchor.getUTCMonth() + 1, day: anchor.getUTCDate() };
}

const DAY_LABELS = ["Today", "Tomorrow"];

export default function Cart() {
  const router = useRouter();
  const cartQuery = useOpenCart();
  const itemsQuery = useCartItems(cartQuery.data?.id);
  const invalidateCart = useInvalidateCart(cartQuery.data?.id);
  const [fulfillments, setFulfillments] = useState<Record<string, FulfillmentUI>>({});
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const items = itemsQuery.data ?? [];
  const vendorGroups = Object.values(
    items.reduce<Record<string, { vendorId: string; vendorName: string; hours: WeekHours; items: typeof items }>>(
      (acc, item) => {
        const menuItem = item.menu_items as unknown as {
          name: string;
          image_urls: string[];
          vendor_id: string;
          vendors: { storefront_name: string; hours: unknown } | null;
        };
        const vendorId = item.vendor_id;
        if (!acc[vendorId]) {
          const parsedHours = weekHoursSchema.safeParse(menuItem.vendors?.hours);
          acc[vendorId] = {
            vendorId,
            vendorName: menuItem.vendors?.storefront_name ?? "Vendor",
            hours: parsedHours.success ? parsedHours.data : defaultWeekHours(),
            items: [],
          };
        }
        acc[vendorId].items.push(item);
        return acc;
      },
      {}
    )
  );

  useEffect(() => {
    setFulfillments((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const group of vendorGroups) {
        if (!next[group.vendorId]) {
          next[group.vendorId] = defaultFulfillment();
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items.length]);

  function updateFulfillment(vendorId: string, patch: Partial<FulfillmentUI>) {
    setFulfillments((prev) => ({ ...prev, [vendorId]: { ...prev[vendorId], ...patch } }));
  }

  async function updateQuantity(itemId: string, quantity: number) {
    if (quantity <= 0) {
      await supabase.from("cart_items").delete().eq("id", itemId);
    } else {
      await supabase.from("cart_items").update({ quantity }).eq("id", itemId);
    }
    invalidateCart();
  }

  async function removeItem(itemId: string) {
    await supabase.from("cart_items").delete().eq("id", itemId);
    invalidateCart();
  }

  async function handleClearCart() {
    if (!cartQuery.data) return;
    setClearing(true);
    try {
      await clearCart(cartQuery.data.id);
      invalidateCart();
    } finally {
      setClearing(false);
      setConfirmingClear(false);
    }
  }

  async function geocode(vendorId: string) {
    const f = fulfillments[vendorId];
    if (!f) return;
    if (!f.addressLine1.trim() || !f.city.trim() || !f.state.trim() || !f.zip.trim()) {
      updateFulfillment(vendorId, { error: "Fill in the full address first." });
      return;
    }
    if (!MAPBOX_TOKEN) {
      updateFulfillment(vendorId, { error: "Mapbox isn't configured." });
      return;
    }
    updateFulfillment(vendorId, { geocoding: true, error: null });
    try {
      const query = encodeURIComponent(`${f.addressLine1}, ${f.city}, ${f.state} ${f.zip}`);
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=us`
      );
      const json = await res.json();
      const feature = json.features?.[0];
      if (!feature) {
        updateFulfillment(vendorId, { geocoding: false, error: "Couldn't find that address." });
        return;
      }
      const [lng, lat] = feature.center as [number, number];
      updateFulfillment(vendorId, { geocoding: false, coords: { lat, lng } });
    } catch {
      updateFulfillment(vendorId, { geocoding: false, error: "Couldn't reach Mapbox. Try again." });
    }
  }

  const checkout = useMutation({
    mutationFn: async () => {
      if (!cartQuery.data) throw new Error("No cart");
      const payload: Record<string, unknown> = {};
      for (const group of vendorGroups) {
        const f = fulfillments[group.vendorId];
        if (!f) throw new Error(`Missing fulfillment for ${group.vendorName}`);
        if (f.type === "pickup") {
          if (!f.slot) throw new Error(`Pick a pickup time for ${group.vendorName}`);
          payload[group.vendorId] = { type: "pickup", pickupAt: f.slot.toISOString() };
        } else {
          if (!f.coords) throw new Error(`Confirm the delivery address for ${group.vendorName}`);
          payload[group.vendorId] = {
            type: "delivery",
            deliveryAddress: {
              line1: f.addressLine1,
              city: f.city,
              state: f.state,
              zip: f.zip,
              lat: f.coords.lat,
              lng: f.coords.lng,
              instructions: f.instructions || undefined,
            },
          };
        }
      }
      const { data, error } = await supabase.functions.invoke("checkout-create-payment-intent", {
        body: { cartId: cartQuery.data.id, fulfillments: payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { clientSecret: string; orderId: string };
    },
    onSuccess: (data) => {
      router.push({ pathname: "/(app)/checkout", params: { clientSecret: data.clientSecret, orderId: data.orderId } });
    },
    onError: (err) => setCheckoutError((err as Error).message),
  });

  const subtotalCents = items.reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0);

  if (itemsQuery.isLoading || cartQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 96, gap: 20 }}>
      <View className="flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-white">Cart</Text>
        {vendorGroups.length > 0 &&
          (confirmingClear ? (
            <View className="flex-row items-center gap-3">
              <Text className="text-sm text-white/60">Clear everything?</Text>
              <Pressable disabled={clearing} onPress={handleClearCart}>
                <Text className="text-sm font-semibold text-red-400">Confirm</Text>
              </Pressable>
              <Pressable disabled={clearing} onPress={() => setConfirmingClear(false)}>
                <Text className="text-sm text-white/60">Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirmingClear(true)}>
              <Text className="text-sm text-red-400">Clear cart</Text>
            </Pressable>
          ))}
      </View>

      {vendorGroups.length === 0 ? (
        <Text className="text-white/60">Your cart is empty. Add a dish from a vendor's storefront.</Text>
      ) : (
        vendorGroups.map((group) => {
          const f = fulfillments[group.vendorId] ?? defaultFulfillment();
          const today = chicagoTodayYMD();
          const selectedYMD = addDaysYMD(today, f.dayOffset);
          const slots = generatePickupSlots(group.hours, selectedYMD);

          return (
            <View key={group.vendorId} className="gap-3 rounded-lg bg-white/5 p-4">
              <Text className="text-lg font-semibold text-white">{group.vendorName}</Text>

              {group.items.map((item) => {
                const menuItem = item.menu_items as unknown as { name: string };
                return (
                  <View key={item.id} className="flex-row items-center justify-between">
                    <Text className="flex-1 text-white">{menuItem.name}</Text>
                    <View className="flex-row items-center gap-3">
                      <Pressable onPress={() => updateQuantity(item.id, item.quantity - 1)}>
                        <Text className="text-lg text-white/70">-</Text>
                      </Pressable>
                      <Text className="w-6 text-center text-white">{item.quantity}</Text>
                      <Pressable onPress={() => updateQuantity(item.id, item.quantity + 1)}>
                        <Text className="text-lg text-white/70">+</Text>
                      </Pressable>
                      <Text className="w-16 text-right text-white/80">
                        ${((item.unit_price_cents * item.quantity) / 100).toFixed(2)}
                      </Text>
                      <Pressable onPress={() => removeItem(item.id)}>
                        <Text className="text-sm text-red-400">Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}

              <View className="mt-2 flex-row gap-2">
                <Pressable
                  className={`flex-1 items-center rounded-md border py-2 ${f.type === "pickup" ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
                  onPress={() => updateFulfillment(group.vendorId, { type: "pickup" })}
                >
                  <Text className={f.type === "pickup" ? "text-cotto-accent" : "text-white/70"}>Pickup</Text>
                </Pressable>
                <Pressable
                  className={`flex-1 items-center rounded-md border py-2 ${f.type === "delivery" ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
                  onPress={() => updateFulfillment(group.vendorId, { type: "delivery" })}
                >
                  <Text className={f.type === "delivery" ? "text-cotto-accent" : "text-white/70"}>Delivery</Text>
                </Pressable>
              </View>

              {f.type === "pickup" ? (
                <View className="gap-2">
                  <View className="flex-row gap-2">
                    {DAY_LABELS.map((label, i) => (
                      <Pressable
                        key={label}
                        className={`rounded-full border px-3 py-1.5 ${f.dayOffset === i ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
                        onPress={() => updateFulfillment(group.vendorId, { dayOffset: i, slot: null })}
                      >
                        <Text className={f.dayOffset === i ? "text-cotto-accent" : "text-white/70"}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {slots.length === 0 ? (
                    <Text className="text-sm text-white/50">No pickup slots left that day.</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {slots.map((slot) => {
                        const parts = chicagoPartsOf(slot);
                        const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
                        const ampm = parts.hour < 12 ? "AM" : "PM";
                        const label = `${hour12}:${String(parts.minute).padStart(2, "0")} ${ampm}`;
                        const selected = f.slot?.getTime() === slot.getTime();
                        return (
                          <Pressable
                            key={slot.toISOString()}
                            className={`rounded-full border px-3 py-1.5 ${selected ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
                            onPress={() => updateFulfillment(group.vendorId, { slot })}
                          >
                            <Text className={selected ? "text-cotto-accent" : "text-white/70"}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              ) : (
                <View className="gap-2">
                  <TextInput
                    className="rounded-md bg-white/10 px-3 py-2 text-white"
                    placeholder="Street address"
                    placeholderTextColor="#9CA3AF"
                    value={f.addressLine1}
                    onChangeText={(t) => updateFulfillment(group.vendorId, { addressLine1: t, coords: null })}
                  />
                  <View className="flex-row gap-2">
                    <TextInput
                      className="flex-1 rounded-md bg-white/10 px-3 py-2 text-white"
                      placeholder="City"
                      placeholderTextColor="#9CA3AF"
                      value={f.city}
                      onChangeText={(t) => updateFulfillment(group.vendorId, { city: t, coords: null })}
                    />
                    <TextInput
                      className="w-14 rounded-md bg-white/10 px-3 py-2 text-white"
                      placeholder="IL"
                      placeholderTextColor="#9CA3AF"
                      maxLength={2}
                      autoCapitalize="characters"
                      value={f.state}
                      onChangeText={(t) => updateFulfillment(group.vendorId, { state: t, coords: null })}
                    />
                    <TextInput
                      className="w-20 rounded-md bg-white/10 px-3 py-2 text-white"
                      placeholder="ZIP"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      maxLength={5}
                      value={f.zip}
                      onChangeText={(t) => updateFulfillment(group.vendorId, { zip: t, coords: null })}
                    />
                  </View>
                  <TextInput
                    className="rounded-md bg-white/10 px-3 py-2 text-white"
                    placeholder="Delivery instructions (optional)"
                    placeholderTextColor="#9CA3AF"
                    value={f.instructions}
                    onChangeText={(t) => updateFulfillment(group.vendorId, { instructions: t })}
                  />
                  <Pressable
                    className="items-center rounded-md border border-white/20 py-2 disabled:opacity-50"
                    disabled={f.geocoding}
                    onPress={() => geocode(group.vendorId)}
                  >
                    {f.geocoding ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white">{f.coords ? "Address confirmed" : "Confirm address"}</Text>
                    )}
                  </Pressable>
                </View>
              )}
              {f.error && <Text className="text-sm text-red-400">{f.error}</Text>}
            </View>
          );
        })
      )}

      {vendorGroups.length > 0 && (
        <View className="gap-2 border-t border-white/10 pt-4">
          <View className="flex-row justify-between">
            <Text className="text-white/70">Subtotal</Text>
            <Text className="text-white">${(subtotalCents / 100).toFixed(2)}</Text>
          </View>
          <Text className="text-xs text-white/40">Delivery fee and tax are calculated at checkout.</Text>

          {checkoutError && <Text className="text-red-400">{checkoutError}</Text>}

          <Pressable
            className="mt-2 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
            disabled={checkout.isPending}
            onPress={() => {
              setCheckoutError(null);
              checkout.mutate();
            }}
          >
            {checkout.isPending ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Proceed to checkout</Text>}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
