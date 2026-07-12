import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useCartBadgeCount } from "../lib/use-cart";

/** Persistent cart shortcut for screens pushed outside the tab bar (vendor
 * storefront, item detail) where the bottom tabs -- and therefore the Cart
 * tab -- aren't reachable otherwise. */
export function CartButton() {
  const router = useRouter();
  const countQuery = useCartBadgeCount();
  const count = countQuery.data ?? 0;

  return (
    <Pressable
      className="flex-row items-center gap-1.5"
      onPress={() => router.push("/(app)/(tabs)/cart")}
    >
      <Text className="text-white/60">Cart</Text>
      {count > 0 && (
        <View className="min-w-[18px] items-center rounded-full bg-cotto-accent px-1.5 py-0.5">
          <Text className="text-xs font-semibold text-white">{count}</Text>
        </View>
      )}
    </Pressable>
  );
}
