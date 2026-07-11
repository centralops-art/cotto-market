"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function OrderActions({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (status !== "paid") return null;

  async function refund() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${orderId}/refund`, { method: "POST" });
    const result = await res.json();
    setLoading(false);
    if (result.error) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!confirming ? (
        <Button variant="destructive" disabled={loading} onClick={() => setConfirming(true)}>
          Refund order
        </Button>
      ) : (
        <div className="flex gap-3">
          <Button variant="destructive" disabled={loading} onClick={refund}>
            Confirm full refund
          </Button>
          <Button variant="outline" disabled={loading} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
