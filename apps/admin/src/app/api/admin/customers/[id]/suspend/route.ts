import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { sendEmail } from "@/lib/resend";

const bodySchema = z.object({ reason: z.string().trim().min(1, "A reason is required") });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A suspension reason is required" }, { status: 400 });
  const { reason } = parsed.data;

  const { data: profile, error: profileError } = await admin.service
    .from("profiles")
    .select("id, full_name, status")
    .eq("id", id)
    .single();
  if (profileError || !profile) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (profile.status === "suspended") {
    return NextResponse.json({ error: "Customer is already suspended" }, { status: 400 });
  }

  // Blocks checkout only (checkout-create-payment-intent checks this) --
  // deliberately not a full auth lockout, confirmed with the founder.
  const { error: updateError } = await admin.service
    .from("profiles")
    .update({ status: "suspended", suspended_reason: reason })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "customer_suspended",
    target_table: "profiles",
    target_id: id,
    reason,
  });

  let emailError: string | undefined;
  const { data: userAuth } = await admin.service.auth.admin.getUserById(id);
  if (userAuth?.user?.email) {
    const result = await sendEmail({
      to: userAuth.user.email,
      subject: "Your Cotto account has a hold on new orders",
      text: `Hi${profile.full_name ? ` ${profile.full_name}` : ""}, your Cotto account can no longer place new orders:\n\n${reason}\n\nContact support if you have questions.`,
    });
    emailError = result.error;
  }

  return NextResponse.json({ ok: true, emailError });
}
