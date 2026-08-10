import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;

  const { data: review, error: reviewError } = await admin.service
    .from("reviews")
    .select("id, vendor_suborder_id")
    .eq("id", id)
    .single();
  if (reviewError || !review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  // review_items cascades on delete (migration 0008's FK).
  const { error: deleteError } = await admin.service.from("reviews").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // A review and its delivery_claims.customer_rating are separate tables
  // (rate_delivery_claim, migration 0047) with no FK relationship, so
  // deleting the review alone leaves a dangling "already rated" state --
  // rate_delivery_claim's one-time guard would then permanently block a
  // fresh driver rating on a resubmitted review for the same order, with
  // nothing left on record to explain why. Deleting a review is meant to
  // fully undo the customer's review action for that order, so clear the
  // rating too.
  await admin.service
    .from("delivery_claims")
    .update({ customer_rating: null, customer_rating_comment: null })
    .eq("vendor_suborder_id", review.vendor_suborder_id);

  await admin.service.from("audit_log").insert({
    actor_profile_id: admin.user.id,
    action: "review_deleted",
    target_table: "reviews",
    target_id: id,
  });

  return NextResponse.json({ ok: true });
}
