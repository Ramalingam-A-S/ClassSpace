import { StructuredLogger } from '../lambda/shared/logger';

describe('Structured JSON Logger & Sensitive Redaction Tests', () => {
  test('14. Redacts sensitive keys and JWT/Bearer tokens from log metadata', () => {
    const captured: string[] = [];
    const logger = new StructuredLogger('req-log-1', 'POST /bookings', (line) =>
      captured.push(line),
    );

    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.signature123';

    logger.info('Attempting request', {
      roomId: 'room-ece-201',
      authorization: `Bearer ${fakeJwt}`,
      nested: {
        accessToken: fakeJwt,
        refreshToken: 'refresh-secret-value',
        password: 'MySecretPassword123',
        clientSecret: 'super-secret',
        unexpectedNote: fakeJwt,
      },
    });

    expect(captured).toHaveLength(1);
    const serialized = captured[0]!;
    expect(serialized).not.toContain(fakeJwt);
    expect(serialized).not.toContain('refresh-secret-value');
    expect(serialized).not.toContain('MySecretPassword123');
    expect(serialized).not.toContain('super-secret');

    const parsed = JSON.parse(serialized) as {
      level: string;
      requestId: string;
      route: string;
      message: string;
      metadata: {
        roomId: string;
        authorization: string;
        nested: Record<string, string>;
      };
    };

    expect(parsed.level).toBe('INFO');
    expect(parsed.requestId).toBe('req-log-1');
    expect(parsed.route).toBe('POST /bookings');
    expect(parsed.metadata.roomId).toBe('room-ece-201');
    expect(parsed.metadata.authorization).toBe('[REDACTED]');
    expect(parsed.metadata.nested.accessToken).toBe('[REDACTED]');
    expect(parsed.metadata.nested.refreshToken).toBe('[REDACTED]');
    expect(parsed.metadata.nested.password).toBe('[REDACTED]');
    expect(parsed.metadata.nested.clientSecret).toBe('[REDACTED]');
    expect(parsed.metadata.nested.unexpectedNote).toBe('[REDACTED_TOKEN]');
  });
});
