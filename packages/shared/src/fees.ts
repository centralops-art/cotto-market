import { addCents, assertIsCents, percentOfCents, type Cents } from "./money";

export interface RegionFeeConfig {
  baseDeliveryFeeCents: Cents;
  perMileFeeCents: Cents;
  deliveryPayoutSplitPct: number;
}

const METERS_PER_MILE = 1609.344;

/**
 * Converts a one-way Mapbox Directions distance (meters, cooking_vendor -> customer)
 * into the round-trip miles the delivery fee is priced on.
 */
export function metersToRoundTripMiles(oneWayDistanceMeters: number): number {
  if (oneWayDistanceMeters < 0) {
    throw new Error(`oneWayDistanceMeters must be >= 0, got ${oneWayDistanceMeters}`);
  }
  return (2 * oneWayDistanceMeters) / METERS_PER_MILE;
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
 * Delivery fee = base + (round-trip miles * per-mile fee), rounded to the nearest cent.
 * Snapshotted onto the suborder at checkout time.
 */
export function calculateDeliveryFeeCents(
  region: Pick<RegionFeeConfig, "baseDeliveryFeeCents" | "perMileFeeCents">,
  roundTripMiles: number
): Cents {
  if (roundTripMiles < 0) {
    throw new Error(`roundTripMiles must be >= 0, got ${roundTripMiles}`);
  }
  assertIsCents(region.baseDeliveryFeeCents, "region.baseDeliveryFeeCents");
  assertIsCents(region.perMileFeeCents, "region.perMileFeeCents");
  return addCents(region.baseDeliveryFeeCents, Math.round(roundTripMiles * region.perMileFeeCents));
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
