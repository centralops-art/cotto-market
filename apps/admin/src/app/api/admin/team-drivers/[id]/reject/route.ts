import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { sendEmail } from "@/lib/resend";

const bodySchema = z.object({ reason: z.string().trim().min(1, "A reason is required") });

// Reject a family / team-member driver (migration 0060). The vendor fixes
// and resubmits from the app, which lands it back in pending_review.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
  const { reason } = parsed.data;

  const { data: teamDriver, error: fetchError } = await admin.service
    .from("vendor_team_drivers")
    .select("id, status, vendor_team_members(display_name), vendors(storefront_name, email)")
    .eq("id", id)
    .single();
  if (fetchError || !teamDriver) return NextResponse.json({ error: "Family driver not found" }, { status: 404 });
  if (teamDriver.status !== "pending_review") {
    return NextResponse.json({ error: "Family driver is not pending review" }, { status: 400 });
  }

  const { error: updateError } = await admin.service
    .from("vendor_team_drivers")
    .update({ status: "rejected", rejected_reason: reason })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "team_driver_rejected",
    target_table: "vendor_team_drivers",
    target_id: id,
    reason,
  });

  const vendor = teamDriver.vendors as unknown as { storefront_name: string; email: string | null } | null;
  const memberName = (teamDriver.vendor_team_members as unknown as { display_name: string } | null)?.display_name ?? "your team member";
  let emailError: string | undefined;
  if (vendor?.email) {
    const result = await sendEmail({
      to: vendor.email,
      subject: `Update on ${memberName}'s Cotto driver application`,
      text: `Hi ${vendor.storefront_name}, ${memberName}'s family driver application needs a change before we can approve it:\n\n${reason}\n\nOpen the Cotto app, go to your storefront's Team section, and tap ${memberName}'s driver status to update and resubmit.`,
    });
    emailError = result.error;
  }

  return NextResponse.json({ ok: true, emailError });
}
