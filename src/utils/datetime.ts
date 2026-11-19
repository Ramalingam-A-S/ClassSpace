export const CAMPUS_TIMEZONE = 'Asia/Kolkata';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Returns today's date string (YYYY-MM-DD) in the Asia/Kolkata campus timezone.
 */
export function getTodayKolkata(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Adds a number of days to a YYYY-MM-DD date string and returns YYYY-MM-DD.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  if (!isValidDateString(dateStr)) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const utcDate = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr) + days));
  return utcDate.toISOString().slice(0, 10);
}

/**
 * Validates a YYYY-MM-DD calendar date string strictly.
 */
export function isValidDateString(dateStr: string): boolean {
  if (!DATE_PATTERN.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Validates an HH:mm 24-hour time string.
 */
export function isValidTimeString(timeStr: string): boolean {
  return TIME_PATTERN.test(timeStr);
}

/**
 * Converts HH:mm into total minutes since 00:00. Throws on invalid format.
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!isValidTimeString(timeStr)) {
    throw new Error(`Invalid time format "${timeStr}". Expected HH:mm (00:00-23:59).`);
  }
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/**
 * Validates that both startTime and endTime are valid HH:mm strings and startTime < endTime.
 */
export function isValidTimeRange(startTime: string, endTime: string): boolean {
  if (!isValidTimeString(startTime) || !isValidTimeString(endTime)) {
    return false;
  }
  return parseTimeToMinutes(startTime) < parseTimeToMinutes(endTime);
}

/**
 * Checks strict half-open interval overlap:
 * requestedStart < existingEnd AND requestedEnd > existingStart.
 * Adjacent intervals (e.g., 10:00-11:00 and 11:00-12:00) return false.
 */
export function intervalsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  if (!isValidTimeRange(startA, endA) || !isValidTimeRange(startB, endB)) {
    throw new Error('Cannot compare invalid time ranges.');
  }
  const aStart = parseTimeToMinutes(startA);
  const aEnd = parseTimeToMinutes(endA);
  const bStart = parseTimeToMinutes(startB);
  const bEnd = parseTimeToMinutes(endB);
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Formats a YYYY-MM-DD date string for readable campus display in Asia/Kolkata.
 */
export function formatCampusDate(dateStr: string): string {
  if (!isValidDateString(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMidday = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 6, 30, 0));
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: CAMPUS_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(utcMidday);
}

/**
 * Formats an ISO timestamp in Asia/Kolkata IST.
 */
export function formatCampusTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: CAMPUS_TIMEZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}
