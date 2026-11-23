// Vendor columns any customer may read (HANDOFF.md §44). The street address
// and exact lat/lng are left out on purpose: once migration 0068 is applied,
// selecting them (or "*") from vendors fails for app users. Use my_vendor()
// for the cook's own row, suborder_pickup_location() for an order's pickup
// address, and pool_pickup_coords() for drivers.
export const PUBLIC_VENDOR_COLUMNS =
  "id, owner_profile_id, region_id, storefront_name, slug, tagline, description, vendor_types, city, state, zip, phone, email, website, header_image_url, theme_palette, layout_style, hours, preorder_hours, status, published_at, created_at, updated_at" as const;
