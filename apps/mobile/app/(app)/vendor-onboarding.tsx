import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/lib/auth-context";
import { ProgressBar } from "../../src/features/vendor-onboarding/progress-bar";
import { BusinessBasicsStep } from "../../src/features/vendor-onboarding/business-basics-step";
import { ServiceAddressStep, type GeocodedAddress } from "../../src/features/vendor-onboarding/service-address-step";
import { CfpmCertStep } from "../../src/features/vendor-onboarding/cfpm-cert-step";
import { CottageFoodStep } from "../../src/features/vendor-onboarding/cottage-food-step";
import { StripeConnectStep } from "../../src/features/vendor-onboarding/stripe-connect-step";
import type { BusinessBasicsInput, Database } from "@cotto/shared";

type VendorUpdate = Database["public"]["Tables"]["vendors"]["Update"];

export default function VendorOnboarding() {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

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

  const vendor = vendorQuery.data;

  useEffect(() => {
    // Nothing left to do here once submitted (or if there's somehow no vendor yet).
    if (vendorQuery.isSuccess && (!vendor || vendor.status !== "draft")) {
      router.replace("/(app)/(tabs)/account");
    }
  }, [vendorQuery.isSuccess, vendor, router]);

  async function patchVendor(patch: VendorUpdate) {
    if (!vendor) return;
    const { error } = await supabase.from("vendors").update(patch).eq("id", vendor.id);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["vendor", session?.user.id] });
  }

  if (vendorQuery.isLoading || !vendor) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  const businessDefaults: BusinessBasicsInput = {
    storefrontName: vendor.storefront_name ?? "",
    tagline: vendor.tagline ?? "",
    vendorTypes: (vendor.vendor_types as BusinessBasicsInput["vendorTypes"]) ?? [],
    phone: vendor.phone ?? "",
    email: vendor.email ?? "",
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-cotto-dark" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 64, paddingBottom: 96 }}>
        <ProgressBar step={step} />

        {step === 0 && (
          <BusinessBasicsStep
            defaultValues={businessDefaults}
            onNext={async (values) => {
              await patchVendor({
                storefront_name: values.storefrontName,
                tagline: values.tagline || null,
                vendor_types: values.vendorTypes,
                phone: values.phone,
                email: values.email,
              });
              setStep(1);
            }}
          />
        )}

        {step === 1 && (
          <ServiceAddressStep
            defaultValues={{
              addressLine1: vendor.address_line1 ?? "",
              city: vendor.city ?? "",
              state: vendor.state ?? "",
              zip: vendor.zip ?? "",
            }}
            defaultCoords={vendor.lat && vendor.lng ? { lat: vendor.lat, lng: vendor.lng } : null}
            onBack={() => setStep(0)}
            onNext={async (values: GeocodedAddress) => {
              await patchVendor({
                address_line1: values.addressLine1,
                city: values.city,
                state: values.state,
                zip: values.zip,
                lat: values.lat,
                lng: values.lng,
              });
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <CfpmCertStep
            userId={session!.user.id}
            defaultCertUrl={vendor.cfpm_cert_url}
            defaultExpiresOn={vendor.cfpm_cert_expires_on}
            onBack={() => setStep(1)}
            onNext={async (values) => {
              await patchVendor({
                cfpm_cert_url: values.cfpmCertUrl,
                cfpm_cert_expires_on: values.cfpmCertExpiresOn,
              });
              setStep(3);
            }}
          />
        )}

        {step === 3 && (
          <CottageFoodStep
            onBack={() => setStep(2)}
            onNext={async () => {
              await patchVendor({ cottage_food_acknowledged_at: new Date().toISOString() });
              setStep(4);
            }}
          />
        )}

        {step === 4 && (
          <StripeConnectStep
            vendorId={vendor.id}
            onBack={() => setStep(3)}
            onSubmit={async () => {
              await patchVendor({ status: "pending_review" });
              // Best-effort -- the application is already submitted regardless
              // of whether the admin notification email succeeds.
              await supabase.functions.invoke("notify-vendor-submitted", { body: { vendorId: vendor.id } }).catch(() => {});
              router.replace("/(app)/(tabs)/account");
            }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
