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
  if (!parsed.success) return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
  const { reason } = parsed.data;

  const { data: vendor, error: vendorError } = await admin.service
    .from("vendors")
    .select("id, storefront_name, email, status")
    .eq("id", id)
    .single();
  if (vendorError || !vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  if (vendor.status !== "pending_review") {
    return NextResponse.json({ error: "Vendor is not pending review" }, { status: 400 });
  }

  // Back to 'draft' (not a dead end) so the vendor can fix the issue and
  // resubmit through the same self-serve wizard flow.
  const { error: updateError } = await admin.service
    .from("vendors")
    .update({ status: "draft", rejected_reason: reason })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "vendor_rejected",
    target_table: "vendors",
    target_id: id,
    reason,
  });

  let emailError: string | undefined;
  if (vendor.email) {
    const result = await sendEmail({
      to: vendor.email,
      subject: "Update on your Cotto vendor application",
      text: `Hi ${vendor.storefront_name}, your cook application needs a change before we can approve it:\n\n${reason}\n\nOpen the Cotto app to update and resubmit.`,
    });
    emailError = result.error;
  }

  return NextResponse.json({ ok: true, emailError });
}
