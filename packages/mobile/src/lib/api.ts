// Thin fetch wrapper — reads JWT from Zustand via an injected getter to avoid
// circular imports with the store (which imports from @forbiddenlan/comms).
import { CONFIG } from '../config';

// Injected getters to avoid circular imports
let _getJwt: () => string | null = () => null;
let _getServerUrl: () => string | null = () => null;

export function setJwtGetter(fn: () => string | null) { _getJwt = fn; }
export function setServerUrlGetter(fn: () => string | null) { _getServerUrl = fn; }

export function getEffectiveApiUrl(): string {
  return _getServerUrl() ?? CONFIG.API_URL;
}

export function getEffectiveWsUrl(): string {
  const base = _getServerUrl();
  if (base) return base.replace(/^http/, 'ws') + '/ws';
  return CONFIG.WS_URL;
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(body?.error ?? `Request failed: ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const jwt = _getJwt();
  const headers: Record<string, string> = {};
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  if (options.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${getEffectiveApiUrl()}${path}`, { ...options, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get:    <T>(path: string)                 => request<T>(path),
  post:   <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST',   body: body ? JSON.stringify(body) : undefined }),
  put:    <T>(path: string, body: unknown)  => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)  => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(path: string)                 => request<T>(path, { method: 'DELETE' }),
};
