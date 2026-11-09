import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { VehicleType } from "@cotto/shared";
import { supabase } from "../../../../src/lib/supabase";
import { useAuth } from "../../../../src/lib/auth-context";
import { ProgressBar } from "../../../../src/features/delivery-onboarding/progress-bar";
import { LicenseStep } from "../../../../src/features/delivery-onboarding/license-step";
import { VehicleTypeStep } from "../../../../src/features/delivery-onboarding/vehicle-type-step";
import { InsuranceAttestationStep } from "../../../../src/features/delivery-onboarding/insurance-attestation-step";
import { AgreementStep } from "../../../../src/features/delivery-onboarding/agreement-step";

const STEP_LABELS = ["License", "Vehicle", "Insurance", "Agreement"];

// Family / team-member driver application (migration 0060). Filled in on the
// vendor's account, with the family member present -- they have no login of
// their own. Nothing is saved until the last step, which inserts or updates
// the vendor_team_drivers row; the DB guard trigger always lands a non-admin
// write as pending_review.
export default function TeamDriverSetup() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [license, setLicense] = useState<{ front: string; back: string; expiresOn: string } | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);

  const memberQuery = useQuery({
    queryKey: ["team_member_for_driver_setup", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_team_members")
        .select("id, vendor_id, display_name")
        .eq("id", memberId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const existingQuery = useQuery({
    queryKey: ["team_driver_for_setup", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendor_team_drivers").select("*").eq("team_member_id", memberId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (memberQuery.isLoading || existingQuery.isLoading || !memberQuery.data || !session) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  const member = memberQuery.data;
  const existing = existingQuery.data;
  const firstName = member.display_name.split(" ")[0];

  async function submit() {
    if (!license || !vehicleType) throw new Error("Missing license or vehicle details.");
    const now = new Date().toISOString();
    const values = {
      team_member_id: member.id,
      vendor_id: member.vendor_id,
      drivers_license_front_url: license.front,
      drivers_license_back_url: license.back,
      drivers_license_expires_on: license.expiresOn,
      vehicle_type: vehicleType,
      insurance_attested_at: now,
      delivery_agreement_accepted_at: now,
    };
    const { error } = existing
      ? await supabase.from("vendor_team_drivers").update(values).eq("id", existing.id)
      : await supabase.from("vendor_team_drivers").insert(values);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["vendor_team_drivers", member.vendor_id] });
    await queryClient.invalidateQueries({ queryKey: ["approved_team_drivers", member.vendor_id] });
    await queryClient.invalidateQueries({ queryKey: ["team_driver_for_setup", memberId] });
    router.back();
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-cotto-dark" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 64, paddingBottom: 96 }}>
        <Pressable className="mb-4" onPress={() => router.back()}>
          <Text className="text-white/60">&larr; Back</Text>
        </Pressable>
        <Text className="mb-2 text-white/70">
          Setting up {member.display_name} as a family driver. Fill this in together with {firstName} -- Cotto reviews it before{" "}
          {firstName} can be picked for deliveries.
        </Text>
        {existing?.status === "active" && (
          <Text className="mb-2 text-yellow-400">Saving changes sends {firstName}'s driver info back for review.</Text>
        )}

        <ProgressBar step={step} labels={STEP_LABELS} />

        {step === 0 && (
          <LicenseStep
            userId={session.user.id}
            subfolder={`team/${member.id}`}
            heading={`Upload ${firstName}'s driver's license`}
            defaultFrontUrl={license?.front ?? existing?.drivers_license_front_url ?? null}
            defaultBackUrl={license?.back ?? existing?.drivers_license_back_url ?? null}
            defaultExpiresOn={license?.expiresOn ?? existing?.drivers_license_expires_on ?? null}
            onNext={async (values) => {
              setLicense({
                front: values.driversLicenseFrontUrl,
                back: values.driversLicenseBackUrl,
                expiresOn: values.driversLicenseExpiresOn,
              });
              setStep(1);
            }}
          />
        )}

        {step === 1 && (
          <VehicleTypeStep
            defaultValue={vehicleType ?? (existing?.vehicle_type as VehicleType | undefined) ?? null}
            onBack={() => setStep(0)}
            onNext={async (values) => {
              setVehicleType(values.vehicleType);
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <InsuranceAttestationStep defaultAttested={false} onBack={() => setStep(1)} onNext={async () => setStep(3)} />
        )}

        {step === 3 && <AgreementStep onBack={() => setStep(2)} onNext={submit} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
