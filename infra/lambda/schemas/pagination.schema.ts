import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 50;

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;

/**
 * Strict pagination query schema:
 * - limit: positive integer 1..50 (rejects floats, strings with decimals, negatives, and > 50).
 * - nextToken: opaque base64url token only (never accepts raw DynamoDB ExclusiveStartKey JSON).
 */
export const paginationQuerySchema = z
  .object({
    limit: z
      .string()
      .regex(/^\d+$/, { message: 'limit must be a positive integer.' })
      .transform((v) => Number(v))
      .refine((n) => Number.isSafeInteger(n) && n >= 1 && n <= MAX_PAGE_LIMIT, {
        message: `limit must be between 1 and ${MAX_PAGE_LIMIT}.`,
      })
      .optional(),
    nextToken: z
      .string()
      .regex(OPAQUE_TOKEN_PATTERN, {
        message: 'nextToken must be an opaque pagination token.',
      })
      .optional(),
  })
  .strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
