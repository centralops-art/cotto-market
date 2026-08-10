import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";

// platform_fee_pct null = fall back to system_settings.default_platform_fee_pct
// (existing convention, see vendors table comment in migration 0002).
// free_trial_ends_at null = the override (if any) is permanent -- only a
// non-null date makes cron-vendor-trial-expiry-check (migration 0052) reset
// it automatically.
const bodySchema = z.object({
  platform_fee_pct: z.number().min(0).max(100).nullable(),
  free_trial_ends_at: z.string().datetime().nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { platform_fee_pct, free_trial_ends_at } = parsed.data;

  const { data: vendor, error: vendorError } = await admin.service
    .from("vendors")
    .select("id, storefront_name")
    .eq("id", id)
    .single();
  if (vendorError || !vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

  const { error: updateError } = await admin.service
    .from("vendors")
    .update({ platform_fee_pct, free_trial_ends_at })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "vendor_fee_override_updated",
    target_table: "vendors",
    target_id: id,
    metadata: { platform_fee_pct, free_trial_ends_at },
  });

  return NextResponse.json({ ok: true });
}
