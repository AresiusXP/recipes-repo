/**
 * Utilities for the "Cook This Week" feature.
 * This file has NO "use server" or "use client" directive so it can be
 * imported by both server actions and client components.
 */

/**
 * Returns the upcoming Sunday (or today if today is already Sunday) set to
 * end-of-day UTC (23:59:59.999). Uses UTC methods throughout to avoid
 * local-timezone drift.
 */
export function getDefaultCookThisWeekExpiry(): Date {
  const now = new Date();
  // getUTCDay(): 0 = Sunday, 1 = Monday, …, 6 = Saturday
  const daysUntilSunday = (7 - now.getUTCDay()) % 7;
  const sunday = new Date(now);
  sunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
  // End of that Sunday (23:59:59.999 UTC) so recipes remain visible all day
  sunday.setUTCHours(23, 59, 59, 999);
  return sunday;
}

/**
 * Parses a dd/mm/yyyy date string and returns a Date set to end-of-day UTC.
 * Throws if the string is not a valid date.
 */
export function parseDayMonthYear(dateStr: string): Date {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr.trim());
  if (!match) {
    throw new Error("Date must be in dd/mm/yyyy format");
  }
  const [, dd, mm, yyyy] = match;
  const day = parseInt(dd, 10);
  const month = parseInt(mm, 10) - 1; // JS months are 0-indexed
  const year = parseInt(yyyy, 10);
  const date = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
  // Validate round-trip (catches impossible dates like 30/02/2024)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid date");
  }
  return date;
}

/** Formats a Date to "dd/mm/yyyy" using UTC components to avoid timezone drift. */
export function formatToDMY(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Formats an ISO string to a human-readable "D MMM YYYY" using UTC to avoid
 * timezone drift (the stored time is always 23:59:59 UTC).
 */
export function formatReadable(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Returns true when the ISO expiry date covers today or a future calendar date.
 * Comparison is done against UTC midnight of today so recipes are visible for
 * the full UTC calendar date they were marked until.
 */
export function isCookThisWeekActive(isoString: string | null): boolean {
  if (!isoString) return false;
  const expiry = new Date(isoString);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  return expiry.getTime() >= todayStart.getTime();
}

/**
 * Converts a { year, month (0-indexed), day } tuple to a "dd/mm/yyyy" string.
 */
export function ymdToDMY(year: number, month: number, day: number): string {
  return `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year}`;
}

/**
 * Tries to parse a "dd/mm/yyyy" string into { year, month (0-indexed), day }.
 * Returns null if the string is incomplete or invalid.
 */
export function tryParseDMY(
  dateStr: string
): { year: number; month: number; day: number } | null {
  try {
    const d = parseDayMonthYear(dateStr);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      day: d.getUTCDate(),
    };
  } catch {
    return null;
  }
}

/** Returns the number of days in a given UTC month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
