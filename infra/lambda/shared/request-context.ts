import { getAuthenticatedStudentId, requireAdmin } from './authorization';
import type {
  ApiGatewayHttpV2Event,
  OAuthScopeName,
  RouteAccessPolicy,
} from './api-types';

export interface RouteAuthorizationContract {
  readonly policy: RouteAccessPolicy;
  readonly expectedScope?: OAuthScopeName;
}

export interface AuthorizedCaller {
  readonly userId: string;
  readonly isAdminUser: boolean;
}

export function extractRequestId(event: ApiGatewayHttpV2Event | null | undefined): string {
  const id = event?.requestContext?.requestId;
  return typeof id === 'string' && id.trim().length > 0 ? id : 'unknown-request-id';
}

export function extractRouteLabel(event: ApiGatewayHttpV2Event | null | undefined): string {
  if (event?.requestContext?.routeKey) {
    return event.requestContext.routeKey;
  }
  const method = event?.requestContext?.http?.method ?? 'GET';
  const path = event?.requestContext?.http?.path ?? event?.rawPath ?? '/';
  return `${method} ${path}`;
}

/**
 * Enforces the route's backend authorization policy using verified JWT claims.
 * Note: API Gateway checks OAuth scopes (`expectedScope`) before invocation,
 * while Lambda MUST independently enforce exact `admin` group membership for admin routes.
 * An OAuth scope alone is NEVER treated as proof of admin-group membership.
 */
export function authorizeRouteCaller(
  event: ApiGatewayHttpV2Event,
  contract: RouteAuthorizationContract,
): AuthorizedCaller | null {
  if (contract.policy === 'PUBLIC_HEALTH') {
    return null;
  }

  if (contract.policy === 'ADMIN_GROUP_REQUIRED') {
    const adminSub = requireAdmin(event);
    return { userId: adminSub, isAdminUser: true };
  }

  const studentSub = getAuthenticatedStudentId(event);
  return { userId: studentSub, isAdminUser: false };
}
