import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { StatusBadge } from "@/components/ui/badge";
import { CustomerActions } from "./customer-actions";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  const { id } = await params;
  const { data: profile } = await admin.service.from("profiles").select("*").eq("id", id).single();
  if (!profile) notFound();

  const { data: userAuth } = await admin.service.auth.admin.getUserById(id);

  const { data: orders } = await admin.service
    .from("orders")
    .select("id, status, total_cents, created_at")
    .eq("customer_profile_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/dashboard/customers" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to customers
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{profile.full_name || "(no name set)"}</h1>
        <StatusBadge status={profile.status} />
      </div>

      {profile.suspended_reason && (
        <p className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Suspension reason: {profile.suspended_reason}
        </p>
      )}

      <dl className="mt-6 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd>{userAuth?.user?.email ?? "--"}</dd>
        <dt className="text-muted-foreground">Phone</dt>
        <dd>{profile.phone || "--"}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd>{profile.role}</dd>
        <dt className="text-muted-foreground">Joined</dt>
        <dd>{new Date(profile.created_at).toLocaleString()}</dd>
      </dl>

      <CustomerActions profileId={profile.id} status={profile.status} />

      <div className="mt-10 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">Recent orders</h2>
        <div className="mt-3 flex flex-col gap-2">
          {orders?.length ? (
            orders.map((order) => (
              <Link
                key={order.id}
                href={`/dashboard/orders/${order.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-muted"
              >
                <span>{new Date(order.created_at).toLocaleDateString()}</span>
                <span>${(order.total_cents / 100).toFixed(2)}</span>
                <StatusBadge status={order.status} />
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}
