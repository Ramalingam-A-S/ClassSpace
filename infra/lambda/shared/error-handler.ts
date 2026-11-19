import { ZodError } from 'zod';
import { ApiError } from './api-error';
import { errorResponse } from './api-response';
import type { ApiGatewayHttpV2Result } from './api-types';
import { AuthorizationError } from './authorization';
import type { StructuredLogger } from './logger';

/**
 * Maps known domain/auth/validation errors and unknown exceptions to safe,
 * standardized JSON error envelopes without exposing stack traces or AWS internals.
 */
export function handleApiError(
  err: unknown,
  requestId: string,
  logger: StructuredLogger,
): ApiGatewayHttpV2Result {
  if (err instanceof AuthorizationError) {
    logger.warn('Authorization rejected', {
      code: err.code,
      statusCode: err.statusCode,
    });
    return errorResponse(err.statusCode, err.code, err.message, requestId);
  }

  if (err instanceof ApiError) {
    const logFn = err.statusCode >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
    logFn('API error response', {
      code: err.code,
      statusCode: err.statusCode,
    });
    return errorResponse(err.statusCode, err.code, err.message, requestId, err.details);
  }

  if (err instanceof ZodError) {
    const issues = err.issues.map((issue) => ({
      path: issue.path.join('.') || 'request',
      message: issue.message,
    }));
    logger.warn('Request validation failed', { issueCount: issues.length });
    return errorResponse(
      400,
      'VALIDATION_ERROR',
      'Request validation failed.',
      requestId,
      { issues },
    );
  }

  const safeErrorName = err instanceof Error ? err.name : 'UnknownError';
  logger.error('Unhandled internal exception', { errorName: safeErrorName });

  return errorResponse(
    500,
    'INTERNAL_ERROR',
    'An unexpected internal error occurred.',
    requestId,
  );
}
