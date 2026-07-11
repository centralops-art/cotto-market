import type { WeekHours, Weekday } from "./storefront";

/** Reads the America/Chicago wall-clock weekday/hour/minute for a given instant. */
export function chicagoPartsOf(date: Date): { weekday: Weekday; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    weekday: (parts.weekday as string).toLowerCase() as Weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/**
 * Converts an America/Chicago wall-clock date+time into the UTC instant it
 * represents (DST-aware). One-iteration guess-and-correct: treat the wall
 * time as if it were already UTC, see what Chicago shows for that instant,
 * then shift by the difference.
 */
export function chicagoWallTimeToUTC(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(guess).map((p) => [p.type, p.value]));
  const shownAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute)
  );
  const offsetMs = guess.getTime() - shownAsUtc;
  return new Date(guess.getTime() + offsetMs);
}

/**
 * Every 15-minute pickup slot within `hours` for the Chicago calendar date
 * (year, month, day), excluding any slot that has already passed relative to `now`.
 */
export function generatePickupSlots(
  hours: WeekHours,
  forDate: { year: number; month: number; day: number },
  now: Date = new Date()
): Date[] {
  // Noon UTC anchor is immune to any timezone shifting the calendar day.
  const anchor = new Date(Date.UTC(forDate.year, forDate.month - 1, forDate.day, 12));
  // WEEKDAYS is monday-first; getUTCDay() is sunday-first (0) -- map accordingly.
  const weekdayFromSunday: Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const actualWeekday = weekdayFromSunday[anchor.getUTCDay()]!;

  const dayHours = hours[actualWeekday];
  if (!dayHours || dayHours.closed) return [];

  const [openH, openM] = dayHours.open.split(":").map(Number) as [number, number];
  const [closeH, closeM] = dayHours.close.split(":").map(Number) as [number, number];
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const slots: Date[] = [];
  for (let m = openMinutes; m <= closeMinutes; m += 15) {
    const hour = Math.floor(m / 60);
    const minute = m % 60;
    const slot = chicagoWallTimeToUTC(forDate.year, forDate.month, forDate.day, hour, minute);
    if (slot.getTime() > now.getTime()) slots.push(slot);
  }
  return slots;
}
