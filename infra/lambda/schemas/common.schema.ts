import { z } from 'zod';

export const SLOT_MINUTES = 15;
export const MAX_BOOKING_MINUTES = 4 * 60;
export const MAX_SCHEDULE_ENTRY_MINUTES = 8 * 60;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

export function isValidCalendarDate(dateStr: string): boolean {
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

export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export const dateSchema = z
  .string()
  .refine(isValidCalendarDate, { message: 'Must be a valid calendar date (YYYY-MM-DD).' });

export const timeSchema = z
  .string()
  .regex(TIME_PATTERN, { message: 'Must be a valid 24-hour time (HH:mm).' });

export const timeRangeSchema = z
  .object({
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .strict()
  .refine((val) => timeToMinutes(val.startTime) < timeToMinutes(val.endTime), {
    message: 'startTime must be strictly earlier than endTime.',
    path: ['endTime'],
  });

export const roomIdSchema = z
  .string()
  .regex(IDENTIFIER_PATTERN, {
    message: 'roomId must be 2–64 alphanumeric, hyphen, or underscore characters.',
  });

export const bookingIdSchema = z
  .string()
  .regex(IDENTIFIER_PATTERN, {
    message: 'bookingId must be 2–64 alphanumeric, hyphen, or underscore characters.',
  });

export const blockIdSchema = z
  .string()
  .regex(/^[A-Z0-9-]{2,24}$/, {
    message: 'blockId must be 2–24 uppercase alphanumeric or hyphen characters.',
  });
