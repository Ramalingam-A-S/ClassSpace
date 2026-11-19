import type { ZodType, ZodTypeDef } from 'zod';
import { validationError } from './api-error';
import type { ApiGatewayHttpV2Event } from './api-types';

/**
 * Parses and validates a JSON request body strictly with Zod.
 * Rejects invalid JSON, empty bodies, base64-encoded unexpected payloads, and schema violations.
 */
export function parseJsonBody<T>(
  event: ApiGatewayHttpV2Event,
  schema: ZodType<T, ZodTypeDef, unknown>,
): T {
  if (!event.body || event.body.trim().length === 0) {
    throw validationError('Request body is required.');
  }

  const rawText = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw validationError('Request body must be valid JSON.');
  }

  return schema.parse(parsedJson);
}

/**
 * Validates query string parameters using a strict Zod schema.
 */
export function parseQueryParams<T>(
  event: ApiGatewayHttpV2Event,
  schema: ZodType<T, ZodTypeDef, unknown>,
): T {
  const rawQuery: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.queryStringParameters ?? {})) {
    if (v !== undefined) {
      rawQuery[k] = v;
    }
  }
  return schema.parse(rawQuery);
}

/**
 * Validates path parameters using a strict Zod schema.
 */
export function parsePathParams<T>(
  event: ApiGatewayHttpV2Event,
  schema: ZodType<T, ZodTypeDef, unknown>,
): T {
  const rawPathParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.pathParameters ?? {})) {
    if (v !== undefined) {
      rawPathParams[k] = v;
    }
  }
  return schema.parse(rawPathParams);
}
