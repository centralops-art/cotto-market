import { NextResponse } from "next/server";
import { z } from "zod";
import { emailSchema } from "@cotto/shared";
import { createClient } from "@/lib/supabase/server";
import { gateAdminUser } from "@/lib/admin-login-gate";

const verifyCodeSchema = z.object({
  email: emailSchema,
  token: z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit code from the email"),
});

/** Alternative to the /auth/callback link flow -- verifying a numeric OTP
 * token doesn't depend on a stored PKCE code_verifier, so unlike the link
 * this works regardless of which browser/device requested the code. Same
 * post-auth gate (gateAdminUser) as the link path. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = verifyCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { email, token } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
    error: verifyError,
  } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (verifyError || !user) {
    return NextResponse.json({ error: "That code is invalid or expired. Request a new one." }, { status: 401 });
  }

  const { error: gateError } = await gateAdminUser(user);
  if (gateError) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: gateError }, { status: 403 });
  }

  return NextResponse.json({});
}
