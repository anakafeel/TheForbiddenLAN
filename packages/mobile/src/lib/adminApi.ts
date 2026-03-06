import { api, ApiError } from './api';

export type AdminApiSource = 'skytalk' | 'dls';

export interface AdminDevice {
  id: string;
  serial: string;
  name: string;
  site: string;
  active: boolean;
  source: AdminApiSource;
  // DLS swagger toggle target (/network/toggle expects one of these types).
  toggleType?: 'wifi' | 'cellular' | 'certus';
}

export interface AdminTalkgroup {
  id: string;
  name: string;
  rotation_counter: number;
  source: AdminApiSource;
}

export interface AdminUser {
  id: string;
  username: string;
  role: string;
  created_at?: string;
  device_id?: string;
  permissions?: Record<string, unknown>;
  source: AdminApiSource;
}

export interface AdminMapPosition {
  deviceId: string;
  deviceName: string;
  active: boolean;
  lat: number;
  lng: number;
  alt: number;
  updated_at: string;
  source: AdminApiSource;
}

export interface AdminMonitoringEvent {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AdminMonitoringRoom {
  talkgroup: string;
  members: number;
  floorHolder: string | null;
}

export interface AdminMonitoringMetrics {
  connectedSockets: number;
  activeTalkgroups: number;
  floorHolders: number;
  udpClients: number;
  udpAudioRelays: number;
  activeSessionRoutes: number;
  senderDeviceMappings: number;
  rooms: AdminMonitoringRoom[];
}

export interface AdminMonitoringSnapshot {
  generated_at: string;
  started_at: string;
  uptime_seconds: number;
  metrics: AdminMonitoringMetrics;
  logs: AdminMonitoringEvent[];
}

const UNSUPPORTED_STATUSES = new Set([404, 405, 501]);

function statusOf(error: unknown): number {
  if (error instanceof ApiError) return Number(error.status);
  if (typeof error === 'object' && error !== null) {
    const status = (error as any).status;
    if (typeof status === 'number') return status;
  }
  return 0;
}

export function isApiNotSupported(error: unknown): boolean {
  return UNSUPPORTED_STATUSES.has(statusOf(error));
}

export function getAdminErrorMessage(error: unknown, fallback = 'Request failed'): string {
  if (isApiNotSupported(error)) {
    return 'This feature is not available on the current API target.';
  }

  if (error instanceof ApiError) {
    const bodyError = typeof error.body?.error === 'string' ? error.body.error : '';
    return bodyError || `Request failed (${error.status})`;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

async function requestOptional<T>(request: () => Promise<T>): Promise<T | null> {
  try {
    return await request();
  } catch (error) {
    if (isApiNotSupported(error)) return null;
    throw error;
  }
}

function asArray(payload: any, key: string): any[] {
  if (Array.isArray(payload)) return payload;
  const nested = payload?.[key];
  return Array.isArray(nested) ? nested : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeDevice(raw: any, source: AdminApiSource): AdminDevice | null {
  const id = asString(raw?.id) || asString(raw?.serial) || asString(raw?.serialNumber);
  const serial = asString(raw?.serial) || asString(raw?.serialNumber) || id;
  const name = asString(raw?.name) || asString(raw?.productName) || serial || id;
  const site = asString(raw?.site) || asString(raw?.partNumber) || 'local';
  const state = asString(raw?.state).toLowerCase();
  const active =
    typeof raw?.active === 'boolean'
      ? raw.active
      : ['active', 'online', 'enabled', 'up'].includes(state);

  if (!id && !serial && !name) return null;

  return {
    id: id || serial || name,
    serial: serial || id || name,
    name: name || serial || id,
    site,
    active,
    source,
  };
}

function normalizeTalkgroup(raw: any): AdminTalkgroup | null {
  const nested = raw?.talkgroups ?? raw?.talkgroup ?? raw;
  const id = asString(raw?.id) || asString(raw?.talkgroup_id) || asString(nested?.id);
  const name = asString(raw?.name) || asString(nested?.name);
  if (!id || !name) return null;

  const rotation = asNumber(raw?.rotation_counter ?? nested?.rotation_counter) ?? 0;

  return {
    id,
    name,
    rotation_counter: rotation,
    source: 'skytalk',
  };
}

function normalizeUser(raw: any, source: AdminApiSource): AdminUser | null {
  const username = asString(raw?.username);
  if (!username) return null;

  const permissions =
    raw?.permissions && typeof raw.permissions === 'object' && !Array.isArray(raw.permissions)
      ? (raw.permissions as Record<string, unknown>)
      : undefined;

  return {
    id: asString(raw?.id) || asString(raw?.user_id) || username,
    username,
    role: asString(raw?.role) || 'user',
    created_at: asString(raw?.created_at) || asString(raw?.createdAt) || undefined,
    device_id: asString(raw?.device_id) || asString(raw?.deviceId) || undefined,
    permissions,
    source,
  };
}

function normalizeMonitoringEvent(raw: any): AdminMonitoringEvent | null {
  const id = asString(raw?.id);
  const timestamp = asString(raw?.timestamp) || new Date().toISOString();
  const message = asString(raw?.message);
  if (!id || !message) return null;

  const levelRaw = asString(raw?.level).toLowerCase();
  const level: AdminMonitoringEvent['level'] =
    levelRaw === 'warn' || levelRaw === 'error' ? levelRaw : 'info';

  const metadata =
    raw?.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : undefined;

  return {
    id,
    timestamp,
    level,
    category: asString(raw?.category) || 'system',
    message,
    metadata,
  };
}

function normalizeMonitoringSnapshot(raw: any): AdminMonitoringSnapshot {
  const rooms = asArray(raw?.metrics, 'rooms')
    .map((room): AdminMonitoringRoom | null => {
      const talkgroup = asString(room?.talkgroup);
      if (!talkgroup) return null;
      return {
        talkgroup,
        members: asNumber(room?.members) ?? 0,
        floorHolder: asString(room?.floorHolder) || null,
      };
    })
    .filter((room): room is AdminMonitoringRoom => Boolean(room));

  const metrics: AdminMonitoringMetrics = {
    connectedSockets: asNumber(raw?.metrics?.connectedSockets) ?? 0,
    activeTalkgroups: asNumber(raw?.metrics?.activeTalkgroups) ?? rooms.length,
    floorHolders: asNumber(raw?.metrics?.floorHolders) ?? 0,
    udpClients: asNumber(raw?.metrics?.udpClients) ?? 0,
    udpAudioRelays: asNumber(raw?.metrics?.udpAudioRelays) ?? 0,
    activeSessionRoutes: asNumber(raw?.metrics?.activeSessionRoutes) ?? 0,
    senderDeviceMappings: asNumber(raw?.metrics?.senderDeviceMappings) ?? 0,
    rooms,
  };

  return {
    generated_at: asString(raw?.generated_at) || new Date().toISOString(),
    started_at: asString(raw?.started_at) || new Date().toISOString(),
    uptime_seconds: asNumber(raw?.uptime_seconds) ?? 0,
    metrics,
    logs: asArray(raw, 'logs')
      .map((event) => normalizeMonitoringEvent(event))
      .filter((event): event is AdminMonitoringEvent => Boolean(event)),
  };
}

export async function listAdminDevices(): Promise<AdminDevice[]> {
  const skytalkResponse = await requestOptional(() => api.get<any>('/devices'));
  if (skytalkResponse !== null) {
    return asArray(skytalkResponse, 'devices')
      .map((row) => normalizeDevice(row, 'skytalk'))
      .filter((row): row is AdminDevice => Boolean(row));
  }

  const [infoResponse, stateResponse, nameResponse] = await Promise.all([
    requestOptional(() => api.get<any>('/device/info')),
    requestOptional(() => api.get<any>('/device/state')),
    requestOptional(() => api.get<any>('/device/name')),
  ]);

  if (!infoResponse && !stateResponse && !nameResponse) return [];

  const info = infoResponse ?? {};
  const state = asString((stateResponse as any)?.state).toLowerCase();
  const serial = asString((info as any)?.serialNumber) || 'local-device';
  const name = asString((nameResponse as any)?.name) || asString((info as any)?.productName) || 'DLS-140';
  const site = asString((info as any)?.partNumber) || 'local';

  return [
    {
      id: serial,
      serial,
      name,
      site,
      active: state ? ['active', 'online', 'enabled', 'up'].includes(state) : true,
      source: 'dls',
      toggleType: 'cellular',
    },
  ];
}

export async function setAdminDeviceActive(device: AdminDevice, active: boolean): Promise<void> {
  if (device.source === 'skytalk') {
    await api.patch(`/devices/${encodeURIComponent(device.id)}/status`, { active });
    return;
  }

  // Swagger fallback (DLS-140): maps "enabled" to a network interface toggle.
  await api.post('/network/toggle', { type: device.toggleType ?? 'cellular', enabled: active });
}

export async function listAdminTalkgroups(): Promise<AdminTalkgroup[]> {
  const response = await requestOptional(() => api.get<any>('/talkgroups'));
  if (response === null) return [];

  return asArray(response, 'talkgroups')
    .map((row) => normalizeTalkgroup(row))
    .filter((row): row is AdminTalkgroup => Boolean(row));
}

export async function createAdminTalkgroup(name: string): Promise<AdminTalkgroup> {
  try {
    const response = await api.post<any>('/talkgroups', { name });
    const normalized = normalizeTalkgroup(response?.talkgroup ?? response);
    if (!normalized) throw new Error('Server returned an invalid talkgroup payload');
    return normalized;
  } catch (error) {
    if (isApiNotSupported(error)) {
      throw new Error('Talkgroup management is not supported by this API target.');
    }
    throw error;
  }
}

export async function joinAdminTalkgroup(talkgroupId: string): Promise<void> {
  await requestOptional(() => api.post(`/talkgroups/${encodeURIComponent(talkgroupId)}/join`));
}

export async function deleteAdminTalkgroup(talkgroupId: string): Promise<void> {
  try {
    await api.delete(`/talkgroups/${encodeURIComponent(talkgroupId)}`);
  } catch (error) {
    if (isApiNotSupported(error)) {
      throw new Error('Talkgroup management is not supported by this API target.');
    }
    throw error;
  }
}

export async function rotateAdminTalkgroupKey(talkgroupId: string): Promise<number | undefined> {
  try {
    const response = await api.post<any>('/keys/rotate', { talkgroupId });
    const counter = asNumber(response?.counter ?? response?.rotation_counter);
    return counter ?? undefined;
  } catch (error) {
    if (isApiNotSupported(error)) {
      throw new Error('Key rotation is not supported by this API target.');
    }
    throw error;
  }
}

export async function listAdminTalkgroupMembers(talkgroupId: string): Promise<AdminUser[]> {
  const response = await requestOptional(() => api.get<any>(`/talkgroups/${encodeURIComponent(talkgroupId)}/members`));
  if (response === null) return [];

  return asArray(response, 'members')
    .map((row) => normalizeUser(row, 'skytalk'))
    .filter((row): row is AdminUser => Boolean(row));
}

export async function addAdminTalkgroupMember(talkgroupId: string, userId: string): Promise<void> {
  try {
    await api.post(`/talkgroups/${encodeURIComponent(talkgroupId)}/members`, { userId });
  } catch (error) {
    if (isApiNotSupported(error)) {
      throw new Error('Talkgroup membership updates are not supported by this API target.');
    }
    throw error;
  }
}

export async function removeAdminTalkgroupMember(talkgroupId: string, userId: string): Promise<void> {
  try {
    await api.delete(`/talkgroups/${encodeURIComponent(talkgroupId)}/members/${encodeURIComponent(userId)}`);
  } catch (error) {
    if (isApiNotSupported(error)) {
      throw new Error('Talkgroup membership updates are not supported by this API target.');
    }
    throw error;
  }
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const response = await api.get<any>('/users');
  const source: AdminApiSource = Array.isArray(response) ? 'dls' : 'skytalk';

  return asArray(response, 'users')
    .map((row) => normalizeUser(row, source))
    .filter((row): row is AdminUser => Boolean(row));
}

export async function createAdminUser(input: { username: string; password: string; role?: string }): Promise<void> {
  const username = input.username.trim();
  const password = input.password.trim();
  const role = (input.role ?? 'user').trim() || 'user';

  try {
    await api.post('/auth/register', { username, password });
    return;
  } catch (error) {
    if (!isApiNotSupported(error)) throw error;
  }

  // Swagger fallback (DLS-140): PUT /users with explicit role.
  await api.put('/users', { username, password, role });
}

export async function deleteAdminUser(user: AdminUser): Promise<void> {
  if (user.id) {
    try {
      await api.post(`/users/${encodeURIComponent(user.id)}/remove`);
      return;
    } catch (error) {
      if (!isApiNotSupported(error)) throw error;
    }
  }

  if (user.id) {
    try {
      await api.delete(`/users/${encodeURIComponent(user.id)}`);
      return;
    } catch (error) {
      if (!isApiNotSupported(error)) throw error;
    }
  }

  if (user.username) {
    await api.delete(`/users/${encodeURIComponent(user.username)}`);
    return;
  }

  throw new Error('Cannot delete user without an identifier.');
}

export async function listAdminMapPositions(): Promise<AdminMapPosition[]> {
  const devices = await listAdminDevices();
  const skytalkDevices = devices.filter((d) => d.source === 'skytalk');

  if (skytalkDevices.length > 0) {
    const gpsResults = await Promise.allSettled(
      skytalkDevices.map(async (device): Promise<AdminMapPosition> => {
        const response = await api.get<any>(`/devices/${encodeURIComponent(device.id)}/gps`);
        const gps = response?.gps ?? response;
        const lat = asNumber(gps?.lat);
        const lng = asNumber(gps?.lng);
        if (lat == null || lng == null) throw new Error('missing_gps_coordinates');

        return {
          deviceId: device.id,
          deviceName: device.name || device.serial,
          active: device.active,
          lat,
          lng,
          alt: asNumber(gps?.alt) ?? 0,
          updated_at: asString(gps?.updated_at) || new Date().toISOString(),
          source: 'skytalk',
        };
      }),
    );

    const positions: AdminMapPosition[] = [];
    for (const result of gpsResults) {
      if (result.status === 'fulfilled') {
        positions.push(result.value);
      }
    }

    if (positions.length > 0) return positions;
  }

  const fallbackGps = await requestOptional(() => api.get<any>('/location/gps'));
  if (!fallbackGps) return [];

  const lat = asNumber((fallbackGps as any)?.lat);
  const lng = asNumber((fallbackGps as any)?.lng);
  if (lat == null || lng == null) return [];

  const device = devices[0];
  return [
    {
      deviceId: device?.id ?? 'local-device',
      deviceName: device?.name ?? 'DLS-140',
      active: device?.active ?? true,
      lat,
      lng,
      alt: asNumber((fallbackGps as any)?.alt) ?? 0,
      updated_at: new Date().toISOString(),
      source: 'dls',
    },
  ];
}

export async function getAdminMonitoringSnapshot(limit = 150): Promise<AdminMonitoringSnapshot> {
  const safeLimit = Math.max(10, Math.min(500, Math.floor(Number(limit) || 150)));
  const response = await api.get<any>(`/monitoring/snapshot?limit=${safeLimit}`);
  return normalizeMonitoringSnapshot(response);
}
