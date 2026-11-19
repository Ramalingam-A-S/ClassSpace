import type { ApiGatewayHttpV2Event, ApiGatewayHttpV2Result } from './api-types';
import { handleApiError } from './error-handler';
import { StructuredLogger } from './logger';
import {
  authorizeRouteCaller,
  extractRequestId,
  extractRouteLabel,
  type AuthorizedCaller,
  type RouteAuthorizationContract,
} from './request-context';

export interface HandlerExecutionContext {
  readonly requestId: string;
  readonly route: string;
  readonly logger: StructuredLogger;
  readonly caller: AuthorizedCaller | null;
}

export type RouteHandlerFn = (
  event: ApiGatewayHttpV2Event,
  context: HandlerExecutionContext,
) => Promise<ApiGatewayHttpV2Result>;

/**
 * Composable HTTP API v2 middleware providing requestId extraction,
 * redacting structured logging, route authorization, and standardized error mapping.
 */
export function withApiHandler(
  authContract: RouteAuthorizationContract,
  fn: RouteHandlerFn,
): (event: ApiGatewayHttpV2Event) => Promise<ApiGatewayHttpV2Result> {
  return async (event: ApiGatewayHttpV2Event): Promise<ApiGatewayHttpV2Result> => {
    const requestId = extractRequestId(event);
    const route = extractRouteLabel(event);
    const logger = new StructuredLogger(requestId, route);

    try {
      const caller = authorizeRouteCaller(event, authContract);
      return await fn(event, { requestId, route, logger, caller });
    } catch (err) {
      return handleApiError(err, requestId, logger);
    }
  };
}
