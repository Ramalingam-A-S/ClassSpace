import type { ApiGatewayHttpV2Event } from '../../lambda/shared/api-types';

export interface BuildApiEventOptions {
  readonly requestId?: string;
  readonly method?: string;
  readonly path?: string;
  readonly routeKey?: string;
  readonly sub?: string;
  readonly groups?: unknown;
  readonly scopes?: string[];
  readonly body?: string | null;
  readonly queryStringParameters?: Record<string, string | undefined>;
  readonly pathParameters?: Record<string, string | undefined>;
  readonly headers?: Record<string, string | undefined>;
}

export function buildApiEvent(options: BuildApiEventOptions = {}): ApiGatewayHttpV2Event {
  const method = options.method ?? 'GET';
  const path = options.path ?? '/rooms';
  const claims: Record<string, unknown> = {};
  if (options.sub !== undefined) {
    claims.sub = options.sub;
  }
  if (options.groups !== undefined) {
    claims['cognito:groups'] = options.groups;
  }

  return {
    version: '2.0',
    routeKey: options.routeKey ?? `${method} ${path}`,
    rawPath: path,
    headers: options.headers,
    queryStringParameters: options.queryStringParameters,
    pathParameters: options.pathParameters,
    body: options.body ?? null,
    isBase64Encoded: false,
    requestContext: {
      requestId: options.requestId ?? 'req-test-001',
      routeKey: options.routeKey ?? `${method} ${path}`,
      http: {
        method,
        path,
      },
      authorizer:
        options.sub !== undefined || options.groups !== undefined || options.scopes !== undefined
          ? {
              jwt: {
                claims,
                scopes: options.scopes ?? ['openid', 'classspace/read'],
              },
            }
          : undefined,
    },
  };
}
