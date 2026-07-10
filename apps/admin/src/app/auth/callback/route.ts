import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no_user`);
  }

  // Defense in depth: re-check the allow-list even though requestMagicLink
  // already gated sending the email, and elevate role to ops_admin via the
  // service role (bypasses the profiles.role self-escalation guard trigger,
  // which only allows service_role / existing ops_admin to change role).
  const service = createServiceRoleClient();
  const { data: settings } = await service.from("system_settings").select("admin_allow_list").eq("id", 1).single();
  const allowList = (settings?.admin_allow_list ?? []).map((e) => e.toLowerCase());

  if (!allowList.includes(user.email.toLowerCase())) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_authorized`);
  }

  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single();
  if (profile && profile.role !== "ops_admin" && profile.role !== "ops_owner") {
    await service.from("profiles").update({ role: "ops_admin" }).eq("id", user.id);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
