import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import type { BottomTabBarButtonProps } from "expo-router/build/react-navigation/bottom-tabs";
import { supabase } from "../../../src/lib/supabase";
import { useAuth } from "../../../src/lib/auth-context";
import { AwningTabButton } from "../../../src/components/awning-tab-button";

/** Fixed per-screen so hiding a tab can't shift another tab's color at
 * runtime -- see awning-tab-button.tsx. */
function awningButton(cupColor: "red" | "cream", label: string, visible = true) {
  return (props: BottomTabBarButtonProps) => <AwningTabButton {...props} cupColor={cupColor} label={label} visible={visible} />;
}

export default function TabsLayout() {
  const { session } = useAuth();

  // Kitchen tab only shows for profiles that own an active vendor -- a
  // draft/pending/suspended vendor never receives orders, so the tab would
  // just be an empty, confusing screen.
  // Scoped query key (distinct from ["vendor", ...] used by account.tsx/use-vendor.ts,
  // which selects the full row) -- sharing a key across different `select()`
  // shapes previously caused a cache-collision bug in this codebase (see HANDOFF §9).
  const activeVendorQuery = useQuery({
    queryKey: ["vendor_status_for_tabs", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, status").eq("owner_profile_id", session!.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const showKitchenTab = activeVendorQuery.data?.status === "active";

  // Deliveries tab only shows once the vendor's delivery-partner application
  // has been approved. Embedded select through vendors -> vendor_delivery_profiles
  // (same nested-select idiom already used elsewhere, e.g. use-cart.ts's
  // menu_items(..., vendors(...))). Own query key, per this codebase's rule
  // that every distinct select() shape needs its own key.
  const deliveryStatusQuery = useQuery({
    queryKey: ["delivery_status_for_tabs", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, vendor_delivery_profiles(status)")
        .eq("owner_profile_id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const showDeliveriesTab = deliveryStatusQuery.data?.vendor_delivery_profiles?.status === "delivery_active";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "#5C3317", borderTopWidth: 0 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Browse", tabBarButton: awningButton("red", "Browse") }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarButton: awningButton("cream", "Orders") }} />
      <Tabs.Screen name="favorites" options={{ title: "Favorites", tabBarButton: awningButton("red", "Favorites") }} />
      <Tabs.Screen name="cart" options={{ title: "Cart", tabBarButton: awningButton("cream", "Cart") }} />
      <Tabs.Screen name="kitchen" options={{ title: "Kitchen", tabBarButton: awningButton("red", "Kitchen", showKitchenTab) }} />
      <Tabs.Screen
        name="deliveries"
        options={{ title: "Deliveries", tabBarButton: awningButton("cream", "Deliveries", showDeliveriesTab) }}
      />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarButton: awningButton("red", "Account") }} />
    </Tabs>
  );
}
