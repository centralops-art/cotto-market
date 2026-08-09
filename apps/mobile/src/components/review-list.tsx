import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Image, Pressable, Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import { StarRating } from "./star-rating";

/** Vendor storefront's public review list -- average rating, each review's
 * text/photo, and a lightweight Report action any signed-in customer can use
 * (report_review RPC, migration 0047). Reviewer names come from
 * review_customer_first_name (migration 0049) since profiles RLS otherwise
 * blocks reading another customer's name. */
export function ReviewList({ vendorId }: { vendorId: string }) {
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: ["vendor_review_summary", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase.from("reviews").select("rating_overall").eq("vendor_id", vendorId);
      if (error) throw error;
      const ratings = data.map((r) => r.rating_overall);
      const average = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      return { average, count: ratings.length };
    },
  });

  const reviewsQuery = useQuery({
    queryKey: ["vendor_reviews", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, rating_overall, body, image_url, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const withNames = await Promise.all(
        data.map(async (review) => {
          const { data: firstName } = await supabase.rpc("review_customer_first_name", { review_id: review.id });
          return { ...review, reviewerFirstName: firstName as string | null };
        })
      );
      return withNames;
    },
  });

  const report = useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase.rpc("report_review", { review_id: reviewId, reason: "Reported by a customer as inappropriate" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor_reviews", vendorId] });
      queryClient.invalidateQueries({ queryKey: ["vendor_review_summary", vendorId] });
    },
    onError: (err) => Alert.alert("Couldn't report review", (err as Error).message),
  });

  function confirmReport(reviewId: string) {
    Alert.alert("Report this review?", "Let Central Ops know this review is inappropriate or fake.", [
      { text: "Cancel", style: "cancel" },
      { text: "Report", style: "destructive", onPress: () => report.mutate(reviewId) },
    ]);
  }

  const reviews = reviewsQuery.data ?? [];

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Text className="text-lg font-semibold text-white">Reviews</Text>
        {summaryQuery.data && summaryQuery.data.count > 0 && (
          <>
            <StarRating value={Math.round(summaryQuery.data.average)} size="sm" />
            <Text className="text-sm text-white/60">
              {summaryQuery.data.average.toFixed(1)} ({summaryQuery.data.count})
            </Text>
          </>
        )}
      </View>

      {reviews.length === 0 ? (
        <Text className="text-white/60">No reviews yet.</Text>
      ) : (
        reviews.map((review) => (
          <View key={review.id} className="gap-2 rounded-lg bg-white/5 p-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <StarRating value={review.rating_overall} size="sm" />
                <Text className="text-sm text-white/60">{review.reviewerFirstName ?? "A customer"}</Text>
              </View>
              <Pressable onPress={() => confirmReport(review.id)}>
                <Text className="text-xs text-white/40">Report</Text>
              </Pressable>
            </View>
            {review.body && <Text className="text-white/80">{review.body}</Text>}
            {review.image_url && <Image source={{ uri: review.image_url }} className="h-32 w-full rounded-md" resizeMode="cover" />}
          </View>
        ))
      )}
    </View>
  );
}
