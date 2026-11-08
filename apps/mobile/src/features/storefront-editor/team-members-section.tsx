import { zodResolver } from "@hookform/resolvers/zod";
import { teamMemberSchema, type Database, type TeamMemberInput } from "@cotto/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { uploadVendorImage } from "../../lib/upload-image";
import { useTeamDriverRecords, type TeamDriver } from "../../lib/use-team-drivers";

type TeamMember = Database["public"]["Tables"]["vendor_team_members"]["Row"];

const DRIVER_STATUS_LABELS: Record<TeamDriver["status"], string> = {
  pending_review: "Driver: waiting for Cotto review",
  active: "Driver: approved",
  rejected: "Driver: changes needed",
  suspended: "Driver: suspended",
};

function driverStatusText(record: TeamDriver | undefined): string | null {
  if (!record) return null;
  if (record.status === "active" && record.drivers_license_expires_on < new Date().toISOString().slice(0, 10)) {
    return "Driver: license expired";
  }
  return DRIVER_STATUS_LABELS[record.status];
}

export function TeamMembersSection({ vendorId }: { vendorId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TeamMemberInput>({
    resolver: zodResolver(teamMemberSchema),
    defaultValues: { displayName: "", roleTitle: "", bio: "" },
  });

  const membersQuery = useQuery({
    queryKey: ["vendor_team_members", vendorId],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("vendor_team_members")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("sort_order");
      if (fetchError) throw fetchError;
      return data;
    },
  });

  // Family drivers (migration 0060) only make sense once the storefront
  // itself has applied to deliver -- they deliver under its approval.
  const deliveryProfileQuery = useQuery({
    queryKey: ["delivery_profile_status_for_team", vendorId],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("vendor_delivery_profiles")
        .select("status")
        .eq("vendor_id", vendorId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      return data;
    },
  });
  const canHaveFamilyDrivers = !!deliveryProfileQuery.data && deliveryProfileQuery.data.status !== "not_started";
  const driversQuery = useTeamDriverRecords(vendorId);
  const driverByMember = new Map((driversQuery.data ?? []).map((d) => [d.team_member_id, d]));

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["vendor_team_members", vendorId] });
    await queryClient.invalidateQueries({ queryKey: ["vendor_team_drivers", vendorId] });
    await queryClient.invalidateQueries({ queryKey: ["approved_team_drivers", vendorId] });
  }

  async function onAdd(values: TeamMemberInput) {
    setError(null);
    try {
      const { error: insertError } = await supabase.from("vendor_team_members").insert({
        vendor_id: vendorId,
        display_name: values.displayName,
        role_title: values.roleTitle || null,
        bio: values.bio || null,
        sort_order: membersQuery.data?.length ?? 0,
      });
      if (insertError) throw insertError;
      reset();
      setAdding(false);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteMember(id: string) {
    await supabase.from("vendor_team_members").delete().eq("id", id);
    await refresh();
  }

  function onDelete(member: TeamMember) {
    if (!driverByMember.has(member.id)) {
      deleteMember(member.id);
      return;
    }
    Alert.alert(
      `Remove ${member.display_name}?`,
      `This also removes ${member.display_name}'s driver approval. Past deliveries keep their name.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => deleteMember(member.id) },
      ]
    );
  }

  async function onUploadPhoto(member: TeamMember) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const url = await uploadVendorImage(vendorId, asset.uri, asset.mimeType, "team");
    await supabase.from("vendor_team_members").update({ photo_url: url }).eq("id", member.id);
    await refresh();
  }

  return (
    <View className="gap-3 border-b border-white/10 pb-6">
      <Text className="text-lg font-bold text-white">Team</Text>
      {deliveryProfileQuery.isSuccess && !canHaveFamilyDrivers && (membersQuery.data?.length ?? 0) > 0 && (
        <Text className="text-sm text-white/60">
          Want family members to deliver your orders? Apply to deliver first (Account → Become a Delivery Partner). Once you
          have, each team member here gets a &quot;Set up as a family driver&quot; option.
        </Text>
      )}

      {membersQuery.data?.map((member) => (
        <View key={member.id} className="flex-row items-center gap-3 rounded-lg bg-white/5 p-3">
          {member.photo_url ? (
            <Image source={{ uri: member.photo_url }} className="h-12 w-12 rounded-full" />
          ) : (
            <View className="h-12 w-12 rounded-full bg-white/10" />
          )}
          <View className="flex-1">
            <Text className="font-semibold text-white">{member.display_name}</Text>
            {member.role_title && <Text className="text-sm text-white/60">{member.role_title}</Text>}
            {canHaveFamilyDrivers && (
              <Pressable
                onPress={() =>
                  router.push({ pathname: "/(app)/vendor/team-driver/[memberId]", params: { memberId: member.id } })
                }
              >
                <Text className="text-sm text-cotto-accent">
                  {driverStatusText(driverByMember.get(member.id)) ?? "Set up as a family driver"}
                  {driverByMember.has(member.id) ? " · Update" : ""}
                </Text>
              </Pressable>
            )}
            {driverByMember.get(member.id)?.rejected_reason && (
              <Text className="text-xs text-red-400">{driverByMember.get(member.id)?.rejected_reason}</Text>
            )}
          </View>
          <Pressable onPress={() => onUploadPhoto(member)}>
            <Text className="text-cotto-accent">Photo</Text>
          </Pressable>
          <Pressable onPress={() => onDelete(member)}>
            <Text className="text-red-400">Remove</Text>
          </Pressable>
        </View>
      ))}

      {adding ? (
        <View className="gap-2 rounded-lg bg-white/5 p-3">
          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, value } }) => (
              <TextInput
                className="rounded-md bg-white/10 px-3 py-2 text-white"
                placeholder="Name"
                placeholderTextColor="#9CA3AF"
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.displayName && <Text className="text-red-400">{errors.displayName.message}</Text>}
          <Controller
            control={control}
            name="roleTitle"
            render={({ field: { onChange, value } }) => (
              <TextInput
                className="rounded-md bg-white/10 px-3 py-2 text-white"
                placeholder="Role (optional)"
                placeholderTextColor="#9CA3AF"
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          <Controller
            control={control}
            name="bio"
            render={({ field: { onChange, value } }) => (
              <TextInput
                className="rounded-md bg-white/10 px-3 py-2 text-white"
                placeholder="Bio (optional)"
                placeholderTextColor="#9CA3AF"
                multiline
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {error && <Text className="text-red-400">{error}</Text>}
          <View className="flex-row gap-3">
            <Pressable className="flex-1 items-center rounded-lg border border-white/20 py-2" onPress={() => setAdding(false)}>
              <Text className="text-white">Cancel</Text>
            </Pressable>
            <Pressable
              className="flex-1 items-center rounded-lg bg-cotto-accent py-2 disabled:opacity-50"
              disabled={isSubmitting}
              onPress={handleSubmit(onAdd)}
            >
              {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Add</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable className="items-center rounded-lg border border-white/20 py-3" onPress={() => setAdding(true)}>
          <Text className="text-white">Add team member</Text>
        </Pressable>
      )}
    </View>
  );
}
