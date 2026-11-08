import { DAY_OF_WEEK_LABELS, type Availability, type DayOfWeek } from "@cotto/shared";

const DAY_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// "17:00" -> "5:00 PM". Stored values are 24h local "HH:mm".
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// A driver's weekly availability as a Monday-first day list, e.g.
// "Monday  9:00 AM – 5:00 PM". Days with no windows read "Not available".
export function AvailabilityList({ availability }: { availability: unknown }) {
  const value = (availability ?? {}) as Availability;
  if (Object.keys(value).length === 0) return <span>--</span>;

  return (
    <ul className="flex flex-col gap-0.5">
      {DAY_ORDER.map((day) => {
        const windows = value[day] ?? [];
        return (
          <li key={day} className="grid grid-cols-[96px_1fr]">
            <span className="text-muted-foreground">{DAY_OF_WEEK_LABELS[day]}</span>
            <span>
              {windows.length === 0
                ? "Not available"
                : windows.map((w) => `${formatTime(w.start)} – ${formatTime(w.end)}`).join(", ")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
