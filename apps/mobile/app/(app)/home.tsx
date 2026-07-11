import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Text, View, Pressable, ActivityIndicator } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/lib/auth-context";

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6)
  );
}

export default function Home() {
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  const vendorQuery = useQuery({
    queryKey: ["vendor", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("owner_profile_id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const becomeVendor = useMutation({
    mutationFn: async () => {
      if (!profile) {
        throw new Error("Your profile hasn't finished loading yet -- try signing out and back in.");
      }

      const { data: region, error: regionError } = await supabase
        .from("regions")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (regionError) throw regionError;
      if (!region) throw new Error("No active region is configured yet.");

      // Starts as 'draft' (table default) -- the onboarding wizard fills in
      // the rest and self-submits to 'pending_review' when complete.
      const storefrontName = `${profile.full_name}'s Kitchen`;
      const { error } = await supabase.from("vendors").insert({
        owner_profile_id: session!.user.id,
        region_id: region.id,
        storefront_name: storefrontName,
        slug: slugify(storefrontName),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["vendor", session?.user.id] });
      router.push("/(app)/vendor-onboarding");
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
  }

  const vendor = vendorQuery.data;

  return (
    <View className="flex-1 justify-center gap-4 bg-cotto-dark px-6">
      <Text className="text-3xl font-bold text-cotto-accent">Cotto</Text>
      <Text className="text-white">Welcome, {profile?.full_name ?? "there"}.</Text>

      {vendorQuery.isLoading ? (
        <ActivityIndicator color="#D96A3E" />
      ) : !profile ? (
        <Text className="text-red-400">
          We couldn't load your profile. Try signing out and back in.
        </Text>
      ) : vendor ? (
        vendor.status === "draft" ? (
          <Pressable
            className="items-center rounded-lg bg-cotto-accent py-3"
            onPress={() => router.push("/(app)/vendor-onboarding")}
          >
            <Text className="font-semibold text-white">Continue Application</Text>
          </Pressable>
        ) : vendor.status === "pending_review" ? (
          <Text className="text-white/80">Application pending review.</Text>
        ) : vendor.status === "suspended" ? (
          <Text className="text-red-400">Your vendor account is suspended.</Text>
        ) : (
          <Text className="text-white/80">Vendor dashboard coming in Phase 3.</Text>
        )
      ) : (
        <Pressable
          className="items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
          disabled={becomeVendor.isPending}
          onPress={() => becomeVendor.mutate()}
        >
          {becomeVendor.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-semibold text-white">Become a Vendor</Text>
          )}
        </Pressable>
      )}
      {becomeVendor.isError && <Text className="text-red-400">{(becomeVendor.error as Error).message}</Text>}

      <Pressable className="mt-8 items-center py-3" onPress={signOut}>
        <Text className="text-white/60">Sign out</Text>
      </Pressable>
    </View>
  );
}
