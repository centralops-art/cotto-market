import { ALLERGEN_LABELS, type Allergen } from "@cotto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useAuth } from "../../../src/lib/auth-context";

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const itemQuery = useQuery({
    queryKey: ["item_detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const favoriteQuery = useQuery({
    queryKey: ["favorite_item", id, profile?.id],
    enabled: !!id && !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("id")
        .eq("menu_item_id", id!)
        .eq("profile_id", profile!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const waitlistQuery = useQuery({
    queryKey: ["waitlist_entry", id, profile?.id],
    enabled: !!id && !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waitlist_entries")
        .select("id")
        .eq("menu_item_id", id!)
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
        await supabase.from("favorites").insert({ profile_id: profile.id, menu_item_id: id });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorite_item", id, profile?.id] }),
  });

  const joinWaitlist = useMutation({
    mutationFn: async () => {
      if (!profile || !id) return;
      const { error } = await supabase.from("waitlist_entries").insert({ profile_id: profile.id, menu_item_id: id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["waitlist_entry", id, profile?.id] }),
  });

  if (itemQuery.isLoading || !itemQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  const item = itemQuery.data;
  const allergens = item.allergens as Allergen[];

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ paddingBottom: 48 }}>
      <View className="flex-row items-center justify-between px-6 pt-14">
        <Pressable onPress={() => router.back()}>
          <Text className="text-white/60">&larr; Back</Text>
        </Pressable>
        <Pressable disabled={!profile || toggleFavorite.isPending} onPress={() => toggleFavorite.mutate()}>
          <Text className={favoriteQuery.data ? "text-cotto-accent" : "text-white/60"}>
            {favoriteQuery.data ? "★ Favorited" : "☆ Favorite"}
          </Text>
        </Pressable>
      </View>

      {item.image_urls.length > 0 && (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} className="mt-4">
          {item.image_urls.map((url) => (
            <Image key={url} source={{ uri: url }} className="h-64 w-96" resizeMode="cover" />
          ))}
        </ScrollView>
      )}

      <View className="gap-2 px-6 pt-4">
        <View className="flex-row items-center gap-2">
          <Text className="text-2xl font-bold text-white">{item.name}</Text>
          {item.is_sold_out && (
            <View className="rounded-full bg-red-500/30 px-2 py-0.5">
              <Text className="text-xs text-red-200">Sold out</Text>
            </View>
          )}
        </View>
        <Text className="text-lg text-cotto-accent">${(item.price_cents / 100).toFixed(2)}</Text>

        {item.description && <Text className="mt-2 text-white/80">{item.description}</Text>}
        {item.ingredients && (
          <View className="mt-2">
            <Text className="font-semibold text-white/80">Ingredients</Text>
            <Text className="text-white/60">{item.ingredients}</Text>
          </View>
        )}
        {allergens.length > 0 && (
          <View className="mt-2">
            <Text className="font-semibold text-white/80">Contains</Text>
            <Text className="text-white/60">{allergens.map((a) => ALLERGEN_LABELS[a]).join(", ")}</Text>
          </View>
        )}

        {item.is_sold_out && (
          <Pressable
            className="mt-6 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
            disabled={!profile || joinWaitlist.isPending || !!waitlistQuery.data}
            onPress={() => joinWaitlist.mutate()}
          >
            <Text className="font-semibold text-white">
              {waitlistQuery.data ? "You're on the waitlist" : "Notify me when back"}
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
