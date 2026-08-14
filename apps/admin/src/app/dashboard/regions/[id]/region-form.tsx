"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Region = {
  id: string;
  dispatch_contact_name: string | null;
  dispatch_emails: string[];
  dispatch_phone: string | null;
  base_delivery_fee_cents: number;
  per_mile_fee_cents: number;
  free_delivery_miles: number;
  delivery_payout_split_pct: number;
  claim_window_t1_minutes: number;
  claim_window_t2_minutes: number;
  claim_window_t3_minutes: number;
  delivery_conflict_rule: "soft_warning" | "hard_block";
};

export function RegionForm({ region }: { region: Region }) {
  const router = useRouter();
  const [contactName, setContactName] = useState(region.dispatch_contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(region.dispatch_phone ?? "");
  const [emails, setEmails] = useState<string[]>(region.dispatch_emails);
  const [newEmail, setNewEmail] = useState("");
  const [baseFee, setBaseFee] = useState(String(region.base_delivery_fee_cents / 100));
  const [perMileFee, setPerMileFee] = useState(String(region.per_mile_fee_cents / 100));
  const [freeMiles, setFreeMiles] = useState(String(region.free_delivery_miles));
  const [payoutSplit, setPayoutSplit] = useState(String(region.delivery_payout_split_pct));
  const [t1, setT1] = useState(String(region.claim_window_t1_minutes));
  const [t2, setT2] = useState(String(region.claim_window_t2_minutes));
  const [t3, setT3] = useState(String(region.claim_window_t3_minutes));
  const [conflictRule, setConflictRule] = useState(region.delivery_conflict_rule);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function addEmail() {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return setError(`"${trimmed}" doesn't look like a valid email`);
    if (emails.includes(trimmed)) return setError(`"${trimmed}" is already in the list`);
    setError(null);
    setEmails([...emails, trimmed]);
    setNewEmail("");
  }

  function removeEmail(email: string) {
    setEmails(emails.filter((e) => e !== email));
  }

  async function save() {
    setError(null);
    setSaved(false);

    const t1n = Number(t1);
    const t2n = Number(t2);
    const t3n = Number(t3);
    if (!(t1n < t2n && t2n < t3n)) {
      return setError("Claim windows must increase in order: T1 < T2 < T3");
    }
    const payoutSplitN = Number(payoutSplit);
    if (Number.isNaN(payoutSplitN) || payoutSplitN < 0 || payoutSplitN > 100) {
      return setError("Driver payout split must be between 0 and 100");
    }
    const baseFeeCents = Math.round(Number(baseFee) * 100);
    const perMileFeeCents = Math.round(Number(perMileFee) * 100);
    if (Number.isNaN(baseFeeCents) || baseFeeCents < 0 || Number.isNaN(perMileFeeCents) || perMileFeeCents < 0) {
      return setError("Delivery fees must be non-negative dollar amounts");
    }
    const freeMilesN = Number(freeMiles);
    if (Number.isNaN(freeMilesN) || freeMilesN < 0) {
      return setError("Free delivery miles must be a non-negative number");
    }

    setLoading(true);
    const res = await fetch(`/api/admin/regions/${region.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dispatch_contact_name: contactName.trim() || null,
        dispatch_phone: contactPhone.trim() || null,
        dispatch_emails: emails,
        base_delivery_fee_cents: baseFeeCents,
        per_mile_fee_cents: perMileFeeCents,
        free_delivery_miles: freeMilesN,
        delivery_payout_split_pct: payoutSplitN,
        claim_window_t1_minutes: t1n,
        claim_window_t2_minutes: t2n,
        claim_window_t3_minutes: t3n,
        delivery_conflict_rule: conflictRule,
      }),
    });
    const result = await res.json();
    setLoading(false);
    if (result.error) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Dispatch contact</h2>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Contact name
            <input
              className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Contact phone
            <input
              className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </label>
          <div>
            <p className="mb-1 text-sm">Dispatch alert emails</p>
            <div className="flex flex-col gap-1">
              {emails.map((email) => (
                <div key={email} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
                  <span>{email}</span>
                  <button type="button" onClick={() => removeEmail(email)} className="text-xs text-destructive hover:underline">
                    Remove
                  </button>
                </div>
              ))}
              {emails.length === 0 && <p className="text-xs text-muted-foreground">No dispatch emails set -- alerts won&apos;t be delivered.</p>}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="email"
                placeholder="add an email"
                className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmail();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addEmail}>
                Add
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Delivery fees & split</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          Delivery fee = base fee + (per-mile fee × one-way miles beyond the free radius). A delivery entirely within the
          free radius costs just the base fee.
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Base delivery fee ($)
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-32 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              value={baseFee}
              onChange={(e) => setBaseFee(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Per-mile fee ($)
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-32 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              value={perMileFee}
              onChange={(e) => setPerMileFee(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Free delivery miles
            <input
              type="number"
              min={0}
              step="0.1"
              className="w-32 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              value={freeMiles}
              onChange={(e) => setFreeMiles(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Driver payout split (%)
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              className="w-32 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              value={payoutSplit}
              onChange={(e) => setPayoutSplit(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Claim window timers</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          T1: dispatch alert. T2: customer offered pickup-or-refund. T3: auto-refund if unresolved. Must strictly increase.
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm">
            T1 (minutes)
            <input
              type="number"
              min={1}
              className="w-24 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              value={t1}
              onChange={(e) => setT1(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            T2 (minutes)
            <input
              type="number"
              min={1}
              className="w-24 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              value={t2}
              onChange={(e) => setT2(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            T3 (minutes)
            <input
              type="number"
              min={1}
              className="w-24 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              value={t3}
              onChange={(e) => setT3(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Delivery conflict rule</h2>
        <select
          className="w-56 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
          value={conflictRule}
          onChange={(e) => setConflictRule(e.target.value as "soft_warning" | "hard_block")}
        >
          <option value="soft_warning">Soft warning</option>
          <option value="hard_block">Hard block</option>
        </select>
      </section>

      <Button disabled={loading} onClick={save} className="self-start">
        Save region settings
      </Button>
    </div>
  );
}
