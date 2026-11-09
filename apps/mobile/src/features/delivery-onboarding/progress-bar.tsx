import { Text, View } from "react-native";

const STEP_LABELS = ["License", "Vehicle", "Insurance", "Agreement", "Radius", "Availability"];

export function ProgressBar({ step, labels = STEP_LABELS }: { step: number; labels?: string[] }) {
  return (
    <View className="mb-6 gap-2">
      <View className="flex-row gap-1">
        {labels.map((_, i) => (
          <View key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-cotto-accent" : "bg-white/20"}`} />
        ))}
      </View>
      <Text className="text-sm text-white/60">
        Step {step + 1} of {labels.length}: {labels[step]}
      </Text>
    </View>
  );
}
