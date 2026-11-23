import { zodResolver } from "@hookform/resolvers/zod";
import { signInSchema, signInWithPassword, type SignInInput } from "@cotto/shared";
import { Link } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput } from "react-native";
import { useKeyboardAwareScroll } from "../../src/lib/use-keyboard-aware-scroll";
import { supabase } from "../../src/lib/supabase";

export default function SignIn() {
  const keyboard = useKeyboardAwareScroll();
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
    <ScrollView
      ref={keyboard.scrollRef}
      onScroll={keyboard.onScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      className="flex-1 bg-cotto-dark"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", gap: 16, paddingHorizontal: 24, paddingBottom: keyboard.keyboardHeight }}
    >
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

      {/* Link's own className isn't reliably styled by NativeWind, which left
          these rendering as dark, left-aligned default text. Style a Text
          inside a Pressable instead. */}
      <Link href="/(auth)/sign-up" asChild>
        <Pressable className="mt-4 items-center">
          <Text className="text-center text-white/80">
            Don't have an account? <Text className="font-semibold text-cotto-accent">Sign up</Text>
          </Text>
        </Pressable>
      </Link>
      <Link href="/(auth)/forgot-password" asChild>
        <Pressable className="items-center">
          <Text className="text-center text-white/80">Forgot password?</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
