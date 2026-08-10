"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function FeeSettings({
  vendorId,
  platformFeePct,
  freeTrialEndsAt,
  defaultPlatformFeePct,
}: {
  vendorId: string;
  platformFeePct: number | null;
  freeTrialEndsAt: string | null;
  defaultPlatformFeePct: number;
}) {
  const router = useRouter();
  const [feeInput, setFeeInput] = useState(platformFeePct === null ? "" : String(platformFeePct));
  const [trialInput, setTrialInput] = useState(toDateInputValue(freeTrialEndsAt));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    const platform_fee_pct = feeInput.trim() === "" ? null : Number(feeInput);
    if (platform_fee_pct !== null && (Number.isNaN(platform_fee_pct) || platform_fee_pct < 0 || platform_fee_pct > 100)) {
      setLoading(false);
      return setError("Fee override must be between 0 and 100");
    }
    const free_trial_ends_at = trialInput ? new Date(`${trialInput}T23:59:59Z`).toISOString() : null;

    const res = await fetch(`/api/admin/vendors/${vendorId}/fee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform_fee_pct, free_trial_ends_at }),
    });
    const result = await res.json();
    setLoading(false);
    if (result.error) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="mt-6 border-t border-border pt-6">
      <h2 className="text-lg font-semibold">Platform fee</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Leave the override blank to use the platform default ({defaultPlatformFeePct}%).
      </p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Fee override (%)
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            placeholder={`default (${defaultPlatformFeePct})`}
            className="w-40 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Trial ends on (optional)
          <input
            type="date"
            className="w-48 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
            value={trialInput}
            onChange={(e) => setTrialInput(e.target.value)}
          />
        </label>
        <Button disabled={loading} onClick={save}>
          Save
        </Button>
      </div>
      {trialInput && (
        <p className="mt-2 text-xs text-muted-foreground">
          A daily job resets the fee override back to the default automatically once the trial date passes.
        </p>
      )}
    </div>
  );
}
