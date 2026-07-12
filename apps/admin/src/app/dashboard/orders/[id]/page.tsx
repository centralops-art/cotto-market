import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/badge";
import { OrderActions } from "./order-actions";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const service = createServiceRoleClient();
  const { data: order } = await service.from("orders").select("*").eq("id", id).single();
  if (!order) notFound();

  const { data: customerAuth } = await service.auth.admin.getUserById(order.customer_profile_id);

  const { data: suborders } = await service
    .from("vendor_suborders")
    .select("*, vendors(storefront_name), order_items(*)")
    .eq("order_id", id)
    .order("created_at");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/dashboard/orders" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to orders
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">${(order.total_cents / 100).toFixed(2)}</h1>
        <StatusBadge status={order.status} />
      </div>

      <dl className="mt-6 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-muted-foreground">Customer</dt>
        <dd>{customerAuth?.user?.email ?? "--"}</dd>
        <dt className="text-muted-foreground">Placed</dt>
        <dd>{new Date(order.created_at).toLocaleString()}</dd>
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd>${(order.subtotal_cents / 100).toFixed(2)}</dd>
        <dt className="text-muted-foreground">Delivery fee</dt>
        <dd>${(order.delivery_fee_cents / 100).toFixed(2)}</dd>
        <dt className="text-muted-foreground">Tax</dt>
        <dd>${(order.tax_cents / 100).toFixed(2)}</dd>
        <dt className="text-muted-foreground">Platform fee</dt>
        <dd>${(order.platform_fee_cents / 100).toFixed(2)}</dd>
        <dt className="text-muted-foreground">Payment Intent</dt>
        <dd className="truncate">{order.payment_intent_id ?? "--"}</dd>
      </dl>

      <div className="mt-6 flex flex-col gap-4">
        {suborders?.map((suborder) => (
          <div key={suborder.id} className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {(suborder.vendors as unknown as { storefront_name: string })?.storefront_name ?? "Vendor"}
              </p>
              <StatusBadge status={suborder.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {suborder.fulfillment === "pickup"
                ? `Pickup at ${suborder.pickup_at ? new Date(suborder.pickup_at).toLocaleString() : "--"}`
                : `Delivery to ${(suborder.delivery_address as { line1?: string })?.line1 ?? "--"}`}
            </p>
            <ul className="mt-2 text-sm">
              {(suborder.order_items as { name_snapshot: string; quantity: number; unit_price_cents: number }[])?.map(
                (item, i) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      {item.quantity}&times; {item.name_snapshot}
                    </span>
                    <span>${((item.unit_price_cents * item.quantity) / 100).toFixed(2)}</span>
                  </li>
                )
              )}
            </ul>
          </div>
        ))}
      </div>

      <OrderActions orderId={order.id} status={order.status} />
    </main>
  );
}
