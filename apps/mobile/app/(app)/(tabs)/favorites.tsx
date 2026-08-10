import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useAuth } from "../../../src/lib/auth-context";

export default function Favorites() {
  const { profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const favoriteVendorsQuery = useQuery({
    queryKey: ["favorite_vendors_list", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("id, vendor:vendors(*)")
        .eq("profile_id", profile!.id)
        .not("vendor_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  const favoriteItemsQuery = useQuery({
    queryKey: ["favorite_items_list", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("id, item:menu_items(*, vendors(storefront_name))")
        .eq("profile_id", profile!.id)
        .not("menu_item_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  const unfavorite = useMutation({
    mutationFn: async (favoriteId: string) => {
      const { error } = await supabase.from("favorites").delete().eq("id", favoriteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorite_vendors_list", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["favorite_items_list", profile?.id] });
    },
  });

  // Tab screens stay mounted in the background (they aren't remounted on
  // switch), so without this, favorites added elsewhere while this tab sits
  // idle would never appear until an unrelated cache eviction.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["favorite_vendors_list", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["favorite_items_list", profile?.id] });
    }, [queryClient, profile?.id])
  );

  const isLoading = favoriteVendorsQuery.isLoading || favoriteItemsQuery.isLoading;
  const vendors = favoriteVendorsQuery.data?.filter((f) => !!f.vendor) ?? [];
  const items = favoriteItemsQuery.data?.filter((f) => !!f.item) ?? [];

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ padding: 24, paddingTop: 64, gap: 24 }}>
      <Text className="text-2xl font-bold text-white">Favorites</Text>

      {isLoading ? (
        <ActivityIndicator color="#D96A3E" />
      ) : vendors.length === 0 && items.length === 0 ? (
        <Text className="text-white/60">
          Nothing favorited yet. Tap the star on a vendor or dish to save it here.
        </Text>
      ) : (
        <>
          {vendors.length > 0 && (
            <View className="gap-3">
              <Text className="text-lg font-semibold text-white">Vendors</Text>
              {vendors.map((fav) => (
                <Pressable
                  key={fav.id}
                  className="flex-row items-center gap-3 rounded-lg bg-white/5 p-3"
                  onPress={() => router.push(`/(app)/vendor-profile/${fav.vendor!.id}`)}
                >
                  {fav.vendor!.header_image_url && (
                    <Image source={{ uri: fav.vendor!.header_image_url }} className="h-12 w-12 rounded-md" resizeMode="cover" />
                  )}
                  <View className="flex-1">
                    <Text className="font-semibold text-white">{fav.vendor!.storefront_name}</Text>
                    {fav.vendor!.tagline && <Text className="text-sm text-white/60">{fav.vendor!.tagline}</Text>}
                  </View>
                  <Pressable hitSlop={8} disabled={unfavorite.isPending} onPress={() => unfavorite.mutate(fav.id)}>
                    <Text className="text-lg text-cotto-accent">★</Text>
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}

          {items.length > 0 && (
            <View className="gap-3">
              <Text className="text-lg font-semibold text-white">Dishes</Text>
              {items.map((fav) => (
                <Pressable
                  key={fav.id}
                  className="flex-row items-center gap-3 rounded-lg bg-white/5 p-3"
                  onPress={() => router.push(`/(app)/item/${fav.item!.id}`)}
                >
                  {fav.item!.image_urls[0] && (
                    <Image source={{ uri: fav.item!.image_urls[0] }} className="h-12 w-12 rounded-md" resizeMode="cover" />
                  )}
                  <View className="flex-1">
                    <Text className="font-semibold text-white">{fav.item!.name}</Text>
                    {(fav.item as unknown as { vendors: { storefront_name: string } | null }).vendors?.storefront_name && (
                      <Text className="text-xs text-white/40">
                        {(fav.item as unknown as { vendors: { storefront_name: string } | null }).vendors!.storefront_name}
                      </Text>
                    )}
                    <Text className="text-sm text-white/60">${(fav.item!.price_cents / 100).toFixed(2)}</Text>
                  </View>
                  <Pressable hitSlop={8} disabled={unfavorite.isPending} onPress={() => unfavorite.mutate(fav.id)}>
                    <Text className="text-lg text-cotto-accent">★</Text>
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
