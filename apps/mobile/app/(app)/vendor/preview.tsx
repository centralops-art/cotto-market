import { ALLERGEN_LABELS, themePaletteSchema, THEME_PRESETS, type Allergen } from "@cotto/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useVendor } from "../../../src/lib/use-vendor";

export default function StorefrontPreview() {
  const router = useRouter();
  const { data: vendor, isLoading: vendorLoading } = useVendor();
  const vendorId = vendor?.id;

  const categoriesQuery = useQuery({
    queryKey: ["menu_categories", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_categories").select("*").eq("vendor_id", vendorId!).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["menu_items", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("vendor_id", vendorId!)
        .eq("is_available", true)
        .is("deleted_at", null)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  if (vendorLoading || !vendor || categoriesQuery.isLoading || itemsQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  const palette = themePaletteSchema.safeParse(vendor.theme_palette);
  const accent = palette.success ? palette.data.accent : THEME_PRESETS[0].accent;
  const primary = palette.success ? palette.data.primary : THEME_PRESETS[0].primary;
  const isGrid = vendor.layout_style === "image_grid" || vendor.layout_style === "detail_grid";
  const isDetailed = vendor.layout_style === "detail_list" || vendor.layout_style === "detail_grid";

  return (
    <ScrollView style={{ backgroundColor: primary }} contentContainerStyle={{ paddingBottom: 48 }}>
      <View className="px-6 pt-14">
        <Pressable onPress={() => router.back()}>
          <Text className="text-white/60">&larr; Back to editor (preview only)</Text>
        </Pressable>
      </View>

      {vendor.header_image_url && (
        <Image source={{ uri: vendor.header_image_url }} className="mt-4 h-40 w-full" resizeMode="cover" />
      )}

      <View className="gap-1 px-6 pt-4">
        <Text className="text-3xl font-bold text-white">{vendor.storefront_name}</Text>
        {vendor.tagline && <Text className="text-white/70">{vendor.tagline}</Text>}
      </View>

      <View className={`mt-6 px-6 ${isGrid ? "flex-row flex-wrap gap-3" : "gap-3"}`}>
        {categoriesQuery.data?.map((category) => {
          const items = itemsQuery.data?.filter((i) => i.menu_category_id === category.id) ?? [];
          if (items.length === 0) return null;
          return (
            <View key={category.id} className={isGrid ? "w-full" : ""}>
              <Text className="mb-2 text-lg font-semibold text-white">{category.name}</Text>
              <View className={isGrid ? "flex-row flex-wrap gap-3" : "gap-3"}>
                {items.map((item) => (
                  <View
                    key={item.id}
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
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
