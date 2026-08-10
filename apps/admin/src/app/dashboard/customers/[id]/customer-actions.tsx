"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CustomerActions({ profileId, status }: { profileId: string; status: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [showSuspend, setShowSuspend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body?: unknown) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/customers/${profileId}/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await res.json();
    setLoading(false);
    if (result.error) return setError(result.error);
    setShowSuspend(false);
    setReason("");
    router.refresh();
  }

  if (status === "suspended") {
    return (
      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button disabled={loading} onClick={() => post("reactivate")}>
          Reactivate
        </Button>
      </div>
    );
  }

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
            placeholder="Reason for suspension (blocks checkout only -- the customer can still sign in and browse)"
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
