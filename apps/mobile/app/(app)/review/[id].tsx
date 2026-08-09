import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useAuth } from "../../../src/lib/auth-context";
import { uploadReviewImage } from "../../../src/lib/upload-image";
import { StarRating } from "../../../src/components/star-rating";

export default function LeaveReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [overallRating, setOverallRating] = useState(0);
  const [overallBody, setOverallBody] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string | undefined>(undefined);
  const [itemRatings, setItemRatings] = useState<Record<string, number>>({});
  const [itemBodies, setItemBodies] = useState<Record<string, string>>({});
  const [driverRating, setDriverRating] = useState(0);
  const [driverComment, setDriverComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const suborderQuery = useQuery({
    queryKey: ["review_suborder_detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_suborders")
        .select("id, vendor_id, status, fulfillment, order_items(id, menu_item_id, name_snapshot)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const existingReviewQuery = useQuery({
    // Same key as order-tracking/[id].tsx's own existingReviewQuery -- they
    // must match exactly, or invalidating one after a successful submit
    // (below) won't refresh the other screen's stale "no review yet" cache.
    queryKey: ["existing_review", id],
    enabled: !!id && !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id")
        .eq("vendor_suborder_id", id!)
        .eq("customer_profile_id", profile!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function pickPhoto() {
    setFormError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFormError("Photo library permission is required to attach a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setPhotoUri(result.assets[0].uri);
    setPhotoMimeType(result.assets[0].mimeType);
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile || !suborderQuery.data) return;
      if (overallRating < 1) throw new Error("Pick an overall rating first.");

      let imageUrl: string | null = null;
      if (photoUri) {
        setUploading(true);
        imageUrl = await uploadReviewImage(profile.id, photoUri, photoMimeType);
        setUploading(false);
      }

      const { data: review, error: reviewError } = await supabase
        .from("reviews")
        .insert({
          vendor_suborder_id: suborderQuery.data.id,
          customer_profile_id: profile.id,
          vendor_id: suborderQuery.data.vendor_id,
          rating_overall: overallRating,
          body: overallBody.trim() || null,
          image_url: imageUrl,
        })
        .select("id")
        .single();
      if (reviewError) throw reviewError;

      // menu_item_id is nullable (set null if the menu item is later deleted) --
      // nothing to review-item against once that's happened.
      const items = (suborderQuery.data.order_items ?? []).filter(
        (item): item is typeof item & { menu_item_id: string } => item.menu_item_id !== null
      );
      const seenMenuItemIds = new Set<string>();
      const reviewItemRows = items
        .filter((item) => {
          if (seenMenuItemIds.has(item.menu_item_id)) return false;
          seenMenuItemIds.add(item.menu_item_id);
          return true;
        })
        .map((item) => ({
          review_id: review.id,
          menu_item_id: item.menu_item_id,
          rating: itemRatings[item.menu_item_id] ?? overallRating,
          body: itemBodies[item.menu_item_id]?.trim() || null,
        }));
      if (reviewItemRows.length > 0) {
        const { error: itemsError } = await supabase.from("review_items").insert(reviewItemRows);
        if (itemsError) throw itemsError;
      }

      if (suborderQuery.data.fulfillment === "delivery" && driverRating > 0) {
        const { error: driverError } = await supabase.rpc("rate_delivery_claim", {
          so_id: suborderQuery.data.id,
          rating: driverRating,
          comment: driverComment.trim() || undefined,
        });
        if (driverError) throw driverError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["existing_review", id] });
      Alert.alert("Thanks for the review!", "", [{ text: "OK", onPress: () => router.back() }]);
    },
    onError: (err) => {
      setUploading(false);
      setFormError((err as Error).message);
    },
  });

  if (suborderQuery.isLoading || existingReviewQuery.isLoading || !suborderQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  const suborder = suborderQuery.data;
  const items = (suborder.order_items ?? []).filter(
    (item): item is typeof item & { menu_item_id: string } => item.menu_item_id !== null
  );
  const uniqueItems = items.filter((item, i) => items.findIndex((x) => x.menu_item_id === item.menu_item_id) === i);

  if (suborder.status !== "completed") {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark p-6">
        <Text className="text-white/60">This order isn't complete yet -- check back once it is to leave a review.</Text>
      </View>
    );
  }

  if (existingReviewQuery.data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-cotto-dark p-6">
        <Text className="text-white">You've already reviewed this order. Thanks!</Text>
        <Pressable onPress={() => router.back()}>
          <Text className="text-cotto-accent">Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 48, gap: 20 }}>
      <Pressable onPress={() => router.back()}>
        <Text className="text-white/60">&larr; Back</Text>
      </Pressable>

      <Text className="text-2xl font-bold text-white">Leave a review</Text>

      <View className="gap-2">
        <Text className="font-semibold text-white">Overall rating</Text>
        <StarRating value={overallRating} onChange={setOverallRating} />
      </View>

      <View className="gap-2">
        <Text className="font-semibold text-white">Comments (optional)</Text>
        <TextInput
          className="min-h-[80px] rounded-lg bg-white/10 px-4 py-3 text-white"
          placeholder="How was everything?"
          placeholderTextColor="#9CA3AF"
          multiline
          value={overallBody}
          onChangeText={setOverallBody}
        />
      </View>

      <View className="gap-2">
        <Text className="font-semibold text-white">Photo (optional)</Text>
        {photoUri && <Image source={{ uri: photoUri }} className="h-40 w-full rounded-lg" resizeMode="cover" />}
        <Pressable className="items-center rounded-lg border border-white/20 py-3" onPress={pickPhoto}>
          <Text className="text-white">{photoUri ? "Replace photo" : "Add a photo"}</Text>
        </Pressable>
      </View>

      {uniqueItems.length > 0 && (
        <View className="gap-4">
          <Text className="font-semibold text-white">Rate each item</Text>
          {uniqueItems.map((item) => (
            <View key={item.id} className="gap-2 rounded-lg bg-white/5 p-3">
              <Text className="text-white">{item.name_snapshot}</Text>
              <StarRating
                value={itemRatings[item.menu_item_id] ?? overallRating}
                onChange={(v) => setItemRatings((prev) => ({ ...prev, [item.menu_item_id]: v }))}
                size="sm"
              />
              <TextInput
                className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white"
                placeholder="Optional note about this item"
                placeholderTextColor="#9CA3AF"
                value={itemBodies[item.menu_item_id] ?? ""}
                onChangeText={(v) => setItemBodies((prev) => ({ ...prev, [item.menu_item_id]: v }))}
              />
            </View>
          ))}
        </View>
      )}

      {suborder.fulfillment === "delivery" && (
        <View className="gap-2 rounded-lg bg-white/5 p-3">
          <Text className="font-semibold text-white">Rate your driver (optional)</Text>
          <StarRating value={driverRating} onChange={setDriverRating} />
          {driverRating > 0 && (
            <TextInput
              className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white"
              placeholder="Optional comment about the delivery"
              placeholderTextColor="#9CA3AF"
              value={driverComment}
              onChangeText={setDriverComment}
            />
          )}
        </View>
      )}

      {formError && <Text className="text-red-400">{formError}</Text>}

      <Pressable
        className="items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
        disabled={submit.isPending || uploading}
        onPress={() => submit.mutate()}
      >
        {submit.isPending || uploading ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Submit review</Text>}
      </Pressable>
    </ScrollView>
  );
}
