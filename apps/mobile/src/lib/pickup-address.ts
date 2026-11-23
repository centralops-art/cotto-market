// Kitchen pickup address for customers' pickup orders. vendors_select RLS
// already lets anyone read an active vendor's address columns, so this is
// display-only.

export type VendorAddressFields = {
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

/** "123 Main St, Evanston, IL 60201", or null if the street line is missing. */
export function formatPickupAddress(vendor: VendorAddressFields | null | undefined): string | null {
  const line1 = vendor?.address_line1?.trim();
  if (!line1) return null;
  const city = vendor?.city?.trim();
  const stateZip = [vendor?.state?.trim(), vendor?.zip?.trim()].filter(Boolean).join(" ");
  return [line1, city, stateZip].filter(Boolean).join(", ");
}

/** Maps link that works on both platforms (opens Apple/Google Maps or the browser). */
export function mapsUrlForAddress(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}
