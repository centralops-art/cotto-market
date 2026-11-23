"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Parses a dollar amount like "5" or "5.25" into cents; null if invalid. */
function parseDollarsToCents(value: string): number | null {
  const trimmed = value.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export function OrderActions({ orderId, status, totalCents }: { orderId: string; status: string; totalCents: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Empty = full refund. The API has always accepted amountCents; this is
  // the first UI for it. Direct-charge orders refund food first, then the
  // delivery fee (HANDOFF.md §39 step 6).
  const [amount, setAmount] = useState("");

  if (status !== "paid") return null;

  const amountCents = amount.trim() === "" ? undefined : parseDollarsToCents(amount);
  const amountInvalid = amountCents === null || (amountCents !== undefined && (amountCents <= 0 || amountCents > totalCents));
  const refundLabel = amountCents ? `Confirm refund of ${formatCents(amountCents)}` : `Confirm full refund (${formatCents(totalCents)})`;

  async function refund() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(amountCents ? { amountCents } : {}),
    });
    const result = await res.json();
    setLoading(false);
    if (result.error) return setError(result.error);
    if (result.deliveryRefundError) setError(`Food refunded, but the delivery fee refund failed: ${result.deliveryRefundError}`);
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
        <div className="flex flex-col gap-3">
          <label className="flex max-w-xs flex-col gap-1 text-sm">
            Amount to refund (leave blank for the full {formatCents(totalCents)})
            <input
              className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              inputMode="decimal"
              placeholder={(totalCents / 100).toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          {amountInvalid && (
            <p className="text-sm text-destructive">Enter an amount between $0.01 and {formatCents(totalCents)}.</p>
          )}
          <div className="flex gap-3">
            <Button variant="destructive" disabled={loading || amountInvalid} onClick={refund}>
              {refundLabel}
            </Button>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => {
                setConfirming(false);
                setAmount("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
