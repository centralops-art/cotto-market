import { z } from "zod";
import type { CottoSupabaseClient } from "./supabase-client";

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1, "Full name is required"),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const requestPasswordResetSchema = z.object({ email: emailSchema });
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const updatePasswordSchema = z.object({ password: passwordSchema });
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

export const magicLinkRequestSchema = z.object({ email: emailSchema });
export type MagicLinkRequestInput = z.infer<typeof magicLinkRequestSchema>;

/**
 * Thin, client-agnostic wrappers around supabase-js auth calls so both apps
 * (mobile's AsyncStorage-backed client, admin's @supabase/ssr browser/server
 * clients) validate and call auth the same way. The `profiles` row for a new
 * user is created by the `handle_new_user` DB trigger (see migration 0001),
 * seeded from `full_name` in signup metadata.
 */

export async function signUpWithPassword(client: CottoSupabaseClient, input: SignUpInput) {
  const { email, password, fullName } = signUpSchema.parse(input);
  return client.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
}

export async function signInWithPassword(client: CottoSupabaseClient, input: SignInInput) {
  const { email, password } = signInSchema.parse(input);
  return client.auth.signInWithPassword({ email, password });
}

export async function signOut(client: CottoSupabaseClient) {
  return client.auth.signOut();
}

export async function requestPasswordReset(
  client: CottoSupabaseClient,
  input: RequestPasswordResetInput,
  redirectTo: string
) {
  const { email } = requestPasswordResetSchema.parse(input);
  return client.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function updatePassword(client: CottoSupabaseClient, input: UpdatePasswordInput) {
  const { password } = updatePasswordSchema.parse(input);
  return client.auth.updateUser({ password });
}

export const completeProfileSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9()\-.\s]{7,20}$/, "Enter a valid phone number"),
});
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;

export async function completeProfile(client: CottoSupabaseClient, userId: string, input: CompleteProfileInput) {
  const { phone } = completeProfileSchema.parse(input);
  return client.from("profiles").update({ phone }).eq("id", userId);
}

export async function sendMagicLink(
  client: CottoSupabaseClient,
  input: MagicLinkRequestInput,
  redirectTo: string,
  shouldCreateUser: boolean
) {
  const { email } = magicLinkRequestSchema.parse(input);
  return client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser } });
}
