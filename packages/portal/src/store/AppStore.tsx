import React, { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

import {
  ApiDevice,
  ApiError,
  ApiGps,
  ApiTalkgroup,
  ApiUser,
  decodeJwtRole,
  requestJson,
} from './api';
import {
  activities as activitySeed,
  channels as channelSeed,
  devices as deviceSeed,
  keyGroups as keyGroupSeed,
  routers as routerSeed,
  transmissions as transmissionSeed,
  users as userSeed,
} from './data';
import { ActivityEvent, Channel, DataMode, Device, KeyGroup, Router, Transmission, User } from './types';

interface AppStoreValue {
  routers: Router[];
  devices: Device[];
  channels: Channel[];
  users: User[];
  transmissions: Transmission[];
  keyGroups: KeyGroup[];
  activities: ActivityEvent[];
  selectedRouterId: string;
  setSelectedRouterId: (routerId: string) => void;
  createChannel: (name: string, encrypted: boolean) => Promise<void>;
  deleteChannel: (channelId: string) => Promise<void>;
  toggleChannelLock: (channelId: string) => void;
  forceMuteChannel: (channelId: string) => void;
  moveUserToChannel: (userId: string, channelId: string) => void;
  rotateChannelKey: (channelId: string) => Promise<void>;
  disableDevice: (deviceId: string) => Promise<void>;
  rebootDevice: (deviceId: string) => void;
  reassignDeviceTalkgroup: (deviceId: string, talkgroup: string) => void;
  provisionUser: (userId: string) => void;
  revokeUser: (userId: string) => void;
  assignUserDevice: (userId: string, deviceId: string) => void;
  suspendUser: (userId: string) => void;
  registerUser: (payload: {
    username: string;
    password: string;
    deviceSerial?: string;
    site?: string;
  }) => Promise<boolean>;
  mode: DataMode;
  apiBaseUrl: string;
  setApiBaseUrl: (next: string) => void;
  authToken: string;
  authUsername: string;
  authRole: 'admin' | 'user' | null;
  isAuthenticated: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshData: () => Promise<void>;
  commsReady: boolean;
}

const AppStoreContext = createContext<AppStoreValue | undefined>(undefined);

const now = () => new Date().toISOString().slice(11, 19);

const DEFAULT_API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function clone<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

function toRouterId(site: string) {
  const normalized = site.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `rtr-${normalized || 'default'}`;
}

function buildRouters(devices: Device[], channels: Channel[]): Router[] {
  if (!devices.length) {
    return clone(routerSeed);
  }

  const groups = new Map<string, Device[]>();
  devices.forEach((device) => {
    const groupKey = device.routerId;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(device);
  });

  return Array.from(groups.entries()).map(([routerId, siteDevices]) => {
    const onlineCount = siteDevices.filter((device) => device.status === 'online').length;
    const degradedCount = siteDevices.filter((device) => device.status === 'degraded').length;
    const avgSignal =
      Math.round(
        siteDevices.reduce((sum, device) => sum + (device.signalStrength || 0), 0) /
          Math.max(siteDevices.length, 1),
      ) || 0;
    const withGps = siteDevices.filter((device) => typeof device.lat === 'number' && typeof device.lng === 'number');
    const lat =
      withGps.length > 0
        ? withGps.reduce((sum, device) => sum + (device.lat ?? 0), 0) / withGps.length
        : undefined;
    const lng =
      withGps.length > 0
        ? withGps.reduce((sum, device) => sum + (device.lng ?? 0), 0) / withGps.length
        : undefined;

    return {
      id: routerId,
      name: siteDevices[0]?.site ? `${siteDevices[0].site.toUpperCase()} Core` : routerId,
      region: siteDevices[0]?.site || 'unknown',
      status: onlineCount > 0 ? (degradedCount > 0 ? 'degraded' : 'online') : 'offline',
      signalStrength: avgSignal,
      assignedChannels: channels.map((channel) => channel.id),
      connectedDeviceIds: siteDevices.map((device) => device.id),
      lastHeartbeat: new Date().toISOString(),
      lat,
      lng,
    };
  });
}

function mapApiChannels(apiTalkgroups: ApiTalkgroup[], previous: Channel[]): Channel[] {
  return apiTalkgroups.map((talkgroup) => {
    const existing = previous.find((channel) => channel.id === talkgroup.id);
    return {
      id: talkgroup.id,
      name: talkgroup.name,
      activeTransmission: false,
      transmittingUserId: null,
      assignedRouterIds: existing?.assignedRouterIds ?? [],
      encrypted: true,
      locked: existing?.locked ?? false,
      muted: existing?.muted ?? false,
      rotationCounter: talkgroup.rotation_counter,
    };
  });
}

function mapApiDevices(apiDevices: ApiDevice[], gpsByDevice: Record<string, ApiGps | null>): Device[] {
  return apiDevices.map((device, index) => {
    const gps = gpsByDevice[device.id] ?? null;
    const signalStrength = device.active ? 74 + (index % 18) : 0;
    const battery = device.active ? 58 + (index % 35) : 0;

    return {
      id: device.id,
      label: device.name,
      routerId: toRouterId(device.site),
      status: device.active ? 'online' : 'offline',
      signalStrength,
      battery,
      assignedTalkgroup: 'Unassigned',
      lastGps:
        gps && typeof gps.lat === 'number' && typeof gps.lng === 'number'
          ? `${gps.lat.toFixed(4)},${gps.lng.toFixed(4)}`
          : 'No fix',
      firmware: 'v3.8.2',
      serial: device.serial,
      site: device.site,
      active: device.active,
      lat: gps?.lat,
      lng: gps?.lng,
      alt: gps?.alt,
      updatedAt: gps?.updated_at,
    };
  });
}

function mapApiUsers(apiUsers: ApiUser[], devices: Device[], previous: User[]): User[] {
  return apiUsers.map((user) => {
    const device = devices.find((item) => item.id === user.device_id);
    const existing = previous.find((item) => item.id === user.id);

    return {
      id: user.id,
      displayName: user.username,
      assignedDeviceId: user.device_id,
      activeChannelId: existing?.activeChannelId ?? null,
      role: user.role === 'admin' ? 'admin' : 'operator',
      keyGroupId: existing?.keyGroupId ?? 'kg-core',
      status: device ? device.status : 'offline',
      suspended: existing?.suspended ?? false,
      createdAt: user.created_at,
    };
  });
}

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [routers, setRouters] = useState<Router[]>(clone(routerSeed));
  const [devices, setDevices] = useState<Device[]>(clone(deviceSeed));
  const [channels, setChannels] = useState<Channel[]>(clone(channelSeed));
  const [users, setUsers] = useState<User[]>(clone(userSeed));
  const [transmissions] = useState<Transmission[]>(clone(transmissionSeed));
  const [keyGroups] = useState<KeyGroup[]>(clone(keyGroupSeed));
  const [activities, setActivities] = useState<ActivityEvent[]>(clone(activitySeed));
  const [selectedRouterId, setSelectedRouterId] = useState<string>(routerSeed[0]?.id ?? '');

  const [mode, setMode] = useState<DataMode>('mock');
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(DEFAULT_API_BASE);
  const [authToken, setAuthToken] = useState<string>('');
  const [authUsername, setAuthUsername] = useState<string>('');
  const [authRole, setAuthRole] = useState<'admin' | 'user' | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commsReady = mode === 'live' && !!authToken;

  const appendActivity = useCallback((severity: ActivityEvent['severity'], message: string) => {
    setActivities((prev) => [
      { id: `act-${Date.now()}`, timestamp: now(), severity, message },
      ...prev.slice(0, 11),
    ]);
  }, []);

  const syncWithBackend = useCallback(
    async (token: string) => {
      setIsSyncing(true);
      setError(null);

      try {
        const talkgroupsResult = await requestJson<{ talkgroups: ApiTalkgroup[] }>({
          baseUrl: apiBaseUrl,
          path: '/talkgroups',
          token,
        });

        const [devicesResult, usersResult] = await Promise.allSettled([
          requestJson<{ devices: ApiDevice[] }>({ baseUrl: apiBaseUrl, path: '/devices', token }),
          requestJson<{ users: ApiUser[] }>({ baseUrl: apiBaseUrl, path: '/users', token }),
        ]);

        let liveDevices: ApiDevice[] = [];
        let liveUsers: ApiUser[] = [];

        if (devicesResult.status === 'fulfilled') {
          liveDevices = devicesResult.value.devices;
        } else if (devicesResult.reason instanceof ApiError && devicesResult.reason.status === 403) {
          setError('Connected as non-admin. Device controls require admin JWT.');
        } else {
          throw devicesResult.reason;
        }

        if (usersResult.status === 'fulfilled') {
          liveUsers = usersResult.value.users;
        } else if (usersResult.reason instanceof ApiError && usersResult.reason.status === 403) {
          setError('Connected as non-admin. User controls require admin JWT.');
        } else {
          throw usersResult.reason;
        }

        const gpsResponses = await Promise.allSettled(
          liveDevices.map(async (device) => {
            const payload = await requestJson<{ gps: ApiGps }>({
              baseUrl: apiBaseUrl,
              path: `/devices/${device.id}/gps`,
              token,
            });
            return [device.id, payload.gps] as const;
          }),
        );

        const gpsByDevice: Record<string, ApiGps | null> = {};
        liveDevices.forEach((device) => {
          gpsByDevice[device.id] = null;
        });
        gpsResponses.forEach((result) => {
          if (result.status === 'fulfilled') {
            const [deviceId, gps] = result.value;
            gpsByDevice[deviceId] = gps;
          }
        });

        const mappedChannels = mapApiChannels(talkgroupsResult.talkgroups, channels);
        setChannels(mappedChannels);

        const mappedDevices = mapApiDevices(liveDevices, gpsByDevice);
        setDevices(mappedDevices);

        const mappedUsers = mapApiUsers(liveUsers, mappedDevices, users);
        setUsers(mappedUsers);

        const nextRouters = buildRouters(mappedDevices, mappedChannels);
        setRouters(nextRouters);
        setSelectedRouterId((current) =>
          nextRouters.some((router) => router.id === current) ? current : (nextRouters[0]?.id ?? ''),
        );

        setMode('live');
        setLastSyncedAt(new Date().toISOString());
        appendActivity('info', 'Portal synchronized with backend REST API.');
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : 'Backend sync failed.';
        setError(message);
        appendActivity('critical', `Backend sync failed: ${message}`);
      } finally {
        setIsSyncing(false);
      }
    },
    [apiBaseUrl, appendActivity, channels, users],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      setError(null);

      try {
        const response = await requestJson<{ jwt: string }>({
          baseUrl: apiBaseUrl,
          path: '/auth/login',
          method: 'POST',
          body: { username, password },
        });

        const role = decodeJwtRole(response.jwt);
        setAuthToken(response.jwt);
        setAuthUsername(username);
        setAuthRole(role);
        setMode('live');
        appendActivity('info', `Authenticated as ${username}.`);
        await syncWithBackend(response.jwt);
        return true;
      } catch (loginError) {
        const message = loginError instanceof Error ? loginError.message : 'Login failed.';
        setError(message);
        appendActivity('critical', `Login failed for ${username}: ${message}`);
        return false;
      }
    },
    [apiBaseUrl, appendActivity, syncWithBackend],
  );

  const logout = useCallback(() => {
    setAuthToken('');
    setAuthUsername('');
    setAuthRole(null);
    setMode('mock');
    setLastSyncedAt(null);
    setError(null);
    setRouters(clone(routerSeed));
    setDevices(clone(deviceSeed));
    setChannels(clone(channelSeed));
    setUsers(clone(userSeed));
    setSelectedRouterId(routerSeed[0]?.id ?? '');
    appendActivity('warning', 'Backend session closed. Using mock data mode.');
  }, [appendActivity]);

  const refreshData = useCallback(async () => {
    if (!authToken) {
      setError('Login required before backend sync.');
      return;
    }
    await syncWithBackend(authToken);
  }, [authToken, syncWithBackend]);

  const createChannel = useCallback(
    async (name: string, encrypted: boolean) => {
      if (mode === 'live' && authToken) {
        try {
          await requestJson<{ talkgroup: ApiTalkgroup }>({
            baseUrl: apiBaseUrl,
            path: '/talkgroups',
            method: 'POST',
            token: authToken,
            body: { name },
          });
          appendActivity('info', `Talkgroup ${name} created.`);
          await refreshData();
        } catch (createError) {
          const message = createError instanceof Error ? createError.message : 'Failed creating talkgroup.';
          setError(message);
          appendActivity('critical', `Channel creation failed: ${message}`);
        }
        return;
      }

      const channelId = `ch-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
      setChannels((prev) => [
        {
          id: channelId,
          name,
          activeTransmission: false,
          transmittingUserId: null,
          assignedRouterIds: [],
          encrypted,
          locked: false,
          muted: false,
          rotationCounter: 0,
        },
        ...prev,
      ]);
      appendActivity('info', `Channel ${name} created in mock mode.`);
    },
    [apiBaseUrl, appendActivity, authToken, mode, refreshData],
  );

  const deleteChannel = useCallback(
    async (channelId: string) => {
      if (mode === 'live' && authToken) {
        try {
          await requestJson<{ ok: boolean }>({
            baseUrl: apiBaseUrl,
            path: `/talkgroups/${channelId}`,
            method: 'DELETE',
            token: authToken,
          });
          appendActivity('warning', `Channel ${channelId} removed.`);
          await refreshData();
          return;
        } catch (deleteError) {
          const message = deleteError instanceof Error ? deleteError.message : 'Failed deleting channel.';
          setError(message);
          appendActivity('critical', `Channel delete failed: ${message}`);
          return;
        }
      }

      setChannels((prev) => prev.filter((channel) => channel.id !== channelId));
      appendActivity('warning', `Channel ${channelId} removed in mock mode.`);
    },
    [apiBaseUrl, appendActivity, authToken, mode, refreshData],
  );

  const rotateChannelKey = useCallback(
    async (channelId: string) => {
      if (mode === 'live' && authToken) {
        try {
          const response = await requestJson<{ counter: number }>({
            baseUrl: apiBaseUrl,
            path: '/keys/rotate',
            method: 'POST',
            token: authToken,
            body: { talkgroupId: channelId },
          });
          setChannels((prev) =>
            prev.map((channel) =>
              channel.id === channelId ? { ...channel, rotationCounter: response.counter } : channel,
            ),
          );
          appendActivity('warning', `Key rotation executed for ${channelId}.`);
          return;
        } catch (rotateError) {
          const message = rotateError instanceof Error ? rotateError.message : 'Key rotation failed.';
          setError(message);
          appendActivity('critical', `Key rotation failed: ${message}`);
          return;
        }
      }

      setChannels((prev) =>
        prev.map((channel) =>
          channel.id === channelId
            ? { ...channel, rotationCounter: (channel.rotationCounter ?? 0) + 1 }
            : channel,
        ),
      );
      appendActivity('warning', `Key rotation simulated for ${channelId}.`);
    },
    [apiBaseUrl, appendActivity, authToken, mode],
  );

  const toggleChannelLock = useCallback(
    (channelId: string) => {
      setChannels((prev) =>
        prev.map((channel) =>
          channel.id === channelId ? { ...channel, locked: !channel.locked } : channel,
        ),
      );
      appendActivity('warning', `Channel lock toggled on ${channelId}.`);
    },
    [appendActivity],
  );

  const forceMuteChannel = useCallback(
    (channelId: string) => {
      setChannels((prev) =>
        prev.map((channel) =>
          channel.id === channelId ? { ...channel, muted: !channel.muted } : channel,
        ),
      );
      appendActivity('critical', `Force mute toggled on ${channelId}.`);
    },
    [appendActivity],
  );

  const moveUserToChannel = useCallback(
    (userId: string, channelId: string) => {
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, activeChannelId: channelId } : user)),
      );
      appendActivity('info', `${userId} moved to ${channelId}.`);
    },
    [appendActivity],
  );

  const disableDevice = useCallback(
    async (deviceId: string) => {
      const target = devices.find((device) => device.id === deviceId);
      const nextActive = !(target?.active ?? target?.status === 'online');

      if (mode === 'live' && authToken) {
        try {
          await requestJson<{ device: ApiDevice }>({
            baseUrl: apiBaseUrl,
            path: `/devices/${deviceId}/status`,
            method: 'PATCH',
            token: authToken,
            body: { active: nextActive },
          });
          appendActivity('warning', `Device ${deviceId} set to ${nextActive ? 'active' : 'inactive'}.`);
          await refreshData();
          return;
        } catch (toggleError) {
          const message = toggleError instanceof Error ? toggleError.message : 'Device update failed.';
          setError(message);
          appendActivity('critical', `Device update failed: ${message}`);
          return;
        }
      }

      setDevices((prev) =>
        prev.map((device) =>
          device.id === deviceId
            ? {
                ...device,
                active: nextActive,
                status: nextActive ? 'online' : 'offline',
                signalStrength: nextActive ? 72 : 0,
              }
            : device,
        ),
      );
      appendActivity('warning', `Device ${deviceId} toggled in mock mode.`);
    },
    [apiBaseUrl, appendActivity, authToken, devices, mode, refreshData],
  );

  const rebootDevice = useCallback(
    (deviceId: string) => {
      appendActivity('info', `Remote reboot dispatched to ${deviceId}.`);
    },
    [appendActivity],
  );

  const reassignDeviceTalkgroup = useCallback(
    (deviceId: string, talkgroup: string) => {
      setDevices((prev) =>
        prev.map((device) =>
          device.id === deviceId ? { ...device, assignedTalkgroup: talkgroup } : device,
        ),
      );
      appendActivity('info', `Device ${deviceId} reassigned to ${talkgroup}.`);
    },
    [appendActivity],
  );

  const provisionUser = useCallback(
    (userId: string) => {
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, suspended: false, status: 'online' } : user,
        ),
      );
      appendActivity('info', `Provisioning updated for ${userId}.`);
    },
    [appendActivity],
  );

  const revokeUser = useCallback(
    (userId: string) => {
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, status: 'offline', activeChannelId: null } : user,
        ),
      );
      appendActivity('critical', `Access revoked for ${userId}.`);
    },
    [appendActivity],
  );

  const assignUserDevice = useCallback(
    (userId: string, deviceId: string) => {
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, assignedDeviceId: deviceId } : user)),
      );
      appendActivity('info', `Assigned ${deviceId} to ${userId}.`);
    },
    [appendActivity],
  );

  const suspendUser = useCallback(
    (userId: string) => {
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? { ...user, suspended: !user.suspended, status: user.suspended ? 'online' : 'offline' }
            : user,
        ),
      );
      appendActivity('warning', `Suspension state toggled for ${userId}.`);
    },
    [appendActivity],
  );

  const registerUser = useCallback(
    async ({ username, password, deviceSerial, site }: { username: string; password: string; deviceSerial?: string; site?: string }) => {
      try {
        await requestJson<{ jwt: string; userId: string }>({
          baseUrl: apiBaseUrl,
          path: '/auth/register',
          method: 'POST',
          body: { username, password, deviceSerial, site },
        });
        appendActivity('info', `User ${username} registered.`);
        if (authToken) {
          await refreshData();
        }
        return true;
      } catch (registerError) {
        const message = registerError instanceof Error ? registerError.message : 'User registration failed.';
        setError(message);
        appendActivity('critical', `User registration failed: ${message}`);
        return false;
      }
    },
    [apiBaseUrl, appendActivity, authToken, refreshData],
  );

  const value = useMemo<AppStoreValue>(
    () => ({
      routers,
      devices,
      channels,
      users,
      transmissions,
      keyGroups,
      activities,
      selectedRouterId,
      setSelectedRouterId,
      createChannel,
      deleteChannel,
      toggleChannelLock,
      forceMuteChannel,
      moveUserToChannel,
      rotateChannelKey,
      disableDevice,
      rebootDevice,
      reassignDeviceTalkgroup,
      provisionUser,
      revokeUser,
      assignUserDevice,
      suspendUser,
      registerUser,
      mode,
      apiBaseUrl,
      setApiBaseUrl,
      authToken,
      authUsername,
      authRole,
      isAuthenticated: !!authToken,
      isSyncing,
      lastSyncedAt,
      error,
      login,
      logout,
      refreshData,
      commsReady,
    }),
    [
      routers,
      devices,
      channels,
      users,
      transmissions,
      keyGroups,
      activities,
      selectedRouterId,
      createChannel,
      deleteChannel,
      toggleChannelLock,
      forceMuteChannel,
      moveUserToChannel,
      rotateChannelKey,
      disableDevice,
      rebootDevice,
      reassignDeviceTalkgroup,
      provisionUser,
      revokeUser,
      assignUserDevice,
      suspendUser,
      registerUser,
      mode,
      apiBaseUrl,
      authToken,
      authUsername,
      authRole,
      isSyncing,
      lastSyncedAt,
      error,
      login,
      logout,
      refreshData,
      commsReady,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error('useAppStore must be used within AppStoreProvider');
  }
  return store;
}
