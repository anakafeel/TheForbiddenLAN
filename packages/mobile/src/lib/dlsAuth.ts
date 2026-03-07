import { CONFIG } from '../config';

interface DlsCredentials {
  username: string;
  password: string;
}

let runtimeCredentials: DlsCredentials | null = null;
let cachedJwt: string | null = null;

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function getEnvCredentials(): DlsCredentials | null {
  const username = (CONFIG as any).DLS140_USERNAME ?? '';
  const password = (CONFIG as any).DLS140_PASSWORD ?? '';
  if (!username || !password) return null;
  return { username, password };
}

function resolveCredentials(): DlsCredentials | null {
  if (runtimeCredentials?.username && runtimeCredentials?.password) return runtimeCredentials;
  return getEnvCredentials();
}

export function setDlsCredentials(username: string, password: string): void {
  const nextUsername = username.trim();
  const nextPassword = password.trim();
  if (!nextUsername || !nextPassword) return;

  const changed =
    !runtimeCredentials ||
    runtimeCredentials.username !== nextUsername ||
    runtimeCredentials.password !== nextPassword;

  runtimeCredentials = {
    username: nextUsername,
    password: nextPassword,
  };

  if (changed) cachedJwt = null;
}

export function clearDlsSession(): void {
  runtimeCredentials = null;
  cachedJwt = null;
}

async function loginToDls(): Promise<string> {
  const credentials = resolveCredentials();
  if (!credentials) {
    throw new Error('Missing DLS-140 credentials. Login first or set EXPO_PUBLIC_DLS140_USERNAME/PASSWORD.');
  }

  const response = await fetch(`${trimSlash(CONFIG.DLS140_URL)}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
    }),
  });

  if (!response.ok) {
    throw new Error(`DLS-140 login failed (${response.status}).`);
  }

  const payload = await response.json().catch(() => null);
  const jwt = typeof payload?.jwt === 'string' ? payload.jwt : '';
  if (!jwt) {
    throw new Error('DLS-140 login response did not include jwt.');
  }

  cachedJwt = jwt;
  return jwt;
}

async function fetchWithDlsJwt(path: string, retryOnUnauthorized = true): Promise<Response> {
  const jwt = cachedJwt ?? (await loginToDls());
  const response = await fetch(`${trimSlash(CONFIG.DLS140_URL)}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (response.status === 401 && retryOnUnauthorized) {
    cachedJwt = null;
    await loginToDls();
    return fetchWithDlsJwt(path, false);
  }

  return response;
}

export async function getDlsGpsPayload(): Promise<any> {
  let response: Response;
  try {
    response = await fetchWithDlsJwt('/location/gps');
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Cannot reach DLS-140 at ${CONFIG.DLS140_URL}. Ensure you are on the router LAN and CORS is allowed.`,
      );
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`DLS-140 /location/gps failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  return response.json().catch(() => {
    throw new Error('DLS-140 /location/gps returned invalid JSON.');
  });
}

