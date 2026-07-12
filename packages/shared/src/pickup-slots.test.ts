import { describe, expect, it } from "vitest";
import { chicagoPartsOf, chicagoWallTimeToUTC, generatePickupSlots } from "./pickup-slots";
import { defaultWeekHours, type WeekHours } from "./storefront";

describe("chicagoWallTimeToUTC / chicagoPartsOf round-trip", () => {
  it("round-trips a winter (CST, UTC-6) time", () => {
    const utc = chicagoWallTimeToUTC(2026, 1, 15, 14, 30);
    expect(utc.toISOString()).toBe("2026-01-15T20:30:00.000Z");
    expect(chicagoPartsOf(utc)).toEqual({ weekday: "thursday", hour: 14, minute: 30 });
  });

  it("round-trips a summer (CDT, UTC-5) time", () => {
    const utc = chicagoWallTimeToUTC(2026, 7, 15, 14, 30);
    expect(utc.toISOString()).toBe("2026-07-15T19:30:00.000Z");
    expect(chicagoPartsOf(utc)).toEqual({ weekday: "wednesday", hour: 14, minute: 30 });
  });
});

describe("generatePickupSlots", () => {
  const hours: WeekHours = {
    ...defaultWeekHours(),
    thursday: { closed: false, open: "09:00", close: "10:00" },
    friday: { closed: true, open: "09:00", close: "17:00" },
  };

  it("generates 15-min slots from open to close inclusive", () => {
    const slots = generatePickupSlots(hours, { year: 2026, month: 1, day: 15 }, new Date("2026-01-01T00:00:00Z"));
    expect(slots.map((s) => chicagoPartsOf(s).hour * 60 + chicagoPartsOf(s).minute)).toEqual([
      9 * 60,
      9 * 60 + 15,
      9 * 60 + 30,
      9 * 60 + 45,
      10 * 60,
    ]);
  });

  it("returns no slots on a closed day", () => {
    expect(generatePickupSlots(hours, { year: 2026, month: 1, day: 16 }, new Date("2026-01-01T00:00:00Z"))).toEqual([]);
  });

  it("excludes slots already in the past", () => {
    // "now" is 09:20 Chicago on that Thursday -- the 09:00 and 09:15 slots should be gone.
    const now = chicagoWallTimeToUTC(2026, 1, 15, 9, 20);
    const slots = generatePickupSlots(hours, { year: 2026, month: 1, day: 15 }, now);
    expect(slots.length).toBe(3);
    expect(chicagoPartsOf(slots[0]!).hour * 60 + chicagoPartsOf(slots[0]!).minute).toBe(9 * 60 + 30);
  });
});
