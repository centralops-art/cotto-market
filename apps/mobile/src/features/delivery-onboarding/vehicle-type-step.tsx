import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type VehicleType } from "@cotto/shared";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

interface Props {
  defaultValue: VehicleType | null;
  onBack: () => void;
  onNext: (values: { vehicleType: VehicleType }) => Promise<void>;
}

export function VehicleTypeStep({ defaultValue, onBack, onNext }: Props) {
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(defaultValue);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit() {
    if (!vehicleType) {
      setFormError("Choose a vehicle type to continue.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onNext({ vehicleType });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4">
      <Text className="text-2xl font-bold text-white">What will you drive?</Text>
      <Text className="text-white/70">Bike and on-foot are great options for short-radius deliveries.</Text>

      <View className="flex-row flex-wrap gap-2">
        {VEHICLE_TYPES.map((type) => {
          const selected = vehicleType === type;
          return (
            <Pressable
              key={type}
              className={`rounded-full border px-3 py-2 ${selected ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
              onPress={() => setVehicleType(type)}
            >
              <Text className={selected ? "text-cotto-accent" : "text-white/70"}>{VEHICLE_TYPE_LABELS[type]}</Text>
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
