import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateAdminUser } from "@/lib/admin-login-gate";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    // The most common cause: the link was opened in a different browser/device
    // than the one that requested it -- PKCE's code_verifier is stored in a
    // cookie on the requesting browser only. The 6-digit code on /login
    // doesn't have this limitation; that's the recommended path when this happens.
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no_user`);
  }

  const { error: gateError } = await gateAdminUser(user);
  if (gateError) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=${gateError}`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
