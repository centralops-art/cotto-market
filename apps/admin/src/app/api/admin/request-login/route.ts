import { NextResponse } from "next/server";
import { magicLinkRequestSchema } from "@cotto/shared";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = magicLinkRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const email = parsed.data.email;

  const service = createServiceRoleClient();
  const { data: settings, error: settingsError } = await service
    .from("system_settings")
    .select("admin_allow_list")
    .eq("id", 1)
    .single();

  if (settingsError || !settings) {
    return NextResponse.json({ error: "Could not verify admin access. Try again shortly." }, { status: 500 });
  }

  const allowList = settings.admin_allow_list.map((e) => e.toLowerCase());
  if (!allowList.includes(email)) {
    return NextResponse.json({ error: "This email is not authorized for Cotto Admin." }, { status: 403 });
  }

  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({});
}
