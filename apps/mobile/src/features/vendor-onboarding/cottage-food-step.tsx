import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";

interface Props {
  onNext: () => Promise<void>;
  onBack: () => void;
}

export function CottageFoodStep({ onNext, onBack }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["system_settings", "cottage_food_disclaimer_md"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("cottage_food_disclaimer_md")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data.cottage_food_disclaimer_md;
    },
  });

  async function onSubmit() {
    if (!agreed) {
      setFormError("You must accept the cottage food law agreement to continue.");
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
      <Text className="text-2xl font-bold text-white">Cottage food law agreement</Text>

      <ScrollView className="max-h-64 rounded-lg bg-white/10 p-4">
        {settingsQuery.isLoading ? (
          <ActivityIndicator color="#D96A3E" />
        ) : (
          <Text className="text-white/80">{settingsQuery.data}</Text>
        )}
      </ScrollView>

      <Pressable className="flex-row items-center gap-3" onPress={() => setAgreed(!agreed)}>
        <View
          className={`h-6 w-6 items-center justify-center rounded border ${agreed ? "border-cotto-accent bg-cotto-accent" : "border-white/40"}`}
        >
          {agreed && <Text className="text-xs text-white">✓</Text>}
        </View>
        <Text className="flex-1 text-white/80">I have read and agree to the cottage food law disclaimer.</Text>
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
