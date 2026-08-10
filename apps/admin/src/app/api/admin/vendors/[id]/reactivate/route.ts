import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { sendEmail } from "@/lib/resend";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const { data: vendor, error: vendorError } = await admin.service
    .from("vendors")
    .select("id, storefront_name, email, status")
    .eq("id", id)
    .single();
  if (vendorError || !vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  if (vendor.status !== "suspended") {
    return NextResponse.json({ error: "Only a suspended vendor can be reactivated" }, { status: 400 });
  }

  const { error: updateError } = await admin.service
    .from("vendors")
    .update({ status: "active", suspended_reason: null })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "vendor_reactivated",
    target_table: "vendors",
    target_id: id,
  });

  let emailError: string | undefined;
  if (vendor.email) {
    const result = await sendEmail({
      to: vendor.email,
      subject: "Your Cotto storefront is active again",
      text: `Hi ${vendor.storefront_name}, your storefront has been reactivated and is visible to customers again.`,
    });
    emailError = result.error;
  }

  return NextResponse.json({ ok: true, emailError });
}
