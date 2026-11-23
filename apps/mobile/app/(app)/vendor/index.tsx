import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, View } from "react-native";
import { useVendor } from "../../../src/lib/use-vendor";

export default function VendorDashboard() {
  const router = useRouter();
  const { data: vendor, isLoading, patchVendor } = useVendor();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !vendor) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  const isPublished = vendor.status === "active";
  // Direct charges (§39): a kitchen needs a full-dashboard account and Stripe
  // Tax set up on it before checkout accepts orders.
  const paymentsNeedSetup =
    vendor.stripe_account_model !== "full" || !vendor.stripe_tax_ready_at || !vendor.stripe_charges_enabled;

  async function togglePublish() {
    setError(null);
    setPublishing(true);
    try {
      await patchVendor({ status: isPublished ? "unpublished" : "active" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <View className="flex-1 gap-4 bg-cotto-dark px-6 pt-16">
      <Pressable onPress={() => router.replace("/(app)/(tabs)/account")}>
        <Text className="text-white/60">&larr; Back to account</Text>
      </Pressable>
      <Text className="text-2xl font-bold text-white">{vendor.storefront_name}</Text>

      <View className="flex-row items-center justify-between rounded-lg bg-white/5 p-4">
        <View>
          <Text className="font-semibold text-white">{isPublished ? "Published" : "Unpublished"}</Text>
          <Text className="text-sm text-white/60">
            {isPublished ? "Customers can find and order from you." : "Only you can see your storefront right now."}
          </Text>
        </View>
        {publishing ? <ActivityIndicator color="#D96A3E" /> : <Switch value={isPublished} onValueChange={togglePublish} />}
      </View>
      {error && <Text className="text-red-400">{error}</Text>}

      {paymentsNeedSetup && (
        <Pressable className="rounded-lg border border-amber-300/60 bg-amber-300/10 p-4" onPress={() => router.push("/(app)/vendor/payments")}>
          <Text className="font-semibold text-amber-300">Finish payments setup</Text>
          <Text className="text-sm text-white/70">
            Customers can't check out from your kitchen until your Stripe account and sales tax are set up. Tap to finish.
          </Text>
        </Pressable>
      )}

      <Pressable className="items-center rounded-lg bg-cotto-accent py-3" onPress={() => router.push("/(app)/vendor/storefront")}>
        <Text className="font-semibold text-white">Edit Storefront</Text>
      </Pressable>
      <Pressable className="items-center rounded-lg bg-cotto-accent py-3" onPress={() => router.push("/(app)/vendor/menu")}>
        <Text className="font-semibold text-white">Edit Menu</Text>
      </Pressable>
      <Pressable className="items-center rounded-lg border border-white/20 py-3" onPress={() => router.push("/(app)/vendor/preview")}>
        <Text className="text-white">Preview Storefront</Text>
      </Pressable>
      <Pressable className="items-center rounded-lg border border-white/20 py-3" onPress={() => router.push("/(app)/vendor/payments")}>
        <Text className="text-white">Payments &amp; Sales Tax</Text>
      </Pressable>
    </View>
  );
}
