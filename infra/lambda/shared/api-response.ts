import type { ApiErrorCode } from './api-error';
import type { ApiGatewayHttpV2Result } from './api-types';

export interface ApiSuccessEnvelope<T> {
  readonly success: true;
  readonly data: T;
  readonly requestId: string;
}

export interface ApiErrorEnvelope {
  readonly success: false;
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
  readonly requestId: string;
}

const DEFAULT_HEADERS = (requestId: string): Record<string, string> => ({
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'x-request-id': requestId,
});

export function successResponse<T>(
  data: T,
  requestId: string,
  statusCode = 200,
): ApiGatewayHttpV2Result {
  const payload: ApiSuccessEnvelope<T> = {
    success: true,
    data,
    requestId,
  };

  return {
    statusCode,
    headers: DEFAULT_HEADERS(requestId),
    body: JSON.stringify(payload),
  };
}

export function createdResponse<T>(data: T, requestId: string): ApiGatewayHttpV2Result {
  return successResponse(data, requestId, 201);
}

export function errorResponse(
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ApiGatewayHttpV2Result {
  const payload: ApiErrorEnvelope = {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    requestId,
  };

  return {
    statusCode,
    headers: DEFAULT_HEADERS(requestId),
    body: JSON.stringify(payload),
  };
}
