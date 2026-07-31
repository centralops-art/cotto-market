import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

/** Simple per-suborder message thread, shared by the cook's Kitchen detail
 * screen and the customer's order-tracking detail screen. RLS (migration
 * 0010) already restricts reads/writes to the two parties on the suborder. */
export function MessageThread({ vendorSuborderId, otherProfileId }: { vendorSuborderId: string; otherProfileId: string }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const messagesQuery = useQuery({
    queryKey: ["messages", vendorSuborderId],
    enabled: !!profile,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("vendor_suborder_id", vendorSuborderId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const messages = messagesQuery.data ?? [];

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", vendorSuborderId] }),
  });

  useEffect(() => {
    if (!profile) return;
    const unreadIncoming = messages.filter((m) => m.to_profile_id === profile.id && !m.read_at).map((m) => m.id);
    if (unreadIncoming.length > 0) markRead.mutate(unreadIncoming);
  }, [messages.length, profile?.id]);

  const send = useMutation({
    mutationFn: async () => {
      if (!profile || !draft.trim()) return;
      const { error } = await supabase.from("messages").insert({
        vendor_suborder_id: vendorSuborderId,
        from_profile_id: profile.id,
        to_profile_id: otherProfileId,
        body: draft.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["messages", vendorSuborderId] });
    },
  });

  return (
    <View className="gap-3 rounded-lg bg-white/5 p-4">
      <Text className="text-lg font-semibold text-white">Messages</Text>

      {messagesQuery.isLoading ? (
        <ActivityIndicator color="#D96A3E" />
      ) : messages.length === 0 ? (
        <Text className="text-sm text-white/50">No messages yet.</Text>
      ) : (
        <View className="gap-2">
          {messages.map((m) => {
            const mine = m.from_profile_id === profile?.id;
            return (
              <View key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 ${mine ? "self-end bg-cotto-accent/30" : "self-start bg-white/10"}`}>
                <Text className="text-white">{m.body}</Text>
                <Text className="mt-1 text-xs text-white/40">{new Date(m.created_at).toLocaleString()}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View className="flex-row items-center gap-2">
        <TextInput
          className="flex-1 rounded-md bg-white/10 px-3 py-2 text-white"
          placeholder="Write a message..."
          placeholderTextColor="#9CA3AF"
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <Pressable
          className="items-center rounded-md bg-cotto-accent px-4 py-2 disabled:opacity-50"
          disabled={!draft.trim() || send.isPending}
          onPress={() => send.mutate()}
        >
          {send.isPending ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Send</Text>}
        </Pressable>
      </View>
      {send.isError && <Text className="text-sm text-red-400">{(send.error as Error).message}</Text>}
    </View>
  );
}
