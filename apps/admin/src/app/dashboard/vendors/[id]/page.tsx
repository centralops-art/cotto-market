import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/badge";
import { VendorActions } from "./vendor-actions";

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const service = createServiceRoleClient();
  const { data: vendor } = await service.from("vendors").select("*").eq("id", id).single();
  if (!vendor) notFound();

  let cfpmSignedUrl: string | null = null;
  if (vendor.cfpm_cert_url) {
    const { data } = await service.storage.from("cfpm-certs").createSignedUrl(vendor.cfpm_cert_url, 300);
    cfpmSignedUrl = data?.signedUrl ?? null;
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/dashboard/vendors" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to vendors
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{vendor.storefront_name}</h1>
        <StatusBadge status={vendor.status} />
      </div>

      {vendor.rejected_reason && (
        <p className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Last rejection reason: {vendor.rejected_reason}
        </p>
      )}

      <dl className="mt-6 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-muted-foreground">Tagline</dt>
        <dd>{vendor.tagline || "--"}</dd>
        <dt className="text-muted-foreground">Vendor types</dt>
        <dd>{vendor.vendor_types?.join(", ") || "--"}</dd>
        <dt className="text-muted-foreground">Phone</dt>
        <dd>{vendor.phone || "--"}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd>{vendor.email || "--"}</dd>
        <dt className="text-muted-foreground">Address</dt>
        <dd>
          {vendor.address_line1 ? `${vendor.address_line1}, ${vendor.city}, ${vendor.state} ${vendor.zip}` : "--"}
        </dd>
        <dt className="text-muted-foreground">Cottage food agreement</dt>
        <dd>{vendor.cottage_food_acknowledged_at ? new Date(vendor.cottage_food_acknowledged_at).toLocaleString() : "Not yet"}</dd>
        <dt className="text-muted-foreground">CFPM cert expires</dt>
        <dd>{vendor.cfpm_cert_expires_on ?? "--"}</dd>
        <dt className="text-muted-foreground">Stripe account</dt>
        <dd>{vendor.stripe_account_id ?? "Not connected"}</dd>
      </dl>

      <div className="mt-6">
        <p className="mb-2 text-sm text-muted-foreground">CFPM certificate</p>
        {cfpmSignedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cfpmSignedUrl} alt="CFPM certificate" className="max-w-full rounded-lg border border-border" />
        ) : (
          <p className="text-sm text-muted-foreground">No certificate uploaded yet.</p>
        )}
      </div>

      <VendorActions vendorId={vendor.id} status={vendor.status} />
    </main>
  );
}
