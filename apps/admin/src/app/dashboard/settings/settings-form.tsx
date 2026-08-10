"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SettingsForm({
  defaultPlatformFeePct,
  freeTrialDefaultDays,
}: {
  defaultPlatformFeePct: number;
  freeTrialDefaultDays: number;
}) {
  const router = useRouter();
  const [feeInput, setFeeInput] = useState(String(defaultPlatformFeePct));
  const [trialDaysInput, setTrialDaysInput] = useState(String(freeTrialDefaultDays));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const fee = Number(feeInput);
    const days = Number(trialDaysInput);
    if (Number.isNaN(fee) || fee < 0 || fee > 100) {
      setLoading(false);
      return setError("Platform fee must be between 0 and 100");
    }
    if (!Number.isInteger(days) || days < 0) {
      setLoading(false);
      return setError("Trial length must be a non-negative whole number of days");
    }

    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_platform_fee_pct: fee, free_trial_default_days: days }),
    });
    const result = await res.json();
    setLoading(false);
    if (result.error) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border p-4">
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      {saved && <p className="mb-2 text-sm text-green-600 dark:text-green-400">Saved.</p>}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Default platform fee (%)
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            className="w-40 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Default trial length (days)
          <input
            type="number"
            min={0}
            step="1"
            className="w-40 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
            value={trialDaysInput}
            onChange={(e) => setTrialDaysInput(e.target.value)}
          />
        </label>
        <Button disabled={loading} onClick={save}>
          Save
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Applies to any vendor without a per-vendor fee override (set on the vendor&apos;s own detail page).
      </p>
    </div>
  );
}
