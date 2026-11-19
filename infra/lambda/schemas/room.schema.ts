import { z } from 'zod';
import { MAX_SCHEDULE_ENTRY_MINUTES, SLOT_MINUTES, timeToMinutes } from './common.schema';
import { blockIdSchema, dateSchema, roomIdSchema, timeSchema } from './common.schema';
import { paginationQuerySchema } from './pagination.schema';

export const ALLOWED_FACILITIES = [
  'Projector',
  'Air Conditioning',
  'Smart Board',
  'Audio System',
  'Whiteboard',
  'Lab Workstations',
  'Power Outlets',
  'High-Speed Wi-Fi',
] as const;

export const facilitySchema = z.enum(ALLOWED_FACILITIES);

export const roomNumberSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9-]{2,24}$/, {
    message: 'roomNumber must be 2–24 uppercase alphanumeric or hyphen characters.',
  });

export const createRoomSchema = z
  .object({
    blockId: blockIdSchema,
    floor: z.number().int().min(0).max(20),
    roomNumber: roomNumberSchema,
    roomName: z.string().trim().min(2).max(48).optional(),
    capacity: z.number().int().min(1, 'Capacity must be at least 1.').max(500),
    facilities: z.array(facilitySchema).min(1, 'At least one facility is required.'),
    active: z.boolean().default(true),
  })
  .strict();

export const updateRoomSchema = z
  .object({
    blockId: blockIdSchema.optional(),
    floor: z.number().int().min(0).max(20).optional(),
    roomNumber: roomNumberSchema.optional(),
    roomName: z.string().trim().min(2).max(48).optional(),
    capacity: z.number().int().min(1).max(500).optional(),
    facilities: z.array(facilitySchema).min(1).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, {
    message: 'At least one field must be provided for room update.',
  });

export const roomPathParamsSchema = z
  .object({
    roomId: roomIdSchema,
  })
  .strict();

export const adminRoomPathParamsSchema = z
  .object({
    id: roomIdSchema,
  })
  .strict();

export const listRoomsQuerySchema = paginationQuerySchema
  .extend({
    blockId: blockIdSchema.optional(),
    floor: z
      .string()
      .regex(/^\d+$/)
      .transform((v) => Number(v))
      .refine((n) => n >= 0 && n <= 20, { message: 'floor must be between 0 and 20.' })
      .optional(),
    minCapacity: z
      .string()
      .regex(/^\d+$/)
      .transform((v) => Number(v))
      .refine((n) => n >= 1 && n <= 500, { message: 'minCapacity must be between 1 and 500.' })
      .optional(),
    facilities: z.string().max(300).optional(),
    includeInactive: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const roomDetailsQuerySchema = z
  .object({
    date: dateSchema.optional(),
  })
  .strict();

export const availabilityQuerySchema = z
  .object({
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    minCapacity: z
      .string()
      .regex(/^\d+$/, { message: 'minCapacity must be a positive integer.' })
      .transform((v) => Number(v))
      .refine((n) => n >= 1 && n <= 500, { message: 'minCapacity must be between 1 and 500.' }),
    blockId: blockIdSchema.optional(),
    floor: z
      .string()
      .regex(/^\d+$/)
      .transform((v) => Number(v))
      .refine((n) => n >= 0 && n <= 20, { message: 'floor must be between 0 and 20.' })
      .optional(),
    facilities: z.string().max(300).optional(),
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
      message: 'startTime and endTime must align to 15-minute slot boundaries.',
      path: ['startTime'],
    },
  )
  .refine(
    (val) => timeToMinutes(val.endTime) - timeToMinutes(val.startTime) <= MAX_SCHEDULE_ENTRY_MINUTES,
    {
      message: 'Search window cannot exceed 8 hours.',
      path: ['endTime'],
    },
  );
