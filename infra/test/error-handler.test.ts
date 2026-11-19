import { z } from 'zod';
import { ApiError, conflictError, notFoundError } from '../lambda/shared/api-error';
import { AuthorizationError } from '../lambda/shared/authorization';
import { handleApiError } from '../lambda/shared/error-handler';
import { StructuredLogger } from '../lambda/shared/logger';

describe('Error Handler & Standard Error Envelope Tests', () => {
  const createTestLogger = () => {
    const lines: string[] = [];
    const logger = new StructuredLogger('req-err-1', 'POST /bookings', (line) => lines.push(line));
    return { logger, lines };
  };

  test('2, 3, 5. Maps AuthorizationError 401 and 403 to standard error envelope', () => {
    const { logger } = createTestLogger();

    const res401 = handleApiError(new AuthorizationError(401, 'Auth required'), 'req-401', logger);
    expect(res401.statusCode).toBe(401);
    expect(JSON.parse(res401.body)).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Auth required' },
      requestId: 'req-401',
    });

    const res403 = handleApiError(new AuthorizationError(403, 'Admin only'), 'req-403', logger);
    expect(res403.statusCode).toBe(403);
    expect(JSON.parse(res403.body)).toEqual({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin only' },
      requestId: 'req-403',
    });
  });

  test('3. Maps ApiError categories (404, 409, 429, 503) to exact status codes', () => {
    const { logger } = createTestLogger();

    expect(handleApiError(notFoundError('Room missing'), 'req-1', logger).statusCode).toBe(404);
    expect(handleApiError(conflictError('Slot locked'), 'req-2', logger).statusCode).toBe(409);
    expect(
      handleApiError(new ApiError('RATE_LIMITED', 'Too many requests'), 'req-3', logger).statusCode,
    ).toBe(429);
    expect(
      handleApiError(new ApiError('SERVICE_UNAVAILABLE', 'Deferred'), 'req-4', logger).statusCode,
    ).toBe(503);
  });

  test('6. Maps ZodError to HTTP 400 VALIDATION_ERROR with structured field issues', () => {
    const { logger } = createTestLogger();
    const schema = z.object({ capacity: z.number().int().min(1) }).strict();

    let caught: unknown;
    try {
      schema.parse({ capacity: 0 });
    } catch (e) {
      caught = e;
    }

    const res = handleApiError(caught, 'req-zod', logger);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as {
      success: boolean;
      error: { code: string; details?: { issues: Array<{ path: string; message: string }> } };
      requestId: string;
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.issues[0]?.path).toBe('capacity');
    expect(body.requestId).toBe('req-zod');
  });

  test('4 & 7. Maps unknown exceptions to HTTP 500 without exposing stack traces or AWS SDK errors', () => {
    const { logger } = createTestLogger();
    const internalBoom = new Error(
      'ConditionalCheckFailedException: secret internal DynamoDB table arn:aws:dynamodb:ap-south-1:123456789012',
    );
    internalBoom.stack = 'Error: boom\n    at secretFile.ts:42:9';

    const res = handleApiError(internalBoom, 'req-500', logger);
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secretFile.ts');
    expect(res.body).not.toContain('123456789012');
    expect(res.body).not.toContain('ConditionalCheckFailedException');

    expect(JSON.parse(res.body)).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred.',
      },
      requestId: 'req-500',
    });
  });
});
