export interface ApiTalkgroup {
  id: string;
  name: string;
  rotation_counter: number;
  created_at: string;
}

export interface ApiDevice {
  id: string;
  name: string;
  site: string;
  serial: string;
  active: boolean;
  created_at: string;
}

export interface ApiUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  created_at: string;
  device_id: string | null;
}

export interface ApiGps {
  id: string;
  device_id: string;
  lat: number;
  lng: number;
  alt: number;
  updated_at: string;
}

interface RequestOptions {
  baseUrl: string;
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  token?: string;
  body?: object;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requestJson<T>({ baseUrl, path, method = 'GET', token, body }: RequestOptions): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error: string }).error)
        : `${response.status} ${response.statusText}`;
    throw new ApiError(response.status, message);
  }

  return payload as T;
}

export function decodeJwtRole(token: string): 'admin' | 'user' | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const json = atob(padded);
    const data = JSON.parse(json) as { role?: string };
    if (data.role === 'admin' || data.role === 'user') {
      return data.role;
    }
    return null;
  } catch {
    return null;
  }
}
