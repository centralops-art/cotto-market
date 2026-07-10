import { describe, expect, it } from "vitest";
import { calculateDeliveryFeeCents, calculateDeliverySplit, calculatePlatformFeeCents } from "./fees";

const region = { baseDeliveryFeeCents: 499, perMileFeeCents: 150 };

describe("calculateDeliveryFeeCents", () => {
  it("returns just the base fee at zero miles", () => {
    expect(calculateDeliveryFeeCents(region, 0)).toBe(499);
  });

  it("adds per-mile fee for round-trip miles", () => {
    expect(calculateDeliveryFeeCents(region, 4)).toBe(499 + 4 * 150);
  });

  it("handles a very long distance", () => {
    expect(calculateDeliveryFeeCents(region, 50)).toBe(499 + 50 * 150);
  });

  it("rejects negative distance", () => {
    expect(() => calculateDeliveryFeeCents(region, -1)).toThrow();
  });
});

describe("calculatePlatformFeeCents", () => {
  it("computes 8% of subtotal", () => {
    expect(calculatePlatformFeeCents(2500, 8)).toBe(200);
  });

  it("computes 0% for a free-trial vendor override", () => {
    expect(calculatePlatformFeeCents(2500, 0)).toBe(0);
  });
});

describe("calculateDeliverySplit", () => {
  it("splits 80/20 by default", () => {
    const result = calculateDeliverySplit(1000, 80);
    expect(result).toEqual({ driverPayoutCents: 800, cottoDeliveryFeeCents: 200 });
  });

  it("splits 75/25 when region setting changes", () => {
    const result = calculateDeliverySplit(1000, 75);
    expect(result).toEqual({ driverPayoutCents: 750, cottoDeliveryFeeCents: 250 });
  });

  it("driver and cotto slices always sum to the total delivery fee", () => {
    const result = calculateDeliverySplit(499, 80);
    expect(result.driverPayoutCents + result.cottoDeliveryFeeCents).toBe(499);
  });
});
