"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function VendorActions({ vendorId, status }: { vendorId: string; status: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showSuspend, setShowSuspend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending_review" && status !== "active" && status !== "suspended") return null;

  async function post(path: string, body?: unknown) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/vendors/${vendorId}/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await res.json();
    setLoading(false);
    if (result.error) return setError(result.error);
    setReason("");
    setShowReject(false);
    setShowSuspend(false);
    router.refresh();
  }

  if (status === "pending_review") {
    return (
      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!showReject ? (
          <div className="flex gap-3">
            <Button disabled={loading} onClick={() => post("approve")}>
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
              <Button variant="destructive" disabled={loading} onClick={() => post("reject", { reason })}>
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

  if (status === "active") {
    return (
      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!showSuspend ? (
          <Button variant="destructive" disabled={loading} onClick={() => setShowSuspend(true)}>
            Suspend
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder="Reason for suspension (sent to the vendor; storefront hides immediately)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <div className="flex gap-3">
              <Button variant="destructive" disabled={loading} onClick={() => post("suspend", { reason })}>
                Confirm suspend
              </Button>
              <Button variant="outline" disabled={loading} onClick={() => setShowSuspend(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // status === "suspended"
  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={loading} onClick={() => post("reactivate")}>
        Reactivate
      </Button>
    </div>
  );
}
