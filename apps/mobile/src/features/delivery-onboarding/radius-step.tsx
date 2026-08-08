import { DELIVERY_RADIUS_OPTIONS, type DeliveryRadiusMiles } from "@cotto/shared";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

interface Props {
  defaultValue: DeliveryRadiusMiles | null;
  onBack: () => void;
  onNext: (values: { defaultRadiusMiles: DeliveryRadiusMiles }) => Promise<void>;
}

export function RadiusStep({ defaultValue, onBack, onNext }: Props) {
  const [radius, setRadius] = useState<DeliveryRadiusMiles | null>(defaultValue);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit() {
    if (!radius) {
      setFormError("Choose a delivery radius to continue.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onNext({ defaultRadiusMiles: radius });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4">
      <Text className="text-2xl font-bold text-white">How far are you willing to drive?</Text>
      <Text className="text-white/70">You can change this later from your delivery settings.</Text>

      <View className="flex-row flex-wrap gap-2">
        {DELIVERY_RADIUS_OPTIONS.map((miles) => {
          const selected = radius === miles;
          return (
            <Pressable
              key={miles}
              className={`rounded-full border px-4 py-2 ${selected ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
              onPress={() => setRadius(miles)}
            >
              <Text className={selected ? "text-cotto-accent" : "text-white/70"}>{miles} miles</Text>
            </Pressable>
          );
        })}
      </View>

      {formError && <Text className="text-red-400">{formError}</Text>}

      <View className="flex-row gap-3">
        <Pressable className="flex-1 items-center rounded-lg border border-white/20 py-3" onPress={onBack}>
          <Text className="text-white">Back</Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
          disabled={submitting}
          onPress={onSubmit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Next</Text>}
        </Pressable>
      </View>
    </View>
  );
}
