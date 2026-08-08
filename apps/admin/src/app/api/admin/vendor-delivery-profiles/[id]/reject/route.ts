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

  const { data: profile, error: profileError } = await admin.service
    .from("vendor_delivery_profiles")
    .select("id, status, vendors(storefront_name, email)")
    .eq("id", id)
    .single();
  if (profileError || !profile) return NextResponse.json({ error: "Delivery profile not found" }, { status: 404 });
  if (profile.status !== "delivery_pending_review") {
    return NextResponse.json({ error: "Delivery profile is not pending review" }, { status: 400 });
  }

  // Back to 'not_started' (not a dead end) -- mirrors the vendor reject
  // route's own status:'draft' behavior, not 'delivery_suspended' (that
  // status is reserved for post-approval suspension: the license-expiry
  // cron, or a future manual admin suspend action). An application that was
  // simply never approved should land back at the resubmittable state.
  const { error: updateError } = await admin.service
    .from("vendor_delivery_profiles")
    .update({ status: "not_started", rejected_reason: reason })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "delivery_profile_rejected",
    target_table: "vendor_delivery_profiles",
    target_id: id,
    reason,
  });

  const vendor = profile.vendors as unknown as { storefront_name: string; email: string | null } | null;
  let emailError: string | undefined;
  if (vendor?.email) {
    const result = await sendEmail({
      to: vendor.email,
      subject: "Update on your Cotto delivery partner application",
      text: `Hi ${vendor.storefront_name}, your delivery partner application needs a change before we can approve it:\n\n${reason}\n\nOpen the Cotto app to update and resubmit.`,
    });
    emailError = result.error;
  }

  return NextResponse.json({ ok: true, emailError });
}
