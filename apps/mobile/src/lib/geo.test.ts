import { describe, expect, it } from "vitest";
import { haversineMiles } from "./geo";

describe("haversineMiles", () => {
  it("returns 0 for the same point", () => {
    expect(haversineMiles({ lat: 42.0451, lng: -87.6877 }, { lat: 42.0451, lng: -87.6877 })).toBe(0);
  });

  it("computes a known distance (~1 mile) within a tight tolerance", () => {
    // Roughly 1 mile of latitude difference at this longitude (Evanston, IL).
    const a = { lat: 42.0451, lng: -87.6877 };
    const b = { lat: 42.0596, lng: -87.6877 };
    const miles = haversineMiles(a, b);
    expect(miles).toBeGreaterThan(0.9);
    expect(miles).toBeLessThan(1.1);
  });

  it("is symmetric", () => {
    const a = { lat: 42.0451, lng: -87.6877 };
    const b = { lat: 42.1, lng: -87.75 };
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 10);
  });
});
