import { handler as healthHandler } from '../lambda/health';
import { createdResponse, successResponse } from '../lambda/shared/api-response';
import { withApiHandler } from '../lambda/shared/middleware';
import { buildApiEvent } from './fixtures/api-event';

describe('API Foundation, Middleware & Health Handler Tests', () => {
  test('1 & 15. Standard success response includes envelope and requestId', async () => {
    const res = successResponse({ rooms: [] }, 'req-123');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json');
    expect(res.headers['x-request-id']).toBe('req-123');

    const body = JSON.parse(res.body) as { success: boolean; data: unknown; requestId: string };
    expect(body).toEqual({
      success: true,
      data: { rooms: [] },
      requestId: 'req-123',
    });

    const created = createdResponse({ id: 'bk-1' }, 'req-124');
    expect(created.statusCode).toBe(201);
  });

  test('10 & 11. Rejects missing JWT subject and ignores spoofed studentId in body/query/headers', async () => {
    const protectedHandler = withApiHandler(
      { policy: 'AUTHENTICATED_USER', expectedScope: 'classspace/read' },
      async (_event, ctx) => successResponse({ userId: ctx.caller?.userId }, ctx.requestId),
    );

    const missingSubRes = await protectedHandler(
      buildApiEvent({ requestId: 'req-no-sub' }),
    );
    expect(missingSubRes.statusCode).toBe(401);
    const missingBody = JSON.parse(missingSubRes.body) as {
      success: boolean;
      error: { code: string };
      requestId: string;
    };
    expect(missingBody.success).toBe(false);
    expect(missingBody.error.code).toBe('UNAUTHORIZED');
    expect(missingBody.requestId).toBe('req-no-sub');

    const spoofAttemptRes = await protectedHandler(
      buildApiEvent({
        requestId: 'req-spoof-1',
        sub: 'real-student-sub-01',
        groups: ['student'],
        body: JSON.stringify({ studentId: 'spoofed-student' }),
        queryStringParameters: { studentId: 'spoofed-query' },
        headers: { 'x-student-id': 'spoofed-header' },
      }),
    );
    expect(spoofAttemptRes.statusCode).toBe(200);
    const okBody = JSON.parse(spoofAttemptRes.body) as { data: { userId: string } };
    expect(okBody.data.userId).toBe('real-student-sub-01');
  });

  test('12 & 13. Enforces exact admin group and rejects student holding classspace/admin scope without admin group', async () => {
    const adminHandler = withApiHandler(
      { policy: 'ADMIN_GROUP_REQUIRED', expectedScope: 'classspace/admin' },
      async (_event, ctx) => successResponse({ adminId: ctx.caller?.userId }, ctx.requestId),
    );

    // Student has classspace/admin OAuth scope in JWT scopes, but only "student" in cognito:groups
    const scopeWithoutGroupRes = await adminHandler(
      buildApiEvent({
        requestId: 'req-scope-only',
        method: 'POST',
        path: '/admin/rooms',
        sub: 'student-sub-01',
        groups: ['student'],
        scopes: ['openid', 'classspace/admin'],
      }),
    );
    expect(scopeWithoutGroupRes.statusCode).toBe(403);
    const forbiddenBody = JSON.parse(scopeWithoutGroupRes.body) as {
      success: boolean;
      error: { code: string };
    };
    expect(forbiddenBody.success).toBe(false);
    expect(forbiddenBody.error.code).toBe('FORBIDDEN');

    // Genuine admin with exact "admin" group
    const validAdminRes = await adminHandler(
      buildApiEvent({
        requestId: 'req-valid-admin',
        method: 'POST',
        path: '/admin/rooms',
        sub: 'admin-sub-01',
        groups: ['admin'],
        scopes: ['openid', 'classspace/admin'],
      }),
    );
    expect(validAdminRes.statusCode).toBe(200);
    const adminBody = JSON.parse(validAdminRes.body) as { data: { adminId: string } };
    expect(adminBody.data.adminId).toBe('admin-sub-01');
  });

  test('20. Health handler returns standardized success response without secrets or account IDs', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await healthHandler(
        buildApiEvent({
          requestId: 'req-health-99',
          method: 'GET',
          path: '/health',
        }),
      );

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/json');
      const parsed = JSON.parse(res.body) as {
        success: boolean;
        data: { status: string; service: string; timezone: string; timestamp: string };
        requestId: string;
      };

      expect(parsed.success).toBe(true);
      expect(parsed.requestId).toBe('req-health-99');
      expect(parsed.data.status).toBe('ok');
      expect(parsed.data.service).toBe('classspace-dev-api');
      expect(parsed.data.timezone).toBe('Asia/Kolkata');
      expect(typeof parsed.data.timestamp).toBe('string');
      expect(res.body).not.toMatch(/secret|password|accountId|AWS_ACCESS_KEY/i);
    } finally {
      spy.mockRestore();
    }
  });
});
