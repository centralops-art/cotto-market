import { addCents, assertIsCents, percentOfCents, type Cents } from "./money";

export interface RegionFeeConfig {
  baseDeliveryFeeCents: Cents;
  perMileFeeCents: Cents;
  deliveryPayoutSplitPct: number;
  freeDeliveryMiles: number;
}

const METERS_PER_MILE = 1609.344;

/**
 * Converts a one-way Mapbox Directions distance (meters, cooking_vendor -> customer)
 * into the one-way miles the delivery fee is priced on. Billed one-way, not
 * round-trip -- founder decision 2026-08-13, see fees.test.ts and migration 0054.
 */
export function metersToMiles(oneWayDistanceMeters: number): number {
  if (oneWayDistanceMeters < 0) {
    throw new Error(`oneWayDistanceMeters must be >= 0, got ${oneWayDistanceMeters}`);
  }
  return oneWayDistanceMeters / METERS_PER_MILE;
}

/**
 * Subtotal for a single vendor's suborder: sum of unit_price_cents * quantity.
 */
export function calculateSubtotalCents(lines: { unitPriceCents: Cents; quantity: number }[]): Cents {
  return lines.reduce((sum, line) => {
    assertIsCents(line.unitPriceCents, "unitPriceCents");
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(`quantity must be a positive integer, got ${line.quantity}`);
    }
    return sum + line.unitPriceCents * line.quantity;
  }, 0);
}

/**
 * Delivery fee = base + (billable miles * per-mile fee), rounded to the nearest
 * cent. Billable miles is one-way distance minus the region's free-mile
 * radius, clamped to 0 (a trip entirely within the free radius costs just the
 * base fee). Snapshotted onto the suborder at checkout time.
 */
export function calculateDeliveryFeeCents(
  region: Pick<RegionFeeConfig, "baseDeliveryFeeCents" | "perMileFeeCents" | "freeDeliveryMiles">,
  oneWayMiles: number
): Cents {
  if (oneWayMiles < 0) {
    throw new Error(`oneWayMiles must be >= 0, got ${oneWayMiles}`);
  }
  assertIsCents(region.baseDeliveryFeeCents, "region.baseDeliveryFeeCents");
  assertIsCents(region.perMileFeeCents, "region.perMileFeeCents");
  if (region.freeDeliveryMiles < 0) {
    throw new Error(`region.freeDeliveryMiles must be >= 0, got ${region.freeDeliveryMiles}`);
  }
  const billableMiles = Math.max(0, oneWayMiles - region.freeDeliveryMiles);
  return addCents(region.baseDeliveryFeeCents, Math.round(billableMiles * region.perMileFeeCents));
}

/**
 * Cook platform fee = subtotal * effective platform fee pct (vendor override or region/system default).
 */
export function calculatePlatformFeeCents(subtotalCents: Cents, platformFeePct: number): Cents {
  return percentOfCents(subtotalCents, platformFeePct);
}

export interface DeliverySplit {
  driverPayoutCents: Cents;
  cottoDeliveryFeeCents: Cents;
}

/**
 * The ONLY place in the codebase that computes the driver/Cotto delivery payout split.
 * Must be called at claim time using the region's CURRENT delivery_payout_split_pct
 * (not the value at checkout) -- the split is authoritative as of the moment of claim.
 */
export function calculateDeliverySplit(
  deliveryFeeCents: Cents,
  deliveryPayoutSplitPct: number
): DeliverySplit {
  assertIsCents(deliveryFeeCents, "deliveryFeeCents");
  if (deliveryPayoutSplitPct < 0 || deliveryPayoutSplitPct > 100) {
    throw new Error(`deliveryPayoutSplitPct must be between 0 and 100, got ${deliveryPayoutSplitPct}`);
  }
  const driverPayoutCents = percentOfCents(deliveryFeeCents, deliveryPayoutSplitPct);
  const cottoDeliveryFeeCents = deliveryFeeCents - driverPayoutCents;
  return { driverPayoutCents, cottoDeliveryFeeCents };
}
