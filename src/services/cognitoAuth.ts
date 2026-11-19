export interface CognitoRuntimeConfig {
  readonly apiBaseUrl: string;
  readonly cognitoRegion: string;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly cognitoDomain: string;
  readonly redirectUri: string;
  readonly logoutUri: string;
}

export interface AuthSession {
  readonly accessToken: string;
  readonly idToken: string;
  readonly expiresAtMs: number;
  readonly sub: string;
  readonly email?: string;
  readonly displayName: string;
  readonly groups: readonly string[];
  readonly scopes: readonly string[];
  readonly isAdmin: boolean;
}

interface PkcePendingState {
  readonly verifier: string;
  readonly state: string;
}

const PKCE_SESSION_STORAGE_KEY = 'classspace_pkce_pending_v1';

// Tokens are strictly kept in JavaScript heap memory — NEVER persisted to localStorage.
let inMemorySession: AuthSession | null = null;
const listeners = new Set<(session: AuthSession | null) => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(inMemorySession);
  }
}

function readEnv(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function defaultOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:5173';
}

export function getCognitoConfig(): CognitoRuntimeConfig {
  const origin = defaultOrigin();
  const apiBaseUrl = readEnv('VITE_API_BASE_URL').replace(/\/+$/, '');
  const cognitoRegion = readEnv('VITE_COGNITO_REGION') || 'ap-south-1';
  const userPoolId = readEnv('VITE_COGNITO_USER_POOL_ID');
  const clientId = readEnv('VITE_COGNITO_CLIENT_ID');
  const cognitoDomain = readEnv('VITE_COGNITO_DOMAIN').replace(/\/+$/, '');
  const redirectUri = readEnv('VITE_COGNITO_REDIRECT_URI') || `${origin}/auth/callback`;
  const logoutUri = readEnv('VITE_COGNITO_LOGOUT_URI') || `${origin}/`;

  return {
    apiBaseUrl,
    cognitoRegion,
    userPoolId,
    clientId,
    cognitoDomain,
    redirectUri,
    logoutUri,
  };
}

function isPlaceholderValue(value: string): boolean {
  if (!value) return true;
  return /placeholder|example\.invalid|YOUR_/i.test(value);
}

export function isLiveModeConfigured(config = getCognitoConfig()): boolean {
  return (
    !isPlaceholderValue(config.apiBaseUrl) &&
    /^https:\/\//i.test(config.apiBaseUrl) &&
    !isPlaceholderValue(config.clientId) &&
    !isPlaceholderValue(config.cognitoDomain) &&
    /^https:\/\//i.test(config.cognitoDomain)
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function generatePkceVerifier(): string {
  const randomBytes = new Uint8Array(48);
  crypto.getRandomValues(randomBytes);
  return toBase64Url(randomBytes);
}

export function generateOAuthState(): string {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  return toBase64Url(randomBytes);
}

export async function derivePkceChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return toBase64Url(new Uint8Array(digest));
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) {
    throw new Error('Malformed JWT returned by Cognito.');
  }
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const json = atob(padded);
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Unexpected JWT claim structure.');
  }
  return parsed as Record<string, unknown>;
}

export function getAuthSession(): AuthSession | null {
  if (inMemorySession && Date.now() >= inMemorySession.expiresAtMs) {
    inMemorySession = null;
    notifyListeners();
  }
  return inMemorySession;
}

export function getAccessToken(): string | null {
  return getAuthSession()?.accessToken ?? null;
}

export function setAuthSessionForTesting(session: AuthSession | null): void {
  inMemorySession = session;
  notifyListeners();
}

export function subscribeAuthSession(
  listener: (session: AuthSession | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearAuthSession(): void {
  inMemorySession = null;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(PKCE_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage failures
    }
  }
  notifyListeners();
}

export async function buildCognitoAuthorizeUrl(
  config = getCognitoConfig(),
): Promise<{ authorizeUrl: string; state: string; verifier: string }> {
  if (!isLiveModeConfigured(config)) {
    throw new Error(
      'Live AWS Cognito mode is not configured. Deploy infra and set VITE_API_BASE_URL, VITE_COGNITO_CLIENT_ID, and VITE_COGNITO_DOMAIN in .env.local.',
    );
  }

  const verifier = generatePkceVerifier();
  const state = generateOAuthState();
  const challenge = await derivePkceChallenge(verifier);

  const pending: PkcePendingState = { verifier, state };
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.setItem(PKCE_SESSION_STORAGE_KEY, JSON.stringify(pending));
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'openid email profile classspace/read classspace/bookings/write classspace/admin',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });

  return {
    authorizeUrl: `${config.cognitoDomain}/oauth2/authorize?${params.toString()}`,
    state,
    verifier,
  };
}

export async function startCognitoLogin(): Promise<void> {
  const { authorizeUrl } = await buildCognitoAuthorizeUrl();
  window.location.assign(authorizeUrl);
}

export async function exchangeAuthorizationCode(
  code: string,
  returnedState: string,
  config = getCognitoConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<AuthSession> {
  if (!isLiveModeConfigured(config)) {
    throw new Error('Live AWS Cognito configuration is missing.');
  }

  let pendingRaw: string | null = null;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    pendingRaw = window.sessionStorage.getItem(PKCE_SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(PKCE_SESSION_STORAGE_KEY);
  }

  if (!pendingRaw) {
    throw new Error('Missing PKCE verification state. Please retry signing in.');
  }

  const pending = JSON.parse(pendingRaw) as Partial<PkcePendingState>;
  if (!pending.verifier || !pending.state || pending.state !== returnedState) {
    throw new Error('OAuth state mismatch detected. Authentication aborted.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: pending.verifier,
  });

  const response = await fetchImpl(`${config.cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    id_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token || !payload.id_token) {
    throw new Error(
      payload.error_description || payload.error || 'Failed to exchange authorization code.',
    );
  }

  const accessClaims = decodeJwtPayload(payload.access_token);
  const idClaims = decodeJwtPayload(payload.id_token);

  const sub = typeof accessClaims['sub'] === 'string' ? accessClaims['sub'] : String(idClaims['sub'] ?? '');
  const rawGroups = accessClaims['cognito:groups'] ?? idClaims['cognito:groups'];
  const groups = Array.isArray(rawGroups)
    ? rawGroups.filter((g): g is string => typeof g === 'string')
    : [];
  const rawScope = typeof accessClaims['scope'] === 'string' ? accessClaims['scope'] : '';
  const scopes = rawScope.split(/\s+/).filter(Boolean);
  const email = typeof idClaims['email'] === 'string' ? idClaims['email'] : undefined;
  const displayName =
    (typeof idClaims['name'] === 'string' && idClaims['name']) ||
    email ||
    (typeof accessClaims['username'] === 'string' ? accessClaims['username'] : 'Campus User');

  const expiresInSec = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
  const session: AuthSession = {
    accessToken: payload.access_token,
    idToken: payload.id_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
    sub,
    email,
    displayName,
    groups,
    scopes,
    isAdmin: groups.includes('admin'),
  };

  inMemorySession = session;
  notifyListeners();
  return session;
}

export function buildCognitoLogoutUrl(config = getCognitoConfig()): string | null {
  if (!isLiveModeConfigured(config)) {
    return null;
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.logoutUri,
  });
  return `${config.cognitoDomain}/logout?${params.toString()}`;
}
