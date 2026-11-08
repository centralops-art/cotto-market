import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { StatusBadge } from "@/components/ui/badge";
import { VendorActions } from "./vendor-actions";
import { DeliveryProfileActions } from "./delivery-profile-actions";
import { FeeSettings } from "./fee-settings";
import { AvailabilityList } from "./availability-list";

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  const { id } = await params;
  const { data: vendor } = await admin.service.from("vendors").select("*").eq("id", id).single();
  if (!vendor) notFound();

  let cfpmSignedUrl: string | null = null;
  if (vendor.cfpm_cert_url) {
    const { data } = await admin.service.storage.from("cfpm-certs").createSignedUrl(vendor.cfpm_cert_url, 300);
    cfpmSignedUrl = data?.signedUrl ?? null;
  }

  const { data: settings } = await admin.service.from("system_settings").select("default_platform_fee_pct").eq("id", 1).single();

  const { data: deliveryProfile } = await admin.service
    .from("vendor_delivery_profiles")
    .select("*")
    .eq("vendor_id", vendor.id)
    .maybeSingle();

  let licenseFrontSignedUrl: string | null = null;
  let licenseBackSignedUrl: string | null = null;
  if (deliveryProfile?.drivers_license_front_url) {
    const { data } = await admin.service.storage
      .from("drivers-licenses")
      .createSignedUrl(deliveryProfile.drivers_license_front_url, 300);
    licenseFrontSignedUrl = data?.signedUrl ?? null;
  }
  if (deliveryProfile?.drivers_license_back_url) {
    const { data } = await admin.service.storage
      .from("drivers-licenses")
      .createSignedUrl(deliveryProfile.drivers_license_back_url, 300);
    licenseBackSignedUrl = data?.signedUrl ?? null;
  }

  // Family / team-member drivers (migration 0060), each with signed URLs for
  // their license images (5-minute expiry, same as above).
  const { data: teamDriverRows } = await admin.service
    .from("vendor_team_drivers")
    .select("*, vendor_team_members(display_name)")
    .eq("vendor_id", vendor.id)
    .order("created_at");
  const signLicense = async (path: string) =>
    (await admin.service.storage.from("drivers-licenses").createSignedUrl(path, 300)).data?.signedUrl ?? null;
  const teamDrivers = await Promise.all(
    (teamDriverRows ?? []).map(async (row) => ({
      ...row,
      memberName: (row.vendor_team_members as unknown as { display_name: string } | null)?.display_name ?? "Team member",
      frontSignedUrl: await signLicense(row.drivers_license_front_url),
      backSignedUrl: await signLicense(row.drivers_license_back_url),
    }))
  );

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
      {vendor.suspended_reason && (
        <p className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Suspension reason: {vendor.suspended_reason}
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

      <FeeSettings
        vendorId={vendor.id}
        platformFeePct={vendor.platform_fee_pct}
        freeTrialEndsAt={vendor.free_trial_ends_at}
        defaultPlatformFeePct={settings?.default_platform_fee_pct ?? 8}
      />

      {deliveryProfile && (
        <div className="mt-10 border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Delivery Partner</h2>
            <StatusBadge status={deliveryProfile.status} />
          </div>

          {deliveryProfile.rejected_reason && (
            <p className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Last rejection reason: {deliveryProfile.rejected_reason}
            </p>
          )}

          <dl className="mt-4 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Vehicle type</dt>
            <dd>{deliveryProfile.vehicle_type ?? "--"}</dd>
            <dt className="text-muted-foreground">License expires</dt>
            <dd>{deliveryProfile.drivers_license_expires_on ?? "--"}</dd>
            <dt className="text-muted-foreground">Default radius</dt>
            <dd>{deliveryProfile.default_radius_miles ? `${deliveryProfile.default_radius_miles} miles` : "--"}</dd>
            <dt className="text-muted-foreground">Insurance attested</dt>
            <dd>{deliveryProfile.insurance_attested_at ? new Date(deliveryProfile.insurance_attested_at).toLocaleString() : "Not yet"}</dd>
            <dt className="text-muted-foreground">Agreement accepted</dt>
            <dd>
              {deliveryProfile.delivery_agreement_accepted_at
                ? new Date(deliveryProfile.delivery_agreement_accepted_at).toLocaleString()
                : "Not yet"}
            </dd>
            <dt className="text-muted-foreground">Availability</dt>
            <dd>
              <AvailabilityList availability={deliveryProfile.availability} />
            </dd>
          </dl>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">License (front)</p>
              {licenseFrontSignedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={licenseFrontSignedUrl} alt="Driver's license front" className="max-w-full rounded-lg border border-border" />
              ) : (
                <p className="text-sm text-muted-foreground">Not uploaded yet.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">License (back)</p>
              {licenseBackSignedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={licenseBackSignedUrl} alt="Driver's license back" className="max-w-full rounded-lg border border-border" />
              ) : (
                <p className="text-sm text-muted-foreground">Not uploaded yet.</p>
              )}
            </div>
          </div>

          <DeliveryProfileActions deliveryProfileId={deliveryProfile.id} status={deliveryProfile.status} />
        </div>
      )}

      {teamDrivers.length > 0 && (
        <div className="mt-10 border-t border-border pt-6">
          <h2 className="text-lg font-semibold">Family drivers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Team members who deliver under this storefront&apos;s account. Each needs their own license on file.
          </p>

          {teamDrivers.map((td) => (
            <div key={td.id} className="mt-6 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{td.memberName}</h3>
                <StatusBadge status={td.status} />
              </div>

              {td.rejected_reason && (
                <p className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  Last rejection reason: {td.rejected_reason}
                </p>
              )}
              {td.suspended_reason && (
                <p className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  Suspension reason: {td.suspended_reason}
                </p>
              )}

              <dl className="mt-4 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Vehicle type</dt>
                <dd>{td.vehicle_type}</dd>
                <dt className="text-muted-foreground">License expires</dt>
                <dd>{td.drivers_license_expires_on}</dd>
                <dt className="text-muted-foreground">Insurance attested</dt>
                <dd>{new Date(td.insurance_attested_at).toLocaleString()}</dd>
                <dt className="text-muted-foreground">Agreement accepted</dt>
                <dd>{new Date(td.delivery_agreement_accepted_at).toLocaleString()}</dd>
              </dl>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">License (front)</p>
                  {td.frontSignedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={td.frontSignedUrl} alt={`${td.memberName} license front`} className="max-w-full rounded-lg border border-border" />
                  ) : (
                    <p className="text-sm text-muted-foreground">Image unavailable.</p>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">License (back)</p>
                  {td.backSignedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={td.backSignedUrl} alt={`${td.memberName} license back`} className="max-w-full rounded-lg border border-border" />
                  ) : (
                    <p className="text-sm text-muted-foreground">Image unavailable.</p>
                  )}
                </div>
              </div>

              <DeliveryProfileActions
                deliveryProfileId={td.id}
                status={td.status}
                apiBase="/api/admin/team-drivers"
                pendingStatus="pending_review"
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
