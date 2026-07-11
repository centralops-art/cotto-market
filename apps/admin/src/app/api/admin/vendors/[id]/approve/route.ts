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
  if (vendor.status !== "pending_review") {
    return NextResponse.json({ error: "Vendor is not pending review" }, { status: 400 });
  }

  // Approved vendors land on 'unpublished' -- they can build their storefront
  // but stay invisible to customers until they click Publish (Phase 3).
  const { error: updateError } = await admin.service
    .from("vendors")
    .update({ status: "unpublished", rejected_reason: null })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "vendor_approved",
    target_table: "vendors",
    target_id: id,
  });

  let emailError: string | undefined;
  if (vendor.email) {
    const result = await sendEmail({
      to: vendor.email,
      subject: "Your Cotto vendor application was approved",
      text: `Good news, ${vendor.storefront_name}! Your cook application was approved. Open the Cotto app to build your storefront.`,
    });
    emailError = result.error;
  }

  return NextResponse.json({ ok: true, emailError });
}
