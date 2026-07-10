import { zodResolver } from "@hookform/resolvers/zod";
import { completeProfile, completeProfileSchema, type CompleteProfileInput } from "@cotto/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/lib/auth-context";

export default function CompleteProfile() {
  const { session, refreshProfile } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompleteProfileInput>({
    resolver: zodResolver(completeProfileSchema),
    defaultValues: { phone: "" },
  });

  async function onSubmit(values: CompleteProfileInput) {
    if (!session) return;
    setFormError(null);
    const { error } = await completeProfile(supabase, session.user.id, values);
    if (error) setFormError(error.message);
    else await refreshProfile();
  }

  return (
    <View className="flex-1 justify-center gap-4 bg-cotto-dark px-6">
      <Text className="mb-2 text-2xl font-bold text-white">One more thing</Text>
      <Text className="mb-2 text-white/70">We need a phone number so vendors can reach you about your orders.</Text>

      <Controller
        control={control}
        name="phone"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="rounded-lg bg-white/10 px-4 py-3 text-white"
            placeholder="Phone number"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      {errors.phone && <Text className="text-red-400">{errors.phone.message}</Text>}
      {formError && <Text className="text-red-400">{formError}</Text>}

      <Pressable
        className="mt-2 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Continue</Text>}
      </Pressable>
    </View>
  );
}
