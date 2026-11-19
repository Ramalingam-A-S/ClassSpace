import {
  AuthorizationError,
  getAuthenticatedStudentId,
  isAdmin,
  requireAdmin,
  type HttpApiAuthorizedEvent,
} from '../lambda/shared/authorization';

function buildJwtEvent(
  claims: Record<string, unknown> | undefined,
  overrides: Partial<HttpApiAuthorizedEvent> = {},
): HttpApiAuthorizedEvent {
  return {
    requestContext: {
      authorizer: {
        jwt: claims !== undefined ? { claims } : undefined,
      },
    },
    ...overrides,
  };
}

describe('Phase 2.3 Lambda Authorization Contract Tests', () => {
  test('1. Returns verified student sub for valid JWT claims', () => {
    const event = buildJwtEvent({
      sub: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      'cognito:groups': ['student'],
    });
    expect(getAuthenticatedStudentId(event)).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });

  test('2. Rejects missing sub with 401 AuthorizationError', () => {
    const event = buildJwtEvent({ email: 'student@example.edu' });
    expect(() => getAuthenticatedStudentId(event)).toThrow(AuthorizationError);
    try {
      getAuthenticatedStudentId(event);
    } catch (err) {
      expect(err).toBeInstanceOf(AuthorizationError);
      expect((err as AuthorizationError).statusCode).toBe(401);
    }
  });

  test('3. Rejects empty or whitespace sub with 401 AuthorizationError', () => {
    for (const badSub of ['', '   ', 'user with spaces', null, 12345]) {
      const event = buildJwtEvent({ sub: badSub });
      expect(() => getAuthenticatedStudentId(event)).toThrow(AuthorizationError);
      try {
        requireAdmin(event);
      } catch (err) {
        expect((err as AuthorizationError).statusCode).toBe(401);
      }
    }
  });

  test('4. Rejects missing authorizer context with 401', () => {
    const event: HttpApiAuthorizedEvent = { requestContext: {} };
    expect(() => getAuthenticatedStudentId(event)).toThrow(AuthorizationError);
    expect(isAdmin(event)).toBe(false);
    try {
      requireAdmin(event);
    } catch (err) {
      expect((err as AuthorizationError).statusCode).toBe(401);
    }
  });

  test('5. Rejects missing JWT claims with 401', () => {
    const event = buildJwtEvent(undefined);
    expect(() => getAuthenticatedStudentId(event)).toThrow(AuthorizationError);
    expect(isAdmin(event)).toBe(false);
  });

  test('6. Rejects ordinary student without admin group with 403', () => {
    const event = buildJwtEvent({
      sub: 'student-sub-001',
      'cognito:groups': ['student'],
    });
    expect(isAdmin(event)).toBe(false);
    try {
      requireAdmin(event);
      throw new Error('Expected requireAdmin to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthorizationError);
      expect((err as AuthorizationError).statusCode).toBe(403);
    }
  });

  test('7. Accepts admin user with exact admin group', () => {
    const event = buildJwtEvent({
      sub: 'admin-sub-001',
      'cognito:groups': ['admin'],
    });
    expect(isAdmin(event)).toBe(true);
    expect(requireAdmin(event)).toBe('admin-sub-001');
  });

  test('8. Accepts user belonging to multiple groups including admin', () => {
    const event = buildJwtEvent({
      sub: 'admin-sub-002',
      'cognito:groups': ['student', 'faculty-viewer', 'admin'],
    });
    expect(isAdmin(event)).toBe(true);
    expect(requireAdmin(event)).toBe('admin-sub-002');
  });

  test('9. Safely rejects malformed group claims (non-array, object, number, non-string array element)', () => {
    const malformedPayloads: unknown[] = [
      'admin',
      '[admin]',
      123,
      true,
      { admin: true },
      ['admin', 42],
    ];

    for (const badGroups of malformedPayloads) {
      const event = buildJwtEvent({
        sub: 'user-sub-999',
        'cognito:groups': badGroups,
      });
      expect(isAdmin(event)).toBe(false);
      expect(() => requireAdmin(event)).toThrow(AuthorizationError);
    }
  });

  test('10. Ignores caller attempts to inject studentId via request body, query params, or headers', () => {
    const event = buildJwtEvent(
      {
        sub: 'verified-jwt-sub-123',
        'cognito:groups': ['student'],
      },
      {
        body: JSON.stringify({ studentId: 'spoofed-other-student' }),
        queryStringParameters: { studentId: 'spoofed-query-student' },
        headers: {
          'x-student-id': 'spoofed-header-student',
          authorization: 'Bearer secret-raw-jwt-token',
        },
      },
    );

    expect(getAuthenticatedStudentId(event)).toBe('verified-jwt-sub-123');
  });

  test('11. Ignores caller attempts to inject admin role via request body or headers', () => {
    const event = buildJwtEvent(
      {
        sub: 'student-sub-456',
        'cognito:groups': ['student'],
      },
      {
        body: JSON.stringify({ role: 'ADMIN_DEMO', isAdmin: true, groups: ['admin'] }),
        headers: {
          'x-demo-role': 'ADMIN_DEMO',
          'x-admin': 'true',
          authorization: 'Bearer super-secret-jwt',
        },
      },
    );

    expect(isAdmin(event)).toBe(false);
    try {
      requireAdmin(event);
      throw new Error('Expected 403 error');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthorizationError);
      expect((err as AuthorizationError).statusCode).toBe(403);
      // Error message must never leak authorization headers or tokens
      expect((err as Error).message).not.toContain('super-secret-jwt');
    }
  });

  test('12. Enforces case-sensitive group matching for exact lowercase "admin"', () => {
    for (const wrongCase of ['Admin', 'ADMIN', 'admin ', 'superadmin']) {
      const event = buildJwtEvent({
        sub: 'student-sub-789',
        'cognito:groups': [wrongCase],
      });
      expect(isAdmin(event)).toBe(false);
      expect(() => requireAdmin(event)).toThrow(AuthorizationError);
    }
  });
});
