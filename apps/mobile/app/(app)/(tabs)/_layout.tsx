import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { supabase } from "../../../src/lib/supabase";
import { useAuth } from "../../../src/lib/auth-context";

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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#D96A3E",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarStyle: { backgroundColor: "#171412", borderTopColor: "#2A2622" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Browse" }} />
      <Tabs.Screen name="orders" options={{ title: "Orders" }} />
      <Tabs.Screen name="favorites" options={{ title: "Favorites" }} />
      <Tabs.Screen name="cart" options={{ title: "Cart" }} />
      <Tabs.Screen name="kitchen" options={{ title: "Kitchen", href: showKitchenTab ? undefined : null }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}
