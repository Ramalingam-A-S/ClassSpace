import { z } from 'zod';
import {
  blockIdSchema,
  dateSchema,
  MAX_SCHEDULE_ENTRY_MINUTES,
  roomIdSchema,
  SLOT_MINUTES,
  timeSchema,
  timeToMinutes,
} from './common.schema';

const scheduleIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{2,64}$/, { message: 'Invalid scheduleId format.' });

export const upsertTimetableSchema = z
  .object({
    scheduleId: scheduleIdSchema.optional(),
    roomId: roomIdSchema,
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    subject: z.string().trim().min(2, 'Subject must be at least 2 characters.').max(80),
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
      message: 'Timetable slots must align to 15-minute boundaries.',
      path: ['startTime'],
    },
  )
  .refine(
    (val) => timeToMinutes(val.endTime) - timeToMinutes(val.startTime) <= MAX_SCHEDULE_ENTRY_MINUTES,
    {
      message: 'Timetable entry duration cannot exceed 8 hours.',
      path: ['endTime'],
    },
  );

export const createRestrictionSchema = z
  .object({
    roomId: roomIdSchema,
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    reason: z.string().trim().min(3, 'Reason must be at least 3 characters.').max(160),
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
      message: 'Restriction slots must align to 15-minute boundaries.',
      path: ['startTime'],
    },
  )
  .refine(
    (val) => timeToMinutes(val.endTime) - timeToMinutes(val.startTime) <= MAX_SCHEDULE_ENTRY_MINUTES,
    {
      message: 'Restriction duration cannot exceed 8 hours.',
      path: ['endTime'],
    },
  );

export const listSchedulesQuerySchema = z
  .object({
    date: dateSchema,
    roomId: roomIdSchema.optional(),
    blockId: blockIdSchema.optional(),
  })
  .strict();

export const deleteScheduleQuerySchema = z
  .object({
    roomId: roomIdSchema,
    date: dateSchema,
    recordType: z.enum(['TIMETABLE', 'RESTRICTION']),
    startTime: timeSchema,
    scheduleId: scheduleIdSchema,
  })
  .strict();
