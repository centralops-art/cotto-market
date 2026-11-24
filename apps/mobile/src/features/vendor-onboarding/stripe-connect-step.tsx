import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { PaymentsSetup, type PaymentsStatus } from "../vendor-payments/payments-setup";

interface Props {
  vendorId: string;
  onSubmit: () => Promise<void>;
  onBack: () => void;
}

export function StripeConnectStep({ vendorId, onSubmit, onBack }: Props) {
  const [ready, setReady] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleStatus = useCallback((_status: PaymentsStatus, isReady: boolean) => setReady(isReady), []);

  async function submitApplication() {
    setSubmitting(true);
    setFormError(null);
    try {
      await onSubmit();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4">
      <Text className="text-2xl font-bold text-white">Set up payments</Text>

      <PaymentsSetup vendorId={vendorId} onStatusChange={handleStatus} />

      {formError && <Text className="text-red-400">{formError}</Text>}

      <View className="flex-row gap-3">
        <Pressable className="flex-1 items-center rounded-lg border border-white/20 py-3" onPress={onBack}>
          <Text className="text-white">Back</Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
          disabled={submitting || !ready}
          onPress={submitApplication}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-center font-semibold text-white">Submit Application</Text>}
        </Pressable>
      </View>
    </View>
  );
}
