import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const { data: review, error: reviewError } = await admin.service.from("reviews").select("id").eq("id", id).single();
  if (reviewError || !review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  // review_items cascades on delete (migration 0008's FK).
  const { error: deleteError } = await admin.service.from("reviews").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "review_deleted",
    target_table: "reviews",
    target_id: id,
  });

  return NextResponse.json({ ok: true });
}
