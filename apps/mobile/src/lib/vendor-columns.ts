// Vendor columns the customer screens read (HANDOFF.md §44, §47 A, §48). Only
// what those screens show or filter on: selecting a column that isn't granted
// to app users (or "*") fails the whole query. Contact and location columns
// are left out so they can be locked once testers are on a build with this
// list. Use my_vendor() for the cook's own row, suborder_pickup_location()
// for an order's pickup address, and pool_pickup_coords() for drivers.
export const PUBLIC_VENDOR_COLUMNS =
  "id, owner_profile_id, region_id, storefront_name, tagline, vendor_types, header_image_url, theme_palette, layout_style, hours, social_links, status" as const;
