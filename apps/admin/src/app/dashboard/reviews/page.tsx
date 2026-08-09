import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { ReviewActions } from "./review-actions";

export default async function ReviewsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  const { data: reviews } = await admin.service
    .from("reviews")
    .select("id, rating_overall, body, image_url, flagged_reason, created_at, vendors(storefront_name), profiles(full_name)")
    .eq("is_flagged", true)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to dashboard
      </Link>
      <h1 className="mb-6 mt-4 text-2xl font-bold">Flagged reviews</h1>

      <div className="flex flex-col gap-4">
        {reviews?.length ? (
          reviews.map((review) => (
            <div key={review.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{review.vendors?.storefront_name ?? "Unknown vendor"}</p>
                <p className="text-sm text-muted-foreground">{review.rating_overall} / 5</p>
              </div>
              <p className="text-sm text-muted-foreground">
                by {review.profiles?.full_name ?? "Unknown customer"} &middot; {new Date(review.created_at).toLocaleDateString()}
              </p>
              {review.body && <p className="mt-2 text-sm">{review.body}</p>}
              {review.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={review.image_url} alt="Review attachment" className="mt-2 max-h-48 rounded-md" />
              )}
              <p className="mt-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                Flagged: {review.flagged_reason ?? "No reason given"}
              </p>
              <ReviewActions reviewId={review.id} />
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">No flagged reviews.</p>
        )}
      </div>
    </main>
  );
}
