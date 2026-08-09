"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ReviewActions({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/reviews/${reviewId}/restore`, { method: "POST" });
    const result = await res.json();
    setLoading(false);
    if (result.error) return setError(result.error);
    router.refresh();
  }

  async function remove() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/reviews/${reviewId}/delete`, { method: "POST" });
    const result = await res.json();
    setLoading(false);
    if (result.error) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button size="sm" disabled={loading} onClick={restore}>
          Restore
        </Button>
        <Button size="sm" variant="destructive" disabled={loading} onClick={remove}>
          Delete
        </Button>
      </div>
    </div>
  );
}
