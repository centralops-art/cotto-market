import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

interface Props {
  defaultAttested: boolean;
  onBack: () => void;
  onNext: () => Promise<void>;
}

export function InsuranceAttestationStep({ defaultAttested, onBack, onNext }: Props) {
  const [attested, setAttested] = useState(defaultAttested);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit() {
    if (!attested) {
      setFormError("You must attest to insurance coverage to continue.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onNext();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4">
      <Text className="text-2xl font-bold text-white">Insurance</Text>

      <Pressable className="flex-row items-center gap-3" onPress={() => setAttested(!attested)}>
        <View
          className={`h-6 w-6 items-center justify-center rounded border ${attested ? "border-cotto-accent bg-cotto-accent" : "border-white/40"}`}
        >
          {attested && <Text className="text-xs text-white">✓</Text>}
        </View>
        <Text className="flex-1 text-white/80">
          I have valid auto insurance covering occasional commercial use OR I am not using a motor vehicle.
        </Text>
      </Pressable>

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
