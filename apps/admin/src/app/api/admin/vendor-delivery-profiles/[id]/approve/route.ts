import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { sendEmail } from "@/lib/resend";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const { data: profile, error: profileError } = await admin.service
    .from("vendor_delivery_profiles")
    .select("id, status, vendors(storefront_name, email)")
    .eq("id", id)
    .single();
  if (profileError || !profile) return NextResponse.json({ error: "Delivery profile not found" }, { status: 404 });
  if (profile.status !== "delivery_pending_review") {
    return NextResponse.json({ error: "Delivery profile is not pending review" }, { status: 400 });
  }

  const { error: updateError } = await admin.service
    .from("vendor_delivery_profiles")
    .update({ status: "delivery_active", rejected_reason: null })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "delivery_profile_approved",
    target_table: "vendor_delivery_profiles",
    target_id: id,
  });

  const vendor = profile.vendors as unknown as { storefront_name: string; email: string | null } | null;
  let emailError: string | undefined;
  if (vendor?.email) {
    const result = await sendEmail({
      to: vendor.email,
      subject: "Your Cotto delivery partner application was approved",
      text: `Good news, ${vendor.storefront_name}! Your delivery partner application was approved. Open the Cotto app -- the Deliveries tab is now available.`,
    });
    emailError = result.error;
  }

  return NextResponse.json({ ok: true, emailError });
}
