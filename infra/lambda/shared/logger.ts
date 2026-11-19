export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface StructuredLogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly requestId: string;
  readonly route: string;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY_FRAGMENTS = [
  'authorization',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'password',
  'clientsecret',
  'secret',
  'token',
  'cookie',
  'x-api-key',
  'credential',
] as const;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function looksLikeJwtOrBearer(value: string): boolean {
  if (/^Bearer\s+/i.test(value)) return true;
  // Standard JWT 3-part base64url header prefix
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value);
}

export function redactSensitiveValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return looksLikeJwtOrBearer(value) ? '[REDACTED_TOKEN]' : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSensitiveValue(v, depth + 1);
      }
    }
    return out;
  }

  return value;
}

export type LogSink = (serializedJson: string) => void;

export class StructuredLogger {
  private readonly requestId: string;
  private readonly route: string;
  private readonly sink: LogSink;

  constructor(
    requestId: string,
    route: string,
    sink: LogSink = (line) => console.log(line),
  ) {
    this.requestId = requestId;
    this.route = route;
    this.sink = sink;
  }

  private write(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    const safeMetadata = metadata
      ? (redactSensitiveValue(metadata) as Record<string, unknown>)
      : undefined;

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      requestId: this.requestId,
      route: this.route,
      message,
      ...(safeMetadata ? { metadata: safeMetadata } : {}),
    };

    this.sink(JSON.stringify(entry));
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.write('DEBUG', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.write('INFO', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.write('WARN', message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.write('ERROR', message, metadata);
  }
}
