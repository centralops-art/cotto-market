import { Pressable, Text, View } from "react-native";

interface Props {
  value: number;
  onChange?: (value: number) => void;
  size?: "sm" | "lg";
}

/** Five tappable stars when onChange is given, a read-only display otherwise. */
export function StarRating({ value, onChange, size = "lg" }: Props) {
  const starClass = size === "lg" ? "text-2xl" : "text-base";
  return (
    <View className="flex-row gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} disabled={!onChange} onPress={() => onChange?.(star)}>
          <Text className={`${starClass} ${star <= value ? "text-cotto-accent" : "text-white/20"}`}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}
