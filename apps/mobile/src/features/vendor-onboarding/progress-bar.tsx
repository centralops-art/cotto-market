import { Text, View } from "react-native";

const STEP_LABELS = ["Business", "Address", "CFPM cert", "Cottage food", "Payouts"];

export function ProgressBar({ step }: { step: number }) {
  return (
    <View className="mb-6 gap-2">
      <View className="flex-row gap-1">
        {STEP_LABELS.map((_, i) => (
          <View key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-cotto-accent" : "bg-white/20"}`} />
        ))}
      </View>
      <Text className="text-sm text-white/60">
        Step {step + 1} of {STEP_LABELS.length}: {STEP_LABELS[step]}
      </Text>
    </View>
  );
}
