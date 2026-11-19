import { z } from 'zod';
import {
  bookingIdSchema,
  dateSchema,
  MAX_BOOKING_MINUTES,
  roomIdSchema,
  SLOT_MINUTES,
  timeSchema,
  timeToMinutes,
} from './common.schema';
import { paginationQuerySchema } from './pagination.schema';

export const createBookingSchema = z
  .object({
    roomId: roomIdSchema,
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    purpose: z.string().trim().min(4, 'Purpose must be at least 4 characters.').max(160),
  })
  .strict()
  .refine((val) => timeToMinutes(val.startTime) < timeToMinutes(val.endTime), {
    message: 'startTime must be strictly earlier than endTime.',
    path: ['endTime'],
  })
  .refine(
    (val) =>
      timeToMinutes(val.startTime) % SLOT_MINUTES === 0 &&
      timeToMinutes(val.endTime) % SLOT_MINUTES === 0,
    {
      message: 'Booking times must align to 15-minute boundaries.',
      path: ['startTime'],
    },
  )
  .refine(
    (val) => timeToMinutes(val.endTime) - timeToMinutes(val.startTime) <= MAX_BOOKING_MINUTES,
    {
      message: 'Student booking duration cannot exceed 4 hours.',
      path: ['endTime'],
    },
  );

export const updateBookingStatusSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
  })
  .strict();

export const bookingPathParamsSchema = z
  .object({
    id: bookingIdSchema,
  })
  .strict();

export const listBookingsQuerySchema = paginationQuerySchema
  .extend({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  })
  .strict();

export const adminListBookingsQuerySchema = paginationQuerySchema
  .extend({
    date: dateSchema.optional(),
    blockId: z.string().regex(/^[A-Z0-9-]{2,24}$/).optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  })
  .strict();
