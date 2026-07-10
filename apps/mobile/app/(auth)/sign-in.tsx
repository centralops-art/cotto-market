import { zodResolver } from "@hookform/resolvers/zod";
import { signInSchema, signInWithPassword, type SignInInput } from "@cotto/shared";
import { Link } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../src/lib/supabase";

export default function SignIn() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInInput) {
    setFormError(null);
    const { error } = await signInWithPassword(supabase, values);
    if (error) setFormError(error.message);
  }

  return (
    <View className="flex-1 justify-center gap-4 bg-cotto-dark px-6">
      <Text className="mb-4 text-3xl font-bold text-cotto-accent">Cotto</Text>

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

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="rounded-lg bg-white/10 px-4 py-3 text-white"
            placeholder="Password"
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
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Sign in</Text>}
      </Pressable>

      <View className="mt-4 flex-row justify-center gap-1">
        <Text className="text-white/70">Don't have an account?</Text>
        <Link href="/(auth)/sign-up" className="font-semibold text-cotto-accent">
          Sign up
        </Link>
      </View>
      <Link href="/(auth)/forgot-password" className="text-center text-white/70">
        Forgot password?
      </Link>
    </View>
  );
}
