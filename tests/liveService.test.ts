import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AwsClassSpaceService,
  buildCognitoAuthorizeUrl,
  classSpaceService,
  clearAuthSession,
  derivePkceChallenge,
  exchangeAuthorizationCode,
  generatePkceVerifier,
  getAccessToken,
  getAuthSession,
  setActiveServiceMode,
  setAuthSessionForTesting,
  type AuthSession,
} from '../src/services';

function encodeFakeJwt(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${header}.${payload}.fake-signature`;
}

const TEST_COGNITO_CONFIG = {
  apiBaseUrl: 'https://live-api.example.org',
  cognitoRegion: 'ap-south-1',
  userPoolId: 'ap-south-1_TestPool123',
  clientId: '1abc2def3ghi4jkl5mno6pqr',
  cognitoDomain: 'https://classspace-dev-auth.auth.ap-south-1.amazoncognito.com',
  redirectUri: 'http://localhost:5173/auth/callback',
  logoutUri: 'http://localhost:5173/',
};

describe('Cognito PKCE Auth & AwsClassSpaceService Live Mode', () => {
  beforeEach(() => {
    clearAuthSession();
    setActiveServiceMode('DEMO');
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('generates PKCE S256 verifier/challenge, builds Hosted UI authorize URL, exchanges code, and stores tokens ONLY in memory', async () => {
    const verifier = generatePkceVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const challenge = await derivePkceChallenge(verifier);
    expect(challenge).not.toBe(verifier);

    const { authorizeUrl, state } = await buildCognitoAuthorizeUrl(TEST_COGNITO_CONFIG);
    const parsedUrl = new URL(authorizeUrl);
    expect(parsedUrl.searchParams.get('response_type')).toBe('code');
    expect(parsedUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsedUrl.searchParams.get('client_id')).toBe(TEST_COGNITO_CONFIG.clientId);
    expect(parsedUrl.searchParams.get('client_secret')).toBeNull();

    const accessJwt = encodeFakeJwt({
      sub: 'cognito-user-01',
      'cognito:groups': ['admin'],
      scope: 'openid email profile classspace/read classspace/bookings/write classspace/admin',
    });
    const idJwt = encodeFakeJwt({
      sub: 'cognito-user-01',
      email: 'admin@college.edu',
      name: 'Block Admin',
    });

    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: accessJwt,
          id_token: idJwt,
          expires_in: 3600,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const session = await exchangeAuthorizationCode(
      'auth-code-xyz',
      state,
      TEST_COGNITO_CONFIG,
      mockFetch as unknown as typeof fetch,
    );

    expect(session.sub).toBe('cognito-user-01');
    expect(session.isAdmin).toBe(true);
    expect(getAccessToken()).toBe(accessJwt);
    // Crucial security rule: access/id tokens MUST NEVER be stored in localStorage
    expect(JSON.stringify(window.localStorage)).not.toContain(accessJwt);
    expect(JSON.stringify(window.sessionStorage)).not.toContain(accessJwt);
  });

  it('rejects OAuth state mismatch during PKCE callback', async () => {
    await buildCognitoAuthorizeUrl(TEST_COGNITO_CONFIG);
    await expect(
      exchangeAuthorizationCode('auth-code-xyz', 'wrong-state', TEST_COGNITO_CONFIG),
    ).rejects.toThrow(/state mismatch/i);
  });

  it('executes Live API requests with Bearer token, Idempotency-Key, envelope unwrapping, and clean error reporting', async () => {
    const studentSession: AuthSession = {
      accessToken: 'live-access-token',
      idToken: 'live-id-token',
      expiresAtMs: Date.now() + 60_000,
      sub: 'student-live-01',
      displayName: 'Live Student',
      groups: ['student'],
      scopes: ['classspace/read', 'classspace/bookings/write'],
      isAdmin: false,
    };
    setAuthSessionForTesting(studentSession);

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith('/bookings') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            success: true,
            requestId: 'req-1',
            data: {
              bookingId: 'bkg-live-1',
              roomId: 'block-a-a-101',
              studentId: 'student-live-01',
              purpose: 'Study Session',
              date: '2026-11-26',
              startTime: '11:00',
              endTime: '12:00',
              status: 'PENDING',
              createdAt: '2026-11-19T10:00:00Z',
              dataSource: 'ADMIN_ENTERED',
            },
          }),
          { status: 201 },
        );
      }

      if (url.endsWith('/bookings/bkg-live-1/cancel') && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            success: true,
            requestId: 'req-2',
            data: {
              bookingId: 'bkg-live-1',
              roomId: 'block-a-a-101',
              studentId: 'student-live-01',
              purpose: 'Study Session',
              date: '2026-11-26',
              startTime: '11:00',
              endTime: '12:00',
              status: 'CANCELLED',
              createdAt: '2026-11-19T10:00:00Z',
              dataSource: 'ADMIN_ENTERED',
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          requestId: 'req-err',
          error: { code: 'CONFLICT', message: 'Slot conflict on server.' },
        }),
        { status: 409 },
      );
    });

    const liveService = new AwsClassSpaceService(
      () => 'https://live-api.example.org',
      mockFetch as unknown as typeof fetch,
    );

    const created = await liveService.createBooking({
      roomId: 'block-a-a-101',
      studentId: 'student-live-01',
      studentName: 'Live Student',
      purpose: 'Study Session',
      date: '2026-11-26',
      startTime: '11:00',
      endTime: '12:00',
    });

    expect(created.bookingId).toBe('bkg-live-1');
    const postHeaders = new Headers(requests[0]?.init?.headers);
    expect(postHeaders.get('Authorization')).toBe('Bearer live-access-token');
    expect(postHeaders.get('Idempotency-Key')).toBeTruthy();

    // Student cancellation routes to /bookings/{id}/cancel
    const cancelled = await liveService.updateBookingStatus('bkg-live-1', 'CANCELLED');
    expect(cancelled.status).toBe('CANCELLED');
    expect(requests[1]?.url).toContain('/bookings/bkg-live-1/cancel');

    // Error envelope propagates readable conflict message
    await expect(liveService.listRooms()).rejects.toThrow('Slot conflict on server.');
    expect(getAuthSession()?.sub).toBe('student-live-01');
  });

  it('preserves Phase 1 Demo Mode by default while allowing clean Live delegation switch', async () => {
    const demoRooms = await classSpaceService.listRooms();
    expect(demoRooms.length).toBeGreaterThan(0);

    setActiveServiceMode('LIVE');
    await expect(classSpaceService.listRooms()).rejects.toThrow(/Sign in with Amazon Cognito/i);

    setActiveServiceMode('DEMO');
    const restoredDemoRooms = await classSpaceService.listRooms();
    expect(restoredDemoRooms.length).toBe(demoRooms.length);
  });
});
