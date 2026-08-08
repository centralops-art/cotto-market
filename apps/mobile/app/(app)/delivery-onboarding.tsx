import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/lib/auth-context";
import { ProgressBar } from "../../src/features/delivery-onboarding/progress-bar";
import { LicenseStep } from "../../src/features/delivery-onboarding/license-step";
import { VehicleTypeStep } from "../../src/features/delivery-onboarding/vehicle-type-step";
import { InsuranceAttestationStep } from "../../src/features/delivery-onboarding/insurance-attestation-step";
import { AgreementStep } from "../../src/features/delivery-onboarding/agreement-step";
import { RadiusStep } from "../../src/features/delivery-onboarding/radius-step";
import { AvailabilityStep } from "../../src/features/delivery-onboarding/availability-step";
import type { Availability, Database, DeliveryRadiusMiles, VehicleType } from "@cotto/shared";

type DeliveryProfileUpdate = Database["public"]["Tables"]["vendor_delivery_profiles"]["Update"];

export default function DeliveryOnboarding() {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  // Own query key -- a differently-shaped select on vendors elsewhere in this
  // app (["vendor", ...] selects "*") must never share a key with this one.
  const vendorQuery = useQuery({
    queryKey: ["vendor_for_delivery_onboarding", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id").eq("owner_profile_id", session!.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const profileQuery = useQuery({
    queryKey: ["delivery_profile", vendorQuery.data?.id],
    enabled: !!vendorQuery.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_delivery_profiles")
        .select("*")
        .eq("vendor_id", vendorQuery.data!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const profile = profileQuery.data;

  useEffect(() => {
    if (profileQuery.isSuccess && (!profile || profile.status !== "not_started")) {
      router.replace("/(app)/(tabs)/account");
    }
  }, [profileQuery.isSuccess, profile, router]);

  async function patchProfile(patch: DeliveryProfileUpdate) {
    if (!profile) return;
    const { error } = await supabase.from("vendor_delivery_profiles").update(patch).eq("id", profile.id);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["delivery_profile", vendorQuery.data?.id] });
  }

  if (vendorQuery.isLoading || profileQuery.isLoading || !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-cotto-dark" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 64, paddingBottom: 96 }}>
        <ProgressBar step={step} />

        {step === 0 && (
          <LicenseStep
            userId={session!.user.id}
            defaultFrontUrl={profile.drivers_license_front_url}
            defaultBackUrl={profile.drivers_license_back_url}
            defaultExpiresOn={profile.drivers_license_expires_on}
            onNext={async (values) => {
              await patchProfile({
                drivers_license_front_url: values.driversLicenseFrontUrl,
                drivers_license_back_url: values.driversLicenseBackUrl,
                drivers_license_expires_on: values.driversLicenseExpiresOn,
              });
              setStep(1);
            }}
          />
        )}

        {step === 1 && (
          <VehicleTypeStep
            defaultValue={profile.vehicle_type as VehicleType | null}
            onBack={() => setStep(0)}
            onNext={async (values) => {
              await patchProfile({ vehicle_type: values.vehicleType });
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <InsuranceAttestationStep
            defaultAttested={!!profile.insurance_attested_at}
            onBack={() => setStep(1)}
            onNext={async () => {
              await patchProfile({ insurance_attested_at: new Date().toISOString() });
              setStep(3);
            }}
          />
        )}

        {step === 3 && (
          <AgreementStep
            onBack={() => setStep(2)}
            onNext={async () => {
              await patchProfile({ delivery_agreement_accepted_at: new Date().toISOString() });
              setStep(4);
            }}
          />
        )}

        {step === 4 && (
          <RadiusStep
            defaultValue={profile.default_radius_miles as DeliveryRadiusMiles | null}
            onBack={() => setStep(3)}
            onNext={async (values) => {
              await patchProfile({ default_radius_miles: values.defaultRadiusMiles });
              setStep(5);
            }}
          />
        )}

        {step === 5 && (
          <AvailabilityStep
            defaultValue={(profile.availability as Availability) ?? {}}
            onBack={() => setStep(4)}
            onSubmit={async (values) => {
              await patchProfile({
                availability: values.availability as unknown as DeliveryProfileUpdate["availability"],
                status: "delivery_pending_review",
              });
              router.replace("/(app)/(tabs)/account");
            }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
