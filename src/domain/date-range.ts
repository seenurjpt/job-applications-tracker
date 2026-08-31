// PURE. No I/O, no db, no framework imports.
import { addDays, subDays, subMonths, startOfDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export type RangePreset =
  | "today"
  | "last_week"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "custom";

export const RANGE_PRESETS: RangePreset[] = [
  "today",
  "last_week",
  "last_month",
  "last_3_months",
  "last_6_months",
  "custom",
];

export interface ResolvedRange {
  from: Date;
  to: Date;
}

export function resolveRange(
  preset: RangePreset,
  now: Date,
  custom?: { from: Date; to: Date }
): ResolvedRange {
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: now };
    case "last_week":
      return { from: subDays(now, 7), to: now };
    case "last_month":
      return { from: subMonths(now, 1), to: now };
    case "last_3_months":
      return { from: subMonths(now, 3), to: now };
    case "last_6_months":
      return { from: subMonths(now, 6), to: now };
    case "custom": {
      if (!custom) throw new Error("custom preset requires an explicit range");
      if (custom.from.getTime() > custom.to.getTime()) {
        throw new Error("range from must not be after to");
      }
      return { from: custom.from, to: custom.to };
    }
  }
}

/**
 * Gmail `after:`/`before:` use the MAILBOX timezone, and `before:` is
 * EXCLUSIVE , add one day to include the end date. Dates are formatted
 * YYYY/MM/DD in the mailbox timezone.
 */
export function toGmailQuery(r: ResolvedRange, tz: string): string {
  const after = formatInTimeZone(r.from, tz, "yyyy/MM/dd");
  // The +1 day must happen on the LOCAL calendar date, not the instant ,
  // adding 24h to the instant drifts by a day across a DST transition.
  const toLocal = formatInTimeZone(r.to, tz, "yyyy-MM-dd");
  const before = formatInTimeZone(
    addDays(new Date(`${toLocal}T00:00:00Z`), 1),
    "UTC",
    "yyyy/MM/dd"
  );
  return `in:sent after:${after} before:${before}`;
}
