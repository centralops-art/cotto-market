import { describe, expect, it } from "vitest";
import { formatPickupAddress, mapsUrlForAddress } from "./pickup-address";

describe("formatPickupAddress", () => {
  it("formats a full address", () => {
    expect(formatPickupAddress({ address_line1: "123 Main St", city: "Evanston", state: "IL", zip: "60201" })).toBe(
      "123 Main St, Evanston, IL 60201",
    );
  });

  it("skips missing parts", () => {
    expect(formatPickupAddress({ address_line1: "123 Main St", city: null, state: "IL", zip: null })).toBe("123 Main St, IL");
  });

  it("returns null without a street line", () => {
    expect(formatPickupAddress({ address_line1: "  ", city: "Evanston" })).toBeNull();
    expect(formatPickupAddress(null)).toBeNull();
  });
});

describe("mapsUrlForAddress", () => {
  it("encodes the address", () => {
    expect(mapsUrlForAddress("123 Main St, Evanston, IL 60201")).toBe(
      "https://maps.google.com/?q=123%20Main%20St%2C%20Evanston%2C%20IL%2060201",
    );
  });
});
