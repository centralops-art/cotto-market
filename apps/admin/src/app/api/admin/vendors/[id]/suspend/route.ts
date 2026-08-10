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

  const { data: vendor, error: vendorError } = await admin.service
    .from("vendors")
    .select("id, storefront_name, email, status")
    .eq("id", id)
    .single();
  if (vendorError || !vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  if (vendor.status !== "active") {
    return NextResponse.json({ error: "Only an active vendor can be suspended" }, { status: 400 });
  }

  // status = 'suspended' immediately drops out of vendors_select's public
  // branch (only 'active' is customer-visible -- migration 0010), hiding the
  // storefront right away. Already-paid orders/suborders are untouched --
  // this only affects new visibility/checkout, matching the confirmed scope
  // of "never disrupt money already in motion."
  const { error: updateError } = await admin.service
    .from("vendors")
    .update({ status: "suspended", suspended_reason: reason })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "vendor_suspended",
    target_table: "vendors",
    target_id: id,
    reason,
  });

  let emailError: string | undefined;
  if (vendor.email) {
    const result = await sendEmail({
      to: vendor.email,
      subject: "Your Cotto storefront has been suspended",
      text: `Hi ${vendor.storefront_name}, your storefront has been suspended by Cotto and is no longer visible to customers:\n\n${reason}\n\nContact support if you have questions.`,
    });
    emailError = result.error;
  }

  return NextResponse.json({ ok: true, emailError });
}
