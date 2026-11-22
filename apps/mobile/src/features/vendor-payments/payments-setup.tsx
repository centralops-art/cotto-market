import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { functionErrorMessage } from "../../lib/invoke-function";

export interface PaymentsStatus {
  hasAccount: boolean;
  needsNewAccount: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  taxReady: boolean;
  ilTaxAccountId: string | null;
}

interface Props {
  vendorId: string;
  /** Called whenever status loads or changes; `ready` = Stripe onboarding done and tax set up. */
  onStatusChange?: (status: PaymentsStatus, ready: boolean) => void;
}

/**
 * Two-part Stripe setup for a cook under Direct charges (HANDOFF.md §39):
 * 1. Their own full-dashboard Stripe account (hosted Stripe onboarding).
 * 2. Sales tax: Cotto sets up Stripe Tax on that account from their
 *    Illinois Department of Revenue account ID.
 * Used by the onboarding wizard and the vendor Payments screen.
 */
export function PaymentsSetup({ vendorId, onStatusChange }: Props) {
  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [savingTax, setSavingTax] = useState(false);
  const [taxId, setTaxId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const applyStatus = useCallback(
    (next: PaymentsStatus) => {
      setStatus(next);
      if (next.ilTaxAccountId) setTaxId((current) => current || next.ilTaxAccountId!);
      onStatusChange?.(next, next.detailsSubmitted && next.taxReady);
    },
    [onStatusChange]
  );

  const checkStatus = useCallback(
    async (explicit: boolean) => {
      setChecking(true);
      setError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke("stripe-connect-status", { body: { vendorId } });
        if (fnError) throw new Error(await functionErrorMessage(fnError));
        if (data?.error) {
          setError(data.error);
          return;
        }
        applyStatus(data as PaymentsStatus);
        if (explicit && data.hasAccount && !data.detailsSubmitted) {
          setError("Stripe setup isn't finished yet. Complete it in the browser, then check again.");
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setChecking(false);
      }
    },
    [vendorId, applyStatus]
  );

  useEffect(() => {
    void checkStatus(false);
  }, [checkStatus]);

  async function connectWithStripe() {
    setError(null);
    setConnecting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("stripe-connect-onboarding", { body: { vendorId } });
      if (fnError) throw new Error(await functionErrorMessage(fnError));
      if (data?.error) {
        setError(data.error);
        return;
      }
      await WebBrowser.openAuthSessionAsync(data.url, "cotto://vendor-onboarding");
      await checkStatus(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  async function saveTax() {
    setError(null);
    setSavingTax(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("stripe-connect-tax-setup", {
        body: { vendorId, ilTaxAccountId: taxId },
      });
      if (fnError) throw new Error(await functionErrorMessage(fnError));
      if (data?.error) {
        setError(data.error);
        return;
      }
      if (status) applyStatus({ ...status, taxReady: true, ilTaxAccountId: data.ilTaxAccountId });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingTax(false);
    }
  }

  if (!status) {
    return (
      <View className="items-center py-6">
        {error ? <Text className="text-red-400">{error}</Text> : <ActivityIndicator color="#D96A3E" />}
      </View>
    );
  }

  const stripeDone = status.detailsSubmitted;

  return (
    <View className="gap-6">
      <View className="gap-3">
        <Text className="text-lg font-semibold text-white">1. Your Stripe account {stripeDone ? "✓" : ""}</Text>
        <Text className="text-white/70">
          Customers pay your kitchen directly through your own Stripe account. You'll get your own Stripe dashboard, and
          Stripe's card processing fees come out of your sales. Delivery payouts go to this account too.
        </Text>
        {status.needsNewAccount && (
          <Text className="text-amber-300">
            Cotto has changed how payments work, so you need to set up a new Stripe account. It takes a few minutes.
          </Text>
        )}
        {!stripeDone && (
          <>
            <Pressable
              className="items-center rounded-lg border border-white/20 py-3 disabled:opacity-50"
              disabled={connecting}
              onPress={connectWithStripe}
            >
              {connecting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white">{status.hasAccount ? "Continue Stripe setup" : "Connect with Stripe"}</Text>
              )}
            </Pressable>
            {status.hasAccount && (
              <Pressable
                className="items-center rounded-lg border border-white/20 py-3 disabled:opacity-50"
                disabled={checking}
                onPress={() => checkStatus(true)}
              >
                {checking ? <ActivityIndicator color="#fff" /> : <Text className="text-white">I've finished -- check status</Text>}
              </Pressable>
            )}
          </>
        )}
      </View>

      <View className={`gap-3 ${stripeDone ? "" : "opacity-50"}`}>
        <Text className="text-lg font-semibold text-white">2. Sales tax {status.taxReady ? "✓" : ""}</Text>
        <Text className="text-white/70">
          You collect Illinois sales tax on your food. Enter your Illinois Department of Revenue account ID and Cotto will
          set up tax collection on your Stripe account.
        </Text>
        <TextInput
          className="rounded-lg bg-white/10 px-4 py-3 text-white"
          placeholder="IL account ID (1234-5678)"
          placeholderTextColor="#9CA3AF"
          keyboardType="number-pad"
          editable={stripeDone && !savingTax}
          value={taxId}
          onChangeText={setTaxId}
          maxLength={9}
        />
        <Pressable
          className="items-center rounded-lg border border-white/20 py-3 disabled:opacity-50"
          disabled={!stripeDone || savingTax || taxId.trim().length === 0}
          onPress={saveTax}
        >
          {savingTax ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white">{status.taxReady ? "Update sales tax setup" : "Set up sales tax"}</Text>
          )}
        </Pressable>
      </View>

      {error && <Text className="text-red-400">{error}</Text>}
    </View>
  );
}
