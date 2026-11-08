import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { supabase } from "../lib/supabase";

const SEEN_KEY = "cottage_food_disclaimer_seen";

/** Spec compliance item: "Cottage food disclaimer shown on each food item
 * detail and at checkout." Founder's call: rather than repeat it on every
 * item/checkout screen, show it once as a popup the first time a customer
 * taps the "Home cook" filter on Browse -- the text is also always
 * available in the site's Terms and Conditions. Device-persisted (not
 * tied to an account) via AsyncStorage, same storage already used for the
 * Supabase session (see lib/supabase.ts). */
export function useCottageFoodDisclaimer() {
  const [visible, setVisible] = useState(false);

  async function showIfUnseen() {
    const seen = await AsyncStorage.getItem(SEEN_KEY);
    if (!seen) setVisible(true);
  }

  async function dismiss() {
    setVisible(false);
    await AsyncStorage.setItem(SEEN_KEY, "true");
  }

  return { visible, showIfUnseen, dismiss };
}

export function CottageFoodDisclaimerModal({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const settingsQuery = useQuery({
    queryKey: ["system_settings", "cottage_food_disclaimer_md"],
    enabled: visible,
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("cottage_food_disclaimer_md").eq("id", 1).single();
      if (error) throw error;
      return data.cottage_food_disclaimer_md;
    },
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View className="flex-1 items-center justify-center bg-black/70 p-6">
        <View className="w-full max-w-sm gap-4 rounded-xl bg-cotto-dark p-5">
          <Text className="text-xl font-bold text-white">Cottage food disclaimer</Text>
          {settingsQuery.isLoading ? (
            <ActivityIndicator color="#D96A3E" />
          ) : (
            <Text className="text-white/80">{settingsQuery.data}</Text>
          )}
          <Pressable className="items-center rounded-lg bg-cotto-accent py-3" onPress={onDismiss}>
            <Text className="font-semibold text-white">Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
