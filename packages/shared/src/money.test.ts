import { describe, expect, it } from "vitest";
import { addCents, assertIsCents, formatCents, percentOfCents, subtractCents } from "./money";

describe("money", () => {
  it("adds cents", () => {
    expect(addCents(100, 250, 4)).toBe(354);
  });

  it("subtracts cents", () => {
    expect(subtractCents(500, 199)).toBe(301);
  });

  it("computes a percent of cents, rounded", () => {
    expect(percentOfCents(1000, 8)).toBe(80);
    expect(percentOfCents(999, 8)).toBe(80); // 79.92 -> rounds to 80
  });

  it("rejects non-integer cents", () => {
    expect(() => assertIsCents(4.99)).toThrow();
  });

  it("formats cents as USD", () => {
    expect(formatCents(499)).toBe("$4.99");
  });
});
