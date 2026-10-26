import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Validates an IANA time zone name. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a wall-clock time in `tz` ("2026-11-01T09:30") to a UTC Date.
 * DST gaps resolve forward (e.g. 02:30 on a spring-forward day becomes 03:30 local).
 */
export function zonedLocalToUtc(local: string, tz: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) throw new Error("Invalid local date-time");
  if (!isValidTimeZone(tz)) throw new Error("Invalid time zone");
  const d = fromZonedTime(local, tz);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid local date-time");
  return d;
}

export function utcToZonedLocal(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm");
}

export function formatInZone(date: Date | string, tz: string, pattern = "EEE d MMM yyyy, HH:mm") {
  return formatInTimeZone(typeof date === "string" ? new Date(date) : date, tz, pattern);
}

export const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Africa/Lagos",
];

/** A sensible default schedule slot: two hours from now, as wall time in `tz`. */
export function suggestedScheduleLocal(tz: string, leadMs = 2 * 3600_000): string {
  return utcToZonedLocal(new Date(Date.now() + leadMs), tz);
}

/** Whole days from now until `date` (negative when in the past). */
export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400_000);
}
