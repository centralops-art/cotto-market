/**
 * Price breakdown returned by the `checkout-create-payment-intent` edge
 * function, shown on the checkout screen before the customer enters card
 * details. All amounts are integer cents.
 */
export interface CheckoutVendorBreakdown {
  vendorId: string;
  vendorName: string;
  fulfillment: "pickup" | "delivery";
  subtotalCents: number;
  deliveryFeeCents: number;
  taxCents: number;
}

export interface CheckoutBreakdown {
  vendors: CheckoutVendorBreakdown[];
  subtotalCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  totalCents: number;
}

function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseVendor(value: unknown): CheckoutVendorBreakdown | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.vendorId !== "string" || typeof v.vendorName !== "string") return null;
  if (v.fulfillment !== "pickup" && v.fulfillment !== "delivery") return null;
  if (!isCents(v.subtotalCents) || !isCents(v.deliveryFeeCents) || !isCents(v.taxCents)) return null;
  return {
    vendorId: v.vendorId,
    vendorName: v.vendorName,
    fulfillment: v.fulfillment,
    subtotalCents: v.subtotalCents,
    deliveryFeeCents: v.deliveryFeeCents,
    taxCents: v.taxCents,
  };
}

/** Validates an unknown value as a breakdown; returns null if it doesn't match. */
export function parseCheckoutBreakdown(value: unknown): CheckoutBreakdown | null {
  if (!value || typeof value !== "object") return null;
  const b = value as Record<string, unknown>;
  if (!Array.isArray(b.vendors) || b.vendors.length === 0) return null;
  const vendors = b.vendors.map(parseVendor);
  if (vendors.some((v) => v === null)) return null;
  if (!isCents(b.subtotalCents) || !isCents(b.deliveryFeeCents) || !isCents(b.taxCents) || !isCents(b.totalCents)) {
    return null;
  }
  return {
    vendors: vendors as CheckoutVendorBreakdown[],
    subtotalCents: b.subtotalCents,
    deliveryFeeCents: b.deliveryFeeCents,
    taxCents: b.taxCents,
    totalCents: b.totalCents,
  };
}

/** Parses the JSON string passed to the checkout screen as a route param. */
export function parseCheckoutBreakdownParam(param: string | undefined): CheckoutBreakdown | null {
  if (!param) return null;
  try {
    return parseCheckoutBreakdown(JSON.parse(param));
  } catch {
    return null;
  }
}
