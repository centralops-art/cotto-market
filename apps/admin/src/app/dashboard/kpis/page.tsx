import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { cn } from "@/lib/utils";

const WINDOW_OPTIONS = [7, 30] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function KpisPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  const { window: windowParam } = await searchParams;
  const windowDays: WindowDays = WINDOW_OPTIONS.includes(Number(windowParam) as WindowDays)
    ? (Number(windowParam) as WindowDays)
    : 7;
  const cutoffIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  // ---- GMV / platform fee / order volume (windowed by orders.created_at) ----
  // GMV and platform-fee revenue only count orders that actually transacted --
  // a still-pending checkout never charged anything. A later refund doesn't
  // reverse it out of this count (same "what actually moved through Stripe"
  // framing used elsewhere in this project, e.g. refund-suborder.ts).
  const TRANSACTED_STATUSES = ["paid", "refunded", "partially_refunded"];
  const { data: windowOrders } = await admin.service
    .from("orders")
    .select("id, region_id, status, total_cents, platform_fee_cents, created_at")
    .gte("created_at", cutoffIso);

  const transacted = (windowOrders ?? []).filter((o) => TRANSACTED_STATUSES.includes(o.status));
  const gmvCents = transacted.reduce((sum, o) => sum + o.total_cents, 0);
  const platformFeeCents = transacted.reduce((sum, o) => sum + o.platform_fee_cents, 0);

  // ---- Live orders: a snapshot, not windowed -- suborders still in flight right now ----
  const { count: liveCount } = await admin.service
    .from("vendor_suborders")
    .select("id", { count: "exact", head: true })
    .not("status", "in", "(completed,cancelled,refunded)");

  // ---- Delivery network stats ----
  const { count: activeDriverCount } = await admin.service
    .from("vendor_delivery_profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "delivery_active");

  const { data: deliverySuborders } = await admin.service
    .from("vendor_suborders")
    .select("id, ready_at, vendors(region_id, regions(claim_window_t1_minutes))")
    .eq("fulfillment", "delivery")
    .not("ready_at", "is", null)
    .gte("ready_at", cutoffIso);

  const suborderIds = (deliverySuborders ?? []).map((s) => s.id);
  const { data: claimsForWindow } = suborderIds.length
    ? await admin.service.from("delivery_claims").select("vendor_suborder_id, claimed_at").in("vendor_suborder_id", suborderIds)
    : { data: [] as { vendor_suborder_id: string; claimed_at: string }[] };

  const firstClaimBySuborder = new Map<string, number>();
  for (const claim of claimsForWindow ?? []) {
    const t = new Date(claim.claimed_at).getTime();
    const existing = firstClaimBySuborder.get(claim.vendor_suborder_id);
    if (existing === undefined || t < existing) firstClaimBySuborder.set(claim.vendor_suborder_id, t);
  }

  let claimedBeforeT1 = 0;
  let claimedCount = 0;
  let totalClaimMinutes = 0;
  for (const so of deliverySuborders ?? []) {
    const readyAt = new Date(so.ready_at as string).getTime();
    const firstClaim = firstClaimBySuborder.get(so.id);
    if (firstClaim === undefined) continue;
    claimedCount++;
    const minutesToClaim = (firstClaim - readyAt) / 60000;
    totalClaimMinutes += minutesToClaim;
    const t1 = (so.vendors as unknown as { regions: { claim_window_t1_minutes: number } | null } | null)?.regions
      ?.claim_window_t1_minutes;
    if (t1 !== undefined && minutesToClaim <= t1) claimedBeforeT1++;
  }
  const totalDeliveries = (deliverySuborders ?? []).length;
  const pctClaimedBeforeT1 = totalDeliveries > 0 ? (claimedBeforeT1 / totalDeliveries) * 100 : null;
  const avgMinutesToClaim = claimedCount > 0 ? totalClaimMinutes / claimedCount : null;

  const { count: t3RefundCount } = await admin.service
    .from("delivery_dispatch_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "t3_auto_refunded")
    .gte("occurred_at", cutoffIso);

  // ---- Driver leaderboard (windowed by claimed_at) ----
  const { data: windowClaims } = await admin.service
    .from("delivery_claims")
    .select("driver_vendor_id, delivered_at, customer_rating, vendor_suborders(status)")
    .gte("claimed_at", cutoffIso);

  const leaderboard = new Map<string, { completed: number; ratingSum: number; ratingCount: number }>();
  for (const claim of windowClaims ?? []) {
    const suborderStatus = (claim.vendor_suborders as unknown as { status: string } | null)?.status;
    if (suborderStatus !== "completed") continue;
    const entry = leaderboard.get(claim.driver_vendor_id) ?? { completed: 0, ratingSum: 0, ratingCount: 0 };
    entry.completed++;
    if (claim.customer_rating !== null) {
      entry.ratingSum += claim.customer_rating;
      entry.ratingCount++;
    }
    leaderboard.set(claim.driver_vendor_id, entry);
  }
  const driverIds = Array.from(leaderboard.keys());
  const { data: driverVendors } = driverIds.length
    ? await admin.service.from("vendors").select("id, storefront_name").in("id", driverIds)
    : { data: [] as { id: string; storefront_name: string }[] };
  const driverNameById = new Map((driverVendors ?? []).map((v) => [v.id, v.storefront_name]));
  const leaderboardRows = Array.from(leaderboard.entries())
    .map(([driverId, stats]) => ({
      driverId,
      name: driverNameById.get(driverId) ?? driverId,
      completed: stats.completed,
      avgRating: stats.ratingCount > 0 ? stats.ratingSum / stats.ratingCount : null,
    }))
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 10);

  // ---- Per-region breakdown (windowed, same orders already fetched above) ----
  const { data: regions } = await admin.service.from("regions").select("id, name");
  const regionRows = (regions ?? []).map((region) => {
    const regionOrders = transacted.filter((o) => o.region_id === region.id);
    return {
      id: region.id,
      name: region.name,
      orderCount: regionOrders.length,
      gmvCents: regionOrders.reduce((sum, o) => sum + o.total_cents, 0),
    };
  });

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to dashboard
      </Link>

      <div className="mb-6 mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">KPIs</h1>
        <nav className="flex gap-2">
          {WINDOW_OPTIONS.map((d) => (
            <Link
              key={d}
              href={`/dashboard/kpis?window=${d}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                windowDays === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              Last {d} days
            </Link>
          ))}
        </nav>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Live orders" value={String(liveCount ?? 0)} sub="in-flight suborders right now" />
        <StatCard label="GMV" value={fmtUsd(gmvCents)} sub={`${transacted.length} transacted orders`} />
        <StatCard label="Platform fee revenue" value={fmtUsd(platformFeeCents)} />
      </section>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Delivery network</h2>
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active delivery partners" value={String(activeDriverCount ?? 0)} />
        <StatCard
          label="% claimed before T1"
          value={pctClaimedBeforeT1 === null ? "--" : `${pctClaimedBeforeT1.toFixed(0)}%`}
          sub={`${totalDeliveries} ready in window`}
        />
        <StatCard
          label="Avg time to claim"
          value={avgMinutesToClaim === null ? "--" : `${avgMinutesToClaim.toFixed(1)} min`}
        />
        <StatCard label="T3 auto-refunds" value={String(t3RefundCount ?? 0)} />
      </section>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Driver leaderboard</h2>
      <div className="flex flex-col gap-2">
        {leaderboardRows.length ? (
          leaderboardRows.map((row) => (
            <div key={row.driverId} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
              <span className="font-medium">{row.name}</span>
              <span className="text-muted-foreground">{row.completed} completed</span>
              <span className="text-muted-foreground">{row.avgRating === null ? "no ratings" : `${row.avgRating.toFixed(1)} ★`}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No completed deliveries in this window.</p>
        )}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">By region</h2>
      <div className="flex flex-col gap-2">
        {regionRows.map((region) => (
          <Link
            key={region.id}
            href={`/dashboard/regions/${region.id}`}
            className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-muted"
          >
            <span className="font-medium">{region.name}</span>
            <span className="text-muted-foreground">{region.orderCount} orders</span>
            <span className="text-muted-foreground">{fmtUsd(region.gmvCents)} GMV</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
