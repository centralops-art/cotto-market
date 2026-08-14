import { describe, expect, it } from "vitest";
import {
  calculateDeliveryFeeCents,
  calculateDeliverySplit,
  calculatePlatformFeeCents,
  calculateSubtotalCents,
  metersToMiles,
} from "./fees";

const region = { baseDeliveryFeeCents: 499, perMileFeeCents: 150, freeDeliveryMiles: 5 };

describe("calculateDeliveryFeeCents", () => {
  it("returns just the base fee at zero miles", () => {
    expect(calculateDeliveryFeeCents(region, 0)).toBe(499);
  });

  it("returns just the base fee for any distance within the free radius", () => {
    expect(calculateDeliveryFeeCents(region, 3)).toBe(499);
    expect(calculateDeliveryFeeCents(region, 5)).toBe(499);
  });

  it("charges per-mile only for the portion beyond the free radius", () => {
    // 8 one-way miles, 5 free -> 3 billable miles
    expect(calculateDeliveryFeeCents(region, 8)).toBe(499 + 3 * 150);
  });

  it("handles a very long distance", () => {
    expect(calculateDeliveryFeeCents(region, 55)).toBe(499 + 50 * 150);
  });

  it("rejects negative distance", () => {
    expect(() => calculateDeliveryFeeCents(region, -1)).toThrow();
  });

  it("a zero free-mile radius behaves like the old from-mile-zero pricing", () => {
    const noFreeRadius = { ...region, freeDeliveryMiles: 0 };
    expect(calculateDeliveryFeeCents(noFreeRadius, 4)).toBe(499 + 4 * 150);
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

describe("metersToMiles", () => {
  it("returns 0 for a zero-distance Mapbox result", () => {
    expect(metersToMiles(0)).toBe(0);
  });

  it("converts one-way meters to one-way miles", () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 5);
  });

  it("handles a very long distance", () => {
    expect(metersToMiles(80467.2)).toBeCloseTo(50, 3);
  });

  it("rejects negative distance", () => {
    expect(() => metersToMiles(-1)).toThrow();
  });
});

describe("calculateSubtotalCents", () => {
  it("sums unit price * quantity across lines", () => {
    expect(
      calculateSubtotalCents([
        { unitPriceCents: 500, quantity: 2 },
        { unitPriceCents: 1200, quantity: 1 },
      ])
    ).toBe(2200);
  });

  it("returns 0 for an empty cart", () => {
    expect(calculateSubtotalCents([])).toBe(0);
  });

  it("rejects a zero or negative quantity", () => {
    expect(() => calculateSubtotalCents([{ unitPriceCents: 500, quantity: 0 }])).toThrow();
  });
});
