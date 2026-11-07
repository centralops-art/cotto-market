import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const { data: profile, error: profileError } = await admin.service
    .from("profiles")
    .select("id, status")
    .eq("id", id)
    .single();
  if (profileError || !profile) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (profile.status === "deleted") {
    return NextResponse.json({ error: "This account has been deleted -- there's no password to reset." }, { status: 400 });
  }

  const { data: userAuth } = await admin.service.auth.admin.getUserById(id);
  if (!userAuth?.user?.email) return NextResponse.json({ error: "No email on file for this account" }, { status: 400 });

  const { error: resetError } = await admin.service.auth.resetPasswordForEmail(userAuth.user.email, {
    redirectTo: "https://admin.cottomarket.com/reset-password",
  });
  if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "admin_triggered_password_reset",
    target_table: "profiles",
    target_id: id,
  });

  return NextResponse.json({ ok: true });
}
