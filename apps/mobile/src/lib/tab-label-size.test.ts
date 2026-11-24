import { describe, expect, it } from "vitest";
import { tabLabelSize } from "./tab-label-size";

describe("tabLabelSize", () => {
  it("keeps the normal size when tabs are wide enough", () => {
    expect(tabLabelSize(393, 5)).toBe(10);
    expect(tabLabelSize(412, 7)).toBe(10);
  });

  it("shrinks for seven tabs on a 320pt screen (iPhone Display Zoom)", () => {
    expect(tabLabelSize(320, 7)).toBe(8);
  });

  it("never goes below the minimum", () => {
    expect(tabLabelSize(240, 7)).toBe(7.5);
  });
});
