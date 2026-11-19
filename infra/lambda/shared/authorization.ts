export interface JwtAuthorizerContext {
  readonly claims?: Record<string, unknown> | null;
  readonly scopes?: readonly string[] | null;
}

export interface HttpApiAuthorizedEvent {
  readonly requestContext?: {
    readonly authorizer?: {
      readonly jwt?: JwtAuthorizerContext | null;
    } | null;
  } | null;
  readonly headers?: Record<string, string | undefined>;
  readonly queryStringParameters?: Record<string, string | undefined>;
  readonly body?: string | null;
}

export class AuthorizationError extends Error {
  public readonly statusCode: 401 | 403;
  public readonly code: 'UNAUTHORIZED' | 'FORBIDDEN';

  constructor(statusCode: 401 | 403, message: string) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = statusCode;
    this.code = statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN';
  }
}

const VALID_SUB_PATTERN = /^[A-Za-z0-9._:@-]+$/;

function extractJwtClaims(event: HttpApiAuthorizedEvent | null | undefined): Record<string, unknown> {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new AuthorizationError(401, 'Authentication required.');
  }
  return claims;
}

function extractVerifiedGroups(claims: Record<string, unknown>): string[] {
  const rawGroups = claims['cognito:groups'];
  if (rawGroups === undefined || rawGroups === null) {
    return [];
  }

  // API Gateway HTTP API JWT authorizers forward Cognito group claims as string[].
  // Reject non-array or non-string entries safely rather than coercing malformed claims.
  if (!Array.isArray(rawGroups)) {
    return [];
  }

  const validGroups: string[] = [];
  for (const entry of rawGroups) {
    if (typeof entry !== 'string') {
      return [];
    }
    validGroups.push(entry);
  }
  return validGroups;
}

/**
 * Extracts and validates the authenticated student's identity (`sub` claim)
 * strictly from verified API Gateway HTTP API JWT authorizer context.
 * Never reads studentId or role from request body, query params, or headers.
 * Throws AuthorizationError(401) if authentication or `sub` is missing/malformed.
 */
export function getAuthenticatedStudentId(event: HttpApiAuthorizedEvent | null | undefined): string {
  const claims = extractJwtClaims(event);
  const rawSub = claims.sub;

  if (typeof rawSub !== 'string') {
    throw new AuthorizationError(401, 'Authenticated subject identity is missing.');
  }

  const trimmed = rawSub.trim();
  if (
    trimmed.length === 0 ||
    trimmed !== rawSub ||
    trimmed.length > 128 ||
    !VALID_SUB_PATTERN.test(trimmed)
  ) {
    throw new AuthorizationError(401, 'Authenticated subject identity is invalid.');
  }

  return trimmed;
}

/**
 * Checks whether the verified JWT claims contain the exact case-sensitive `admin` group.
 * Returns false if unauthenticated, missing group claim, or malformed group claim.
 */
export function isAdmin(event: HttpApiAuthorizedEvent | null | undefined): boolean {
  try {
    getAuthenticatedStudentId(event);
  } catch {
    return false;
  }

  const claims = extractJwtClaims(event);
  const groups = extractVerifiedGroups(claims);
  return groups.includes('admin');
}

/**
 * Enforces both valid JWT authentication (401) and exact `admin` group membership (403).
 * Returns the verified admin user's `sub` identifier.
 */
export function requireAdmin(event: HttpApiAuthorizedEvent | null | undefined): string {
  const verifiedSub = getAuthenticatedStudentId(event);
  const claims = extractJwtClaims(event);
  const groups = extractVerifiedGroups(claims);

  if (!groups.includes('admin')) {
    throw new AuthorizationError(403, 'Administrator privileges are required.');
  }

  return verifiedSub;
}
