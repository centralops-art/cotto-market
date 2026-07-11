import { VENDOR_TYPES, VENDOR_TYPE_LABELS, type VendorType } from "@cotto/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";

export default function Browse() {
  const router = useRouter();
  const [queryText, setQueryText] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [vendorType, setVendorType] = useState<VendorType | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(queryText.trim()), 300);
    return () => clearTimeout(timeout);
  }, [queryText]);

  const vendorsQuery = useQuery({
    queryKey: ["browse_vendors", debouncedQuery, vendorType],
    queryFn: async () => {
      let vendorRows = supabase.from("vendors").select("*").eq("status", "active");
      if (vendorType) vendorRows = vendorRows.contains("vendor_types", [vendorType]);
      if (debouncedQuery) vendorRows = vendorRows.textSearch("search_tsv", debouncedQuery, { type: "websearch" });

      const { data: directMatches, error: directError } = await vendorRows;
      if (directError) throw directError;

      if (!debouncedQuery) return directMatches ?? [];

      // Also surface vendors whose menu items match the search term, even if
      // the vendor's own name/tagline don't (spec 3.4: search across vendor
      // names, item names, and ingredients).
      const { data: itemMatches, error: itemError } = await supabase
        .from("menu_items")
        .select("vendor_id")
        .eq("is_available", true)
        .is("deleted_at", null)
        .textSearch("search_tsv", debouncedQuery, { type: "websearch" });
      if (itemError) throw itemError;

      const directIds = new Set((directMatches ?? []).map((v) => v.id));
      const extraIds = [...new Set((itemMatches ?? []).map((m) => m.vendor_id))].filter((id) => !directIds.has(id));
      if (extraIds.length === 0) return directMatches ?? [];

      let extraRows = supabase.from("vendors").select("*").eq("status", "active").in("id", extraIds);
      if (vendorType) extraRows = extraRows.contains("vendor_types", [vendorType]);
      const { data: extraVendors, error: extraError } = await extraRows;
      if (extraError) throw extraError;

      return [...(directMatches ?? []), ...(extraVendors ?? [])];
    },
  });

  return (
    <View className="flex-1 bg-cotto-dark">
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64, gap: 16 }}>
        <Text className="text-3xl font-bold text-cotto-accent">Cotto</Text>

        <TextInput
          className="rounded-lg bg-white/10 px-4 py-3 text-white"
          placeholder="Search vendors, dishes, ingredients..."
          placeholderTextColor="#9CA3AF"
          value={queryText}
          onChangeText={setQueryText}
          autoCapitalize="none"
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Pressable
            onPress={() => setVendorType(null)}
            className={`rounded-full border px-3 py-1.5 ${vendorType === null ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
          >
            <Text className={vendorType === null ? "text-cotto-accent" : "text-white/70"}>All</Text>
          </Pressable>
          {VENDOR_TYPES.map((type) => (
            <Pressable
              key={type}
              onPress={() => setVendorType(vendorType === type ? null : type)}
              className={`rounded-full border px-3 py-1.5 ${vendorType === type ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
            >
              <Text className={vendorType === type ? "text-cotto-accent" : "text-white/70"}>{VENDOR_TYPE_LABELS[type]}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {vendorsQuery.isLoading ? (
          <ActivityIndicator color="#D96A3E" />
        ) : vendorsQuery.data?.length === 0 ? (
          <Text className="mt-8 text-center text-white/60">No vendors match yet. Try a different search.</Text>
        ) : (
          <View className="gap-3">
            {vendorsQuery.data?.map((vendor) => (
              <Pressable
                key={vendor.id}
                className="overflow-hidden rounded-lg bg-white/5"
                onPress={() => router.push(`/(app)/vendor-profile/${vendor.id}`)}
              >
                {vendor.header_image_url && (
                  <Image source={{ uri: vendor.header_image_url }} className="h-32 w-full" resizeMode="cover" />
                )}
                <View className="gap-1 p-3">
                  <Text className="text-lg font-semibold text-white">{vendor.storefront_name}</Text>
                  {vendor.tagline && <Text className="text-sm text-white/60">{vendor.tagline}</Text>}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
