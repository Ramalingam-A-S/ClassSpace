import { z } from 'zod';
import {
  bookingIdSchema,
  dateSchema,
  roomIdSchema,
  timeRangeSchema,
} from '../lambda/schemas/common.schema';
import { MAX_PAGE_LIMIT, paginationQuerySchema } from '../lambda/schemas/pagination.schema';
import { ApiError } from '../lambda/shared/api-error';
import { parseJsonBody, parsePathParams, parseQueryParams } from '../lambda/shared/validation';
import { buildApiEvent } from './fixtures/api-event';

describe('Zod Validation Foundation Tests', () => {
  test('8. Enforces bounded pagination limits and rejects arbitrary ExclusiveStartKey objects', () => {
    expect(paginationQuerySchema.parse({ limit: '25', nextToken: 'abc_123-XYZ' })).toEqual({
      limit: 25,
      nextToken: 'abc_123-XYZ',
    });

    expect(() => paginationQuerySchema.parse({ limit: '0' })).toThrow();
    expect(() => paginationQuerySchema.parse({ limit: String(MAX_PAGE_LIMIT + 1) })).toThrow();
    expect(() => paginationQuerySchema.parse({ limit: '10.5' })).toThrow();
    expect(() =>
      paginationQuerySchema.parse({ nextToken: '{"roomId":{"S":"hack"}}' }),
    ).toThrow();
    expect(() =>
      paginationQuerySchema.parse({ ExclusiveStartKey: 'not-allowed' }),
    ).toThrow();
  });

  test('9. Rejects invalid calendar dates and invalid time ranges', () => {
    expect(dateSchema.parse('2026-11-19')).toBe('2026-11-19');
    expect(() => dateSchema.parse('2026-02-30')).toThrow();
    expect(() => dateSchema.parse('19-11-2026')).toThrow();

    expect(timeRangeSchema.parse({ startTime: '10:00', endTime: '11:00' })).toEqual({
      startTime: '10:00',
      endTime: '11:00',
    });
    expect(() => timeRangeSchema.parse({ startTime: '11:00', endTime: '10:00' })).toThrow();
    expect(() => timeRangeSchema.parse({ startTime: '10:00', endTime: '10:00' })).toThrow();
    expect(() => timeRangeSchema.parse({ startTime: '25:00', endTime: '26:00' })).toThrow();
  });

  test('Validates roomId, bookingId, strict JSON bodies, query params, and path params', () => {
    expect(roomIdSchema.parse('room-ece-201')).toBe('room-ece-201');
    expect(() => roomIdSchema.parse('room with spaces')).toThrow();
    expect(bookingIdSchema.parse('bk_001')).toBe('bk_001');

    const bodySchema = z
      .object({
        roomId: roomIdSchema,
        date: dateSchema,
      })
      .strict();

    const okEvent = buildApiEvent({
      method: 'POST',
      body: JSON.stringify({ roomId: 'room-ece-201', date: '2026-11-19' }),
    });
    expect(parseJsonBody(okEvent, bodySchema)).toEqual({
      roomId: 'room-ece-201',
      date: '2026-11-19',
    });

    // Rejects unexpected fields (such as injected studentId)
    const extraFieldEvent = buildApiEvent({
      method: 'POST',
      body: JSON.stringify({
        roomId: 'room-ece-201',
        date: '2026-11-19',
        studentId: 'spoofed',
      }),
    });
    expect(() => parseJsonBody(extraFieldEvent, bodySchema)).toThrow();

    // Rejects missing body with ApiError VALIDATION_ERROR
    expect(() => parseJsonBody(buildApiEvent({ body: null }), bodySchema)).toThrow(ApiError);

    const queryEvent = buildApiEvent({ queryStringParameters: { limit: '10' } });
    expect(parseQueryParams(queryEvent, paginationQuerySchema)).toEqual({ limit: 10 });

    const pathEvent = buildApiEvent({ pathParameters: { roomId: 'room-cse-101' } });
    expect(parsePathParams(pathEvent, z.object({ roomId: roomIdSchema }).strict())).toEqual({
      roomId: 'room-cse-101',
    });
  });
});
