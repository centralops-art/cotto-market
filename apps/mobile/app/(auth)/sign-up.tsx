import { zodResolver } from "@hookform/resolvers/zod";
import { signUpSchema, signUpWithPassword, TERMS_URL, PRIVACY_URL, type SignUpInput } from "@cotto/shared";
import { Link } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../src/lib/supabase";

const EMAIL_CONFIRMED_URL = "https://admin.cottomarket.com/email-confirmed";

export default function SignUp() {
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmEmailSent, setConfirmEmailSent] = useState(false);
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", fullName: "", agreedToTerms: false },
  });
  const agreedToTerms = watch("agreedToTerms");

  async function onSubmit(values: SignUpInput) {
    setFormError(null);
    const { data, error } = await signUpWithPassword(supabase, values, EMAIL_CONFIRMED_URL);
    if (error) return setFormError(error.message);
    if (!data.session) {
      // Email confirmation is required (hosted project) -- signUp() returns
      // a user but no session until they click the link. Local dev has
      // confirmations disabled, so this branch won't fire there; the root
      // layout's auth-state redirect handles that case (session established
      // immediately on success).
      setConfirmEmailSent(true);
    }
  }

  if (confirmEmailSent) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-cotto-dark px-6">
        <Text className="text-center text-2xl font-bold text-cotto-accent">Check your email</Text>
        <Text className="text-center text-white/70">
          We sent a confirmation link to your email address. Click it to finish creating your account, then come back
          and sign in.
        </Text>
        <Link href="/(auth)/sign-in" className="mt-2 font-semibold text-cotto-accent">
          Back to sign in
        </Link>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center gap-4 bg-cotto-dark px-6">
      <Text className="mb-4 text-3xl font-bold text-cotto-accent">Create your account</Text>

      <Controller
        control={control}
        name="fullName"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="rounded-lg bg-white/10 px-4 py-3 text-white"
            placeholder="Full name"
            placeholderTextColor="#9CA3AF"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      {errors.fullName && <Text className="text-red-400">{errors.fullName.message}</Text>}

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
            placeholder="Password (min. 8 characters)"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      {errors.password && <Text className="text-red-400">{errors.password.message}</Text>}

      <Controller
        control={control}
        name="agreedToTerms"
        render={({ field: { onChange, value } }) => (
          <Pressable className="flex-row items-start gap-3" onPress={() => onChange(!value)}>
            <View
              className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${
                value ? "border-cotto-accent bg-cotto-accent" : "border-white/40"
              }`}
            >
              {value && <Text className="text-xs font-bold text-white">✓</Text>}
            </View>
            <Text className="flex-1 text-sm text-white/70">
              I agree to the{" "}
              <Text className="text-cotto-accent underline" onPress={() => Linking.openURL(TERMS_URL)}>
                Terms &amp; Conditions
              </Text>{" "}
              and{" "}
              <Text className="text-cotto-accent underline" onPress={() => Linking.openURL(PRIVACY_URL)}>
                Privacy Policy
              </Text>
              .
            </Text>
          </Pressable>
        )}
      />
      {errors.agreedToTerms && <Text className="text-red-400">{errors.agreedToTerms.message}</Text>}

      {formError && <Text className="text-red-400">{formError}</Text>}

      <Pressable
        className="mt-2 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
        disabled={isSubmitting || !agreedToTerms}
        onPress={handleSubmit(onSubmit)}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Sign up</Text>}
      </Pressable>

      <View className="mt-4 flex-row justify-center gap-1">
        <Text className="text-white/70">Already have an account?</Text>
        <Link href="/(auth)/sign-in" className="font-semibold text-cotto-accent">
          Sign in
        </Link>
      </View>
    </View>
  );
}
