import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";

const bodySchema = z
  .object({
    dispatch_contact_name: z.string().trim().nullable(),
    dispatch_phone: z.string().trim().nullable(),
    dispatch_emails: z.array(z.string().email()),
    base_delivery_fee_cents: z.number().int().min(0),
    per_mile_fee_cents: z.number().int().min(0),
    delivery_payout_split_pct: z.number().min(0).max(100),
    claim_window_t1_minutes: z.number().int().min(1),
    claim_window_t2_minutes: z.number().int().min(1),
    claim_window_t3_minutes: z.number().int().min(1),
    delivery_conflict_rule: z.enum(["soft_warning", "hard_block"]),
  })
  // Mirrors the DB check constraint (migration 0051) -- validated here too so
  // the admin gets a clear message instead of a raw Postgres constraint error.
  .refine((v) => v.claim_window_t1_minutes < v.claim_window_t2_minutes, {
    message: "T1 must be less than T2",
    path: ["claim_window_t1_minutes"],
  })
  .refine((v) => v.claim_window_t2_minutes < v.claim_window_t3_minutes, {
    message: "T2 must be less than T3",
    path: ["claim_window_t2_minutes"],
  });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const { data: region, error: regionError } = await admin.service.from("regions").select("id").eq("id", id).single();
  if (regionError || !region) return NextResponse.json({ error: "Region not found" }, { status: 404 });

  const { error: updateError } = await admin.service.from("regions").update(parsed.data).eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "region_settings_updated",
    target_table: "regions",
    target_id: id,
    metadata: parsed.data,
  });

  return NextResponse.json({ ok: true });
}
