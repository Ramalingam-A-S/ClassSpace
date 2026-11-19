export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export const ERROR_STATUS_MAP: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = ERROR_STATUS_MAP[code];
    this.details = details;
  }
}

export function validationError(
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('VALIDATION_ERROR', message, details);
}

export function notFoundError(message: string): ApiError {
  return new ApiError('NOT_FOUND', message);
}

export function conflictError(
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('CONFLICT', message, details);
}

export function internalError(message = 'An unexpected internal error occurred.'): ApiError {
  return new ApiError('INTERNAL_ERROR', message);
}
