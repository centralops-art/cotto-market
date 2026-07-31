import { z } from "zod";
import type { CottoSupabaseClient } from "./supabase-client";

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1, "Full name is required"),
  // General account creation consent (Terms & Conditions + Privacy Policy)
  // -- required to submit signup at all. SMS-specific consent lives
  // separately, as an inline disclosure directly below the phone number
  // field on complete-profile.tsx (customers) and business-basics-step.tsx
  // (vendors), per Twilio's A2P 10DLC campaign corrective guidance: consent
  // must be shown at the point the phone number is actually collected, not
  // bundled into an earlier, phone-number-less screen.
  agreedToTerms: z.boolean().refine((v) => v === true, "You must agree to the Terms & Conditions and Privacy Policy"),
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

export async function signUpWithPassword(client: CottoSupabaseClient, input: SignUpInput, emailRedirectTo: string) {
  const { email, password, fullName } = signUpSchema.parse(input);
  return client.auth.signUp({
    email,
    password,
    // No sms_opt_in here -- this screen has no phone field and makes no SMS
    // representation (see the signUpSchema comment). profiles.sms_opt_in
    // stays at its default false until completeProfile() below.
    // emailRedirectTo points confirmation links at a generic "you're
    // confirmed" page rather than falling back to site_url (the ADMIN app's
    // login page, which customers confirming a mobile-app signup have no
    // business landing on).
    options: { data: { full_name: fullName }, emailRedirectTo },
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
  // sms_opt_in: true unconditionally -- the inline SMS disclosure shown
  // directly below the phone field on this screen (not a checkbox, per
  // Twilio's explicit guidance) is what represents consent; submitting the
  // form with that disclosure visible is the consenting action.
  return client.from("profiles").update({ phone, sms_opt_in: true }).eq("id", userId);
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
