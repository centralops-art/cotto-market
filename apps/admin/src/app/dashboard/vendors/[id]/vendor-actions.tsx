"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function VendorActions({ vendorId, status }: { vendorId: string; status: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending_review") return null;

  async function approve() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/vendors/${vendorId}/approve`, { method: "POST" });
    const result = await res.json();
    setLoading(false);
    if (result.error) return setError(result.error);
    router.refresh();
  }

  async function reject() {
    if (!reason.trim()) return setError("A reason is required");
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/vendors/${vendorId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const result = await res.json();
    setLoading(false);
    if (result.error) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!showReject ? (
        <div className="flex gap-3">
          <Button disabled={loading} onClick={approve}>
            Approve
          </Button>
          <Button variant="destructive" disabled={loading} onClick={() => setShowReject(true)}>
            Reject
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            placeholder="Reason for rejection (sent to the vendor)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <div className="flex gap-3">
            <Button variant="destructive" disabled={loading} onClick={reject}>
              Confirm reject
            </Button>
            <Button variant="outline" disabled={loading} onClick={() => setShowReject(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
