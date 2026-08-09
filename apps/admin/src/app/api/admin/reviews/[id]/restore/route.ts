import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const { data: review, error: reviewError } = await admin.service
    .from("reviews")
    .select("id, is_flagged")
    .eq("id", id)
    .single();
  if (reviewError || !review) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  if (!review.is_flagged) return NextResponse.json({ error: "Review is not flagged" }, { status: 400 });

  const { error: updateError } = await admin.service
    .from("reviews")
    .update({ is_flagged: false, flagged_reason: null })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "review_restored",
    target_table: "reviews",
    target_id: id,
  });

  return NextResponse.json({ ok: true });
}
