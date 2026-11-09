import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { sendEmail } from "@/lib/resend";

// Approve a family / team-member driver (migration 0060). Mirrors
// vendor-delivery-profiles/[id]/approve.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

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
    .update({ status: "active", rejected_reason: null, suspended_reason: null })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "team_driver_approved",
    target_table: "vendor_team_drivers",
    target_id: id,
  });

  const vendor = teamDriver.vendors as unknown as { storefront_name: string; email: string | null } | null;
  const memberName = (teamDriver.vendor_team_members as unknown as { display_name: string } | null)?.display_name ?? "Your team member";
  let emailError: string | undefined;
  if (vendor?.email) {
    const result = await sendEmail({
      to: vendor.email,
      subject: `${memberName} is approved to deliver for ${vendor.storefront_name}`,
      text: `Good news, ${vendor.storefront_name}! ${memberName} is approved as a family driver. In the Cotto app's Deliveries tab, pick ${memberName} under "Who's delivering?" before claiming an order.`,
    });
    emailError = result.error;
  }

  return NextResponse.json({ ok: true, emailError });
}
