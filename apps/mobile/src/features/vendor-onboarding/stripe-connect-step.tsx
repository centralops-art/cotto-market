import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";

interface Props {
  vendorId: string;
  onSubmit: () => Promise<void>;
  onBack: () => void;
}

export function StripeConnectStep({ vendorId, onSubmit, onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [detailsSubmitted, setDetailsSubmitted] = useState(false);
  const [stripeUnconfigured, setStripeUnconfigured] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function connectWithStripe() {
    setFormError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-onboarding", {
        body: { vendorId },
      });
      if (error) throw error;
      if (data?.error) {
        if (String(data.error).includes("isn't configured")) setStripeUnconfigured(true);
        setFormError(data.error);
        return;
      }
      await WebBrowser.openAuthSessionAsync(data.url, "cotto://vendor-onboarding");
      await checkStatus();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function checkStatus() {
    setChecking(true);
    setFormError(null);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-status", { body: { vendorId } });
      if (error) throw error;
      if (data?.error) {
        setFormError(data.error);
        return;
      }
      setDetailsSubmitted(!!data.detailsSubmitted);
      if (!data.detailsSubmitted) {
        setFormError("Stripe onboarding isn't finished yet. Complete it in the browser, then check again.");
      }
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

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
      <Text className="text-2xl font-bold text-white">Set up payouts</Text>
      <Text className="text-white/70">
        Stripe handles identity verification and bank details for both your cooking revenue and any delivery payouts.
      </Text>

      <Pressable
        className="items-center rounded-lg border border-white/20 py-3 disabled:opacity-50"
        disabled={loading}
        onPress={connectWithStripe}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Connect with Stripe</Text>}
      </Pressable>

      <Pressable
        className="items-center rounded-lg border border-white/20 py-3 disabled:opacity-50"
        disabled={checking}
        onPress={checkStatus}
      >
        {checking ? <ActivityIndicator color="#fff" /> : <Text className="text-white">I've finished -- check status</Text>}
      </Pressable>

      {formError && <Text className="text-red-400">{formError}</Text>}

      <View className="flex-row gap-3">
        <Pressable className="flex-1 items-center rounded-lg border border-white/20 py-3" onPress={onBack}>
          <Text className="text-white">Back</Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
          disabled={submitting || (!detailsSubmitted && !stripeUnconfigured)}
          onPress={submitApplication}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Submit Application</Text>}
        </Pressable>
      </View>
      {stripeUnconfigured && (
        <Text className="text-center text-xs text-white/50">
          Stripe isn't configured yet -- submitting now skips payout setup (founder TODO).
        </Text>
      )}
    </View>
  );
}
