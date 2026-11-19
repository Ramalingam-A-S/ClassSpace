import { z } from 'zod';
import { AVAILABLE_FACILITIES } from '../types/domain';
import { isValidDateString, isValidTimeRange, isValidTimeString } from './datetime';

export const facilitySchema = z.enum(AVAILABLE_FACILITIES as [string, ...string[]]);

export const dateStringSchema = z
  .string()
  .refine(isValidDateString, { message: 'Enter a valid calendar date (YYYY-MM-DD).' });

export const timeStringSchema = z
  .string()
  .refine(isValidTimeString, { message: 'Enter a valid 24-hour time (HH:mm).' });

export const availabilityQuerySchema = z
  .object({
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    minCapacity: z.coerce
      .number()
      .int('Minimum capacity must be a whole number.')
      .min(1, 'Minimum capacity must be at least 1.')
      .max(500, 'Minimum capacity cannot exceed 500.'),
    blockId: z.string().optional(),
    floor: z.coerce.number().int().min(0).max(20).optional(),
    facilities: z.array(facilitySchema).optional(),
  })
  .refine((data) => isValidTimeRange(data.startTime, data.endTime), {
    message: 'Start time must be strictly earlier than end time.',
    path: ['endTime'],
  });

export const roomFormSchema = z.object({
  blockId: z
    .string()
    .trim()
    .min(2, 'Block identifier is required (e.g., BLOCK-A).')
    .max(24, 'Block identifier must be 24 characters or fewer.')
    .regex(/^[A-Z0-9-]+$/, 'Use uppercase letters, numbers, and hyphens only (e.g., BLOCK-A).'),
  floor: z.coerce
    .number()
    .int('Floor must be a whole number.')
    .min(0, 'Floor cannot be negative.')
    .max(20, 'Floor cannot exceed 20.'),
  roomNumber: z
    .string()
    .trim()
    .min(2, 'Room number is required (e.g., ECE-201).')
    .max(24, 'Room number must be 24 characters or fewer.')
    .regex(/^[A-Z0-9-]+$/, 'Use uppercase letters, numbers, and hyphens only (e.g., ECE-201).'),
  capacity: z.coerce
    .number()
    .int('Capacity must be a whole number.')
    .min(1, 'Capacity must be at least 1 seat.')
    .max(500, 'Capacity cannot exceed 500 seats.'),
  facilities: z.array(facilitySchema).min(1, 'Select at least one room facility.'),
  active: z.boolean(),
});

export const timetableFormSchema = z
  .object({
    roomId: z.string().min(1, 'Select a classroom.'),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    subject: z
      .string()
      .trim()
      .min(2, 'Subject label must be at least 2 characters.')
      .max(80, 'Subject label must be 80 characters or fewer.'),
  })
  .refine((data) => isValidTimeRange(data.startTime, data.endTime), {
    message: 'Start time must be earlier than end time.',
    path: ['endTime'],
  });

export const bookingFormSchema = z
  .object({
    roomId: z.string().min(1, 'Classroom is required.'),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    purpose: z
      .string()
      .trim()
      .min(4, 'Briefly describe your study or activity purpose (at least 4 characters).')
      .max(160, 'Purpose must be 160 characters or fewer.'),
  })
  .refine((data) => isValidTimeRange(data.startTime, data.endTime), {
    message: 'Start time must be earlier than end time.',
    path: ['endTime'],
  });

export const restrictionFormSchema = z
  .object({
    roomId: z.string().min(1, 'Select a classroom.'),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    reason: z
      .string()
      .trim()
      .min(3, 'Provide a restriction reason (at least 3 characters).')
      .max(160, 'Reason must be 160 characters or fewer.'),
  })
  .refine((data) => isValidTimeRange(data.startTime, data.endTime), {
    message: 'Start time must be earlier than end time.',
    path: ['endTime'],
  });

export type RoomFormValues = z.infer<typeof roomFormSchema>;
export type TimetableFormValues = z.infer<typeof timetableFormSchema>;
export type BookingFormValues = z.infer<typeof bookingFormSchema>;
export type RestrictionFormValues = z.infer<typeof restrictionFormSchema>;
