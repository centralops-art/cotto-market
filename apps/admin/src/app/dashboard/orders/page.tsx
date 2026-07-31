import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { StatusBadge } from "@/components/ui/badge";

export default async function OrdersPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  const { data: orders } = await admin.service
    .from("orders")
    .select("id, total_cents, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to dashboard
      </Link>
      <h1 className="mb-6 mt-4 text-2xl font-bold">Orders</h1>

      <div className="flex flex-col gap-2">
        {orders?.length ? (
          orders.map((order) => (
            <Link
              key={order.id}
              href={`/dashboard/orders/${order.id}`}
              className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted"
            >
              <div>
                <p className="font-medium">${(order.total_cents / 100).toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">{new Date(order.created_at).toLocaleString()}</p>
              </div>
              <StatusBadge status={order.status} />
            </Link>
          ))
        ) : (
          <p className="text-muted-foreground">No orders yet.</p>
        )}
      </div>
    </main>
  );
}
