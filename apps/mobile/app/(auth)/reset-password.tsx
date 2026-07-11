import { zodResolver } from "@hookform/resolvers/zod";
import { updatePassword, updatePasswordSchema, type UpdatePasswordInput } from "@cotto/shared";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/lib/auth-context";

/** Supabase's recovery redirect appends tokens as a URL fragment (#access_token=...). */
function parseRecoveryTokens(url: string | null) {
  if (!url) return null;
  const fragment = url.split("#")[1];
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export default function ResetPassword() {
  const url = Linking.useURL();
  const router = useRouter();
  const { clearPasswordRecovery } = useAuth();
  const [sessionReady, setSessionReady] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: "" },
  });

  useEffect(() => {
    const tokens = parseRecoveryTokens(url);
    if (tokens) {
      supabase.auth.setSession(tokens).then(({ error }) => {
        if (!error) setSessionReady(true);
        else setFormError(error.message);
      });
    }
  }, [url]);

  async function onSubmit(values: UpdatePasswordInput) {
    setFormError(null);
    const { error } = await updatePassword(supabase, values);
    if (error) {
      setFormError(error.message);
      return;
    }
    setDone(true);
    clearPasswordRecovery();
    router.replace("/(app)/(tabs)");
  }

  if (done) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark px-6">
        <Text className="text-white">Password updated.</Text>
      </View>
    );
  }

  if (!sessionReady) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-cotto-dark px-6">
        <ActivityIndicator color="#D96A3E" />
        <Text className="text-center text-white/70">Opening your reset link...</Text>
        {formError && <Text className="text-red-400">{formError}</Text>}
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center gap-4 bg-cotto-dark px-6">
      <Text className="mb-2 text-2xl font-bold text-white">Set a new password</Text>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="rounded-lg bg-white/10 px-4 py-3 text-white"
            placeholder="New password (min. 8 characters)"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      {errors.password && <Text className="text-red-400">{errors.password.message}</Text>}
      {formError && <Text className="text-red-400">{formError}</Text>}

      <Pressable
        className="mt-2 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Update password</Text>}
      </Pressable>
    </View>
  );
}
