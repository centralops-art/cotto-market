import {
  ALLERGEN_LABELS,
  defaultWeekHours,
  THEME_PRESETS,
  themePaletteSchema,
  WEEKDAYS,
  weekHoursSchema,
  type Allergen,
} from "@cotto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Share, Text, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useAuth } from "../../../src/lib/auth-context";
import { CartButton } from "../../../src/components/cart-button";

const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export default function VendorProfile() {
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const excludedAllergens = profile?.allergen_preferences ?? [];
  const [showFullMenu, setShowFullMenu] = useState(false);
  const searchTerm = (q ?? "").trim().toLowerCase();
  const searchWords = searchTerm.split(/\s+/).filter(Boolean);

  const vendorQuery = useQuery({
    queryKey: ["vendor_profile", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["menu_categories", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_categories").select("*").eq("vendor_id", id!).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["menu_items", id, "published"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("vendor_id", id!)
        .eq("is_available", true)
        .is("deleted_at", null)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const teamQuery = useQuery({
    queryKey: ["vendor_team_members", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendor_team_members").select("*").eq("vendor_id", id!).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const favoriteQuery = useQuery({
    queryKey: ["favorite_vendor", id, profile?.id],
    enabled: !!id && !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("id")
        .eq("vendor_id", id!)
        .eq("profile_id", profile!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      if (!profile || !id) return;
      if (favoriteQuery.data) {
        await supabase.from("favorites").delete().eq("id", favoriteQuery.data.id);
      } else {
        await supabase.from("favorites").insert({ profile_id: profile.id, vendor_id: id });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorite_vendor", id, profile?.id] }),
  });

  async function shareVendor() {
    if (!vendorQuery.data) return;
    await Share.share({ message: `Check out ${vendorQuery.data.storefront_name} on Cotto!` });
  }

  if (vendorQuery.isLoading || !vendorQuery.data || categoriesQuery.isLoading || itemsQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  const vendor = vendorQuery.data;
  const palette = themePaletteSchema.safeParse(vendor.theme_palette);
  const accent = palette.success ? palette.data.accent : THEME_PRESETS[0].accent;
  const primary = palette.success ? palette.data.primary : THEME_PRESETS[0].primary;
  const isGrid = vendor.layout_style === "image_grid" || vendor.layout_style === "detail_grid";
  const isDetailed = vendor.layout_style === "detail_list" || vendor.layout_style === "detail_grid";
  const parsedHours = weekHoursSchema.safeParse(vendor.hours);
  const weekHours = parsedHours.success ? parsedHours.data : defaultWeekHours();

  const visibleItems = (itemsQuery.data ?? []).filter(
    (item) => !(item.allergens as Allergen[]).some((a) => excludedAllergens.includes(a))
  );

  // Scope to whatever matched the search that brought the customer here, so
  // tapping "basil" in Browse lands them on the dish instead of a full menu
  // they have to hunt through. Falls back to the full menu when the search
  // only matched the vendor's own name/tagline (no items to narrow to).
  const searchMatchedItems = searchWords.length
    ? visibleItems.filter((item) => {
        const haystack = `${item.name} ${item.ingredients ?? ""}`.toLowerCase();
        return searchWords.some((word) => haystack.includes(word));
      })
    : [];
  const isFiltered = searchMatchedItems.length > 0 && !showFullMenu;
  const itemsToRender = isFiltered ? searchMatchedItems : visibleItems;

  return (
    <ScrollView style={{ backgroundColor: primary }} contentContainerStyle={{ paddingBottom: 48 }}>
      <View className="flex-row items-center justify-between px-6 pt-14">
        <Pressable onPress={() => router.back()}>
          <Text className="text-white/60">&larr; Back</Text>
        </Pressable>
        <View className="flex-row items-center gap-4">
          <CartButton />
          <Pressable onPress={shareVendor}>
            <Text className="text-white/60">Share</Text>
          </Pressable>
          <Pressable disabled={!profile || toggleFavorite.isPending} onPress={() => toggleFavorite.mutate()}>
            <Text style={{ color: favoriteQuery.data ? accent : "rgba(255,255,255,0.6)" }}>
              {favoriteQuery.data ? "★ Favorited" : "☆ Favorite"}
            </Text>
          </Pressable>
        </View>
      </View>

      {vendor.header_image_url && (
        <Image source={{ uri: vendor.header_image_url }} className="mt-4 h-40 w-full" resizeMode="cover" />
      )}

      <View className="gap-1 px-6 pt-4">
        <Text className="text-3xl font-bold text-white">{vendor.storefront_name}</Text>
        {vendor.tagline && <Text className="text-white/70">{vendor.tagline}</Text>}
      </View>

      {isFiltered && (
        <View className="mx-6 mt-4 flex-row items-center justify-between rounded-md bg-white/10 px-3 py-2">
          <Text className="text-sm text-white/70">Showing results for "{searchTerm}"</Text>
          <Pressable onPress={() => setShowFullMenu(true)}>
            <Text className="text-sm" style={{ color: accent }}>
              Show full menu
            </Text>
          </Pressable>
        </View>
      )}

      <View className="mt-6 gap-1 px-6">
        <Text className="mb-1 text-lg font-semibold text-white">Hours</Text>
        {WEEKDAYS.map((day) => (
          <View key={day} className="flex-row justify-between">
            <Text className="text-white/70">{DAY_LABELS[day]}</Text>
            <Text className="text-white/70">
              {weekHours[day].closed ? "Closed" : `${weekHours[day].open} - ${weekHours[day].close}`}
            </Text>
          </View>
        ))}
      </View>

      {teamQuery.data && teamQuery.data.length > 0 && (
        <View className="mt-6 gap-3 px-6">
          <Text className="text-lg font-semibold text-white">Meet the team</Text>
          {teamQuery.data.map((member) => (
            <View key={member.id} className="flex-row gap-3">
              {member.photo_url && <Image source={{ uri: member.photo_url }} className="h-12 w-12 rounded-full" />}
              <View className="flex-1">
                <Text className="font-semibold text-white">{member.display_name}</Text>
                {member.role_title && <Text className="text-sm text-white/60">{member.role_title}</Text>}
                {member.bio && <Text className="mt-1 text-sm text-white/70">{member.bio}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}

      <View className={`mt-6 px-6 ${isGrid ? "flex-row flex-wrap gap-3" : "gap-3"}`}>
        {categoriesQuery.data?.map((category) => {
          const items = itemsToRender.filter((i) => i.menu_category_id === category.id);
          if (items.length === 0) return null;
          return (
            <View key={category.id} className={isGrid ? "w-full" : ""}>
              <Text className="mb-2 text-lg font-semibold text-white">{category.name}</Text>
              <View className={isGrid ? "flex-row flex-wrap gap-3" : "gap-3"}>
                {items.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push(`/(app)/item/${item.id}`)}
                    className={isGrid ? "w-[47%] rounded-lg bg-white/10 p-3" : "flex-row gap-3 rounded-lg bg-white/10 p-3"}
                  >
                    {item.image_urls[0] && (
                      <Image
                        source={{ uri: item.image_urls[0] }}
                        className={isGrid ? "mb-2 h-24 w-full rounded-md" : "h-16 w-16 rounded-md"}
                        resizeMode="cover"
                      />
                    )}
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="font-semibold text-white">{item.name}</Text>
                        {item.is_sold_out && (
                          <View className="rounded-full bg-red-500/30 px-2 py-0.5">
                            <Text className="text-xs text-red-200">Sold out</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: accent }}>${(item.price_cents / 100).toFixed(2)}</Text>
                      {isDetailed && item.description && <Text className="mt-1 text-sm text-white/70">{item.description}</Text>}
                      {isDetailed && item.allergens.length > 0 && (
                        <Text className="mt-1 text-xs text-white/50">
                          Contains: {(item.allergens as Allergen[]).map((a) => ALLERGEN_LABELS[a]).join(", ")}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
