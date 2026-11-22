import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useKeyboardAwareScroll } from "../../../src/lib/use-keyboard-aware-scroll";
import { useVendor } from "../../../src/lib/use-vendor";
import { PaymentsSetup } from "../../../src/features/vendor-payments/payments-setup";

export default function VendorPayments() {
  const keyboard = useKeyboardAwareScroll();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: vendor, isLoading } = useVendor();

  // Refresh the vendor row (stripe_tax_ready_at etc.) so the dashboard's
  // "needs setup" banner updates when the cook comes back.
  const handleStatus = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["vendor"] });
  }, [queryClient]);

  if (isLoading || !vendor) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cotto-dark">
      <ScrollView
        ref={keyboard.scrollRef}
        onScroll={keyboard.onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 24, paddingTop: 56, paddingBottom: 96 + keyboard.keyboardHeight, gap: 24 }}
      >
        <Pressable onPress={() => router.back()}>
          <Text className="text-white/60">&larr; Back</Text>
        </Pressable>
        <Text className="text-2xl font-bold text-white">Payments &amp; sales tax</Text>
        <PaymentsSetup vendorId={vendor.id} onStatusChange={handleStatus} />
      </ScrollView>
    </View>
  );
}
