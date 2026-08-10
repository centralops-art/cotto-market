import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { sendEmail } from "@/lib/resend";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const { data: profile, error: profileError } = await admin.service
    .from("profiles")
    .select("id, full_name, status")
    .eq("id", id)
    .single();
  if (profileError || !profile) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (profile.status !== "suspended") {
    return NextResponse.json({ error: "Customer is not suspended" }, { status: 400 });
  }

  const { error: updateError } = await admin.service
    .from("profiles")
    .update({ status: "active", suspended_reason: null })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "customer_reactivated",
    target_table: "profiles",
    target_id: id,
  });

  let emailError: string | undefined;
  const { data: userAuth } = await admin.service.auth.admin.getUserById(id);
  if (userAuth?.user?.email) {
    const result = await sendEmail({
      to: userAuth.user.email,
      subject: "Your Cotto account is back in good standing",
      text: `Hi${profile.full_name ? ` ${profile.full_name}` : ""}, your Cotto account can place orders again.`,
    });
    emailError = result.error;
  }

  return NextResponse.json({ ok: true, emailError });
}
