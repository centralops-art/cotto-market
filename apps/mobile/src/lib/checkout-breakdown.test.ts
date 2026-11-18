import { describe, expect, it } from "vitest";
import { parseCheckoutBreakdown, parseCheckoutBreakdownParam } from "./checkout-breakdown";

const valid = {
  vendors: [
    {
      vendorId: "v1",
      vendorName: "Tester Kitchen",
      fulfillment: "delivery",
      subtotalCents: 2400,
      deliveryFeeCents: 649,
      taxCents: 247,
    },
    {
      vendorId: "v2",
      vendorName: "Three's Kitchen",
      fulfillment: "pickup",
      subtotalCents: 1000,
      deliveryFeeCents: 0,
      taxCents: 103,
    },
  ],
  subtotalCents: 3400,
  deliveryFeeCents: 649,
  taxCents: 350,
  totalCents: 4399,
};

describe("parseCheckoutBreakdown", () => {
  it("accepts a valid breakdown", () => {
    expect(parseCheckoutBreakdown(valid)).toEqual(valid);
  });

  it("rejects missing or empty vendors", () => {
    expect(parseCheckoutBreakdown({ ...valid, vendors: [] })).toBeNull();
    expect(parseCheckoutBreakdown({ ...valid, vendors: undefined })).toBeNull();
  });

  it("rejects non-integer or negative amounts", () => {
    expect(parseCheckoutBreakdown({ ...valid, totalCents: 43.99 })).toBeNull();
    expect(parseCheckoutBreakdown({ ...valid, taxCents: -1 })).toBeNull();
    expect(
      parseCheckoutBreakdown({ ...valid, vendors: [{ ...valid.vendors[0], deliveryFeeCents: "6.49" }] })
    ).toBeNull();
  });

  it("rejects an unknown fulfillment type", () => {
    expect(parseCheckoutBreakdown({ ...valid, vendors: [{ ...valid.vendors[0], fulfillment: "drone" }] })).toBeNull();
  });
});

describe("parseCheckoutBreakdownParam", () => {
  it("parses a JSON route param", () => {
    expect(parseCheckoutBreakdownParam(JSON.stringify(valid))).toEqual(valid);
  });

  it("returns null for a missing or malformed param", () => {
    expect(parseCheckoutBreakdownParam(undefined)).toBeNull();
    expect(parseCheckoutBreakdownParam("not json")).toBeNull();
  });
});
