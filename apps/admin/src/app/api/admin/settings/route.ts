import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";

const bodySchema = z.object({
  default_platform_fee_pct: z.number().min(0).max(100),
  free_trial_default_days: z.number().int().min(0),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const { error: updateError } = await admin.service.from("system_settings").update(parsed.data).eq("id", 1);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "system_settings_updated",
    target_table: "system_settings",
    target_id: null,
    metadata: parsed.data,
  });

  return NextResponse.json({ ok: true });
}
