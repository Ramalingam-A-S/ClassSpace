import type { HttpApiAuthorizedEvent } from './authorization';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export type OAuthScopeName =
  | 'classspace/read'
  | 'classspace/bookings/write'
  | 'classspace/admin';

export type RouteAccessPolicy = 'PUBLIC_HEALTH' | 'AUTHENTICATED_USER' | 'ADMIN_GROUP_REQUIRED';

export interface ApiGatewayHttpV2Context {
  readonly method?: string;
  readonly path?: string;
  readonly protocol?: string;
  readonly sourceIp?: string;
  readonly userAgent?: string;
}

export interface ApiGatewayHttpV2RequestContext {
  readonly requestId?: string;
  readonly routeKey?: string;
  readonly stage?: string;
  readonly timeEpoch?: number;
  readonly http?: ApiGatewayHttpV2Context;
  readonly authorizer?: {
    readonly jwt?: {
      readonly claims?: Record<string, unknown> | null;
      readonly scopes?: readonly string[] | null;
    } | null;
  } | null;
}

/**
 * Strict TypeScript representation of an API Gateway HTTP API (v2) Lambda event,
 * structurally compatible with HttpApiAuthorizedEvent in authorization.ts.
 * Headers are modeled as untrusted input and must never be used for identity/roles.
 */
export interface ApiGatewayHttpV2Event extends HttpApiAuthorizedEvent {
  readonly version?: string;
  readonly routeKey?: string;
  readonly rawPath?: string;
  readonly rawQueryString?: string;
  readonly headers?: Record<string, string | undefined>;
  readonly queryStringParameters?: Record<string, string | undefined>;
  readonly pathParameters?: Record<string, string | undefined>;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly requestContext?: ApiGatewayHttpV2RequestContext;
}

export interface ApiGatewayHttpV2Result {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}
