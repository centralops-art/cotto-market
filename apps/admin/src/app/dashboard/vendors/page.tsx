import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_TABS = ["pending_review", "draft", "unpublished", "active", "suspended", "all"] as const;

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { status } = await searchParams;
  const activeTab: (typeof STATUS_TABS)[number] = STATUS_TABS.includes(status as (typeof STATUS_TABS)[number])
    ? (status as (typeof STATUS_TABS)[number])
    : "pending_review";

  const service = createServiceRoleClient();
  let query = service
    .from("vendors")
    .select("id, storefront_name, status, created_at, vendor_types")
    .order("created_at", { ascending: false });
  if (activeTab !== "all") query = query.eq("status", activeTab);
  const { data: vendors } = await query;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Vendors</h1>

      <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab}
            href={`/dashboard/vendors?status=${tab}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.replace("_", " ")}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-2">
        {vendors?.length ? (
          vendors.map((vendor) => (
            <Link
              key={vendor.id}
              href={`/dashboard/vendors/${vendor.id}`}
              className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted"
            >
              <div>
                <p className="font-medium">{vendor.storefront_name}</p>
                <p className="text-sm text-muted-foreground">{vendor.vendor_types?.join(", ") || "No type set"}</p>
              </div>
              <StatusBadge status={vendor.status} />
            </Link>
          ))
        ) : (
          <p className="text-muted-foreground">No vendors in this status.</p>
        )}
      </div>
    </main>
  );
}
