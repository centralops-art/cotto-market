import { ALLERGENS, ALLERGEN_LABELS, type Allergen } from "@cotto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Text, View, Pressable, ActivityIndicator, ScrollView, Switch } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useAuth } from "../../../src/lib/auth-context";

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6)
  );
}

export default function Account() {
  const { session, profile, refreshProfile } = useAuth();
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

  // Own key -- a different select() shape on vendor_delivery_profiles used
  // elsewhere (e.g. the tab-gating query) must not share this key.
  const deliveryProfileQuery = useQuery({
    queryKey: ["delivery_profile_for_cta", vendorQuery.data?.id],
    enabled: !!vendorQuery.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_delivery_profiles")
        .select("status, rejected_reason")
        .eq("vendor_id", vendorQuery.data!.id)
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

  const becomeDeliveryPartner = useMutation({
    mutationFn: async () => {
      if (!vendor) throw new Error("Become a cook vendor first.");
      // Starts as 'not_started' (table default, also force-set by the
      // guard_delivery_profile_owner_insert trigger regardless of payload) --
      // the delivery-onboarding wizard fills in the rest and self-submits to
      // 'delivery_pending_review' when complete.
      const { error } = await supabase.from("vendor_delivery_profiles").insert({ vendor_id: vendor.id });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["delivery_profile_for_cta", vendor?.id] });
      router.push("/(app)/delivery-onboarding");
    },
  });

  const toggleSmsOptIn = useMutation({
    mutationFn: async (value: boolean) => {
      if (!profile) return;
      const { error } = await supabase.from("profiles").update({ sms_opt_in: value }).eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: refreshProfile,
  });

  const toggleAllergen = useMutation({
    mutationFn: async (allergen: Allergen) => {
      if (!profile) return;
      const current = profile.allergen_preferences ?? [];
      const next = current.includes(allergen) ? current.filter((a) => a !== allergen) : [...current, allergen];
      const { error } = await supabase.from("profiles").update({ allergen_preferences: next }).eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: refreshProfile,
  });

  async function signOut() {
    await supabase.auth.signOut();
  }

  const vendor = vendorQuery.data;
  const myAllergens = profile?.allergen_preferences ?? [];

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 48, gap: 16 }}>
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
          <Pressable
            className="items-center rounded-lg bg-cotto-accent py-3"
            onPress={() => router.push("/(app)/vendor")}
          >
            <Text className="font-semibold text-white">
              {vendor.status === "active" ? "Manage Storefront" : "Build Your Storefront"}
            </Text>
          </Pressable>
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

      {vendor?.status === "active" && (
        <View className="mt-4 gap-2">
          <Text className="text-lg font-semibold text-white">Delivery Partner</Text>
          {deliveryProfileQuery.isLoading ? (
            <ActivityIndicator color="#D96A3E" />
          ) : !deliveryProfileQuery.data ? (
            <Pressable
              className="items-center rounded-lg border border-cotto-accent py-3 disabled:opacity-50"
              disabled={becomeDeliveryPartner.isPending}
              onPress={() => becomeDeliveryPartner.mutate()}
            >
              {becomeDeliveryPartner.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="font-semibold text-cotto-accent">Become a Delivery Partner</Text>
              )}
            </Pressable>
          ) : deliveryProfileQuery.data.status === "not_started" ? (
            <>
              {/* A rejected application also lands back at 'not_started' with
                  rejected_reason set (mirrors the vendor reject flow's
                  status: 'draft'), so it can be resubmitted -- surface the
                  reason here if present. */}
              {deliveryProfileQuery.data.rejected_reason && (
                <Text className="text-red-400">Application not approved: {deliveryProfileQuery.data.rejected_reason}</Text>
              )}
              <Pressable
                className="items-center rounded-lg border border-cotto-accent py-3"
                onPress={() => router.push("/(app)/delivery-onboarding")}
              >
                <Text className="font-semibold text-cotto-accent">Continue Delivery Application</Text>
              </Pressable>
            </>
          ) : deliveryProfileQuery.data.status === "delivery_pending_review" ? (
            <Text className="text-white/80">Delivery application pending review.</Text>
          ) : deliveryProfileQuery.data.status === "delivery_suspended" ? (
            <Text className="text-red-400">Delivery partner account suspended. Contact Central Ops for details.</Text>
          ) : (
            <Text className="text-white/80">Delivery Partner: Active</Text>
          )}
          {becomeDeliveryPartner.isError && (
            <Text className="text-red-400">{(becomeDeliveryPartner.error as Error).message}</Text>
          )}
        </View>
      )}

      <View className="mt-6 flex-row items-start gap-3 rounded-lg bg-white/5 p-4">
        <Switch
          value={profile?.sms_opt_in ?? false}
          disabled={!profile || toggleSmsOptIn.isPending}
          onValueChange={(value) => toggleSmsOptIn.mutate(value)}
        />
        <Text className="flex-1 text-sm text-white/70">
          Text me order status updates (3-8 messages per order). Msg &amp; data rates may apply. Reply STOP anytime to opt out.
        </Text>
      </View>

      <View className="mt-6 gap-2">
        <Text className="text-lg font-semibold text-white">Allergens to avoid</Text>
        <Text className="text-sm text-white/60">
          Menu items containing these will be hidden from your Browse tab.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {ALLERGENS.map((allergen) => {
            const selected = myAllergens.includes(allergen);
            return (
              <Pressable
                key={allergen}
                onPress={() => toggleAllergen.mutate(allergen)}
                className={`rounded-full border px-3 py-1.5 ${
                  selected ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"
                }`}
              >
                <Text className={selected ? "text-cotto-accent" : "text-white/70"}>{ALLERGEN_LABELS[allergen]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable className="mt-8 items-center py-3" onPress={signOut}>
        <Text className="text-white/60">Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
