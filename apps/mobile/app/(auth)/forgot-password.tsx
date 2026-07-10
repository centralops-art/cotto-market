import { zodResolver } from "@hookform/resolvers/zod";
import { requestPasswordReset, requestPasswordResetSchema, type RequestPasswordResetInput } from "@cotto/shared";
import { Link } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../src/lib/supabase";

export default function ForgotPassword() {
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: RequestPasswordResetInput) {
    setFormError(null);
    const { error } = await requestPasswordReset(supabase, values, "cotto://reset-password");
    if (error) setFormError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-cotto-dark px-6">
        <Text className="text-center text-xl font-semibold text-white">Check your email</Text>
        <Text className="text-center text-white/70">We sent you a link to reset your password.</Text>
        <Link href="/(auth)/sign-in" className="mt-4 font-semibold text-cotto-accent">
          Back to sign in
        </Link>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center gap-4 bg-cotto-dark px-6">
      <Text className="mb-2 text-2xl font-bold text-white">Reset your password</Text>

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="rounded-lg bg-white/10 px-4 py-3 text-white"
            placeholder="Email"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            keyboardType="email-address"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      {errors.email && <Text className="text-red-400">{errors.email.message}</Text>}
      {formError && <Text className="text-red-400">{formError}</Text>}

      <Pressable
        className="mt-2 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Send reset link</Text>}
      </Pressable>

      <Link href="/(auth)/sign-in" className="mt-4 text-center text-white/70">
        Back to sign in
      </Link>
    </View>
  );
}
