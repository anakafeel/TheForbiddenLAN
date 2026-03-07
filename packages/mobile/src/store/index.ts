// Zustand global store — auth token, user info, active talkgroup, signal status
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { SignalStatus, FloorStatus, GPS } from '@forbiddenlan/comms';
import { clearDlsSession } from '../lib/dlsAuth';

const JWT_KEY = 'skytalk_jwt';
const SERVER_URL_KEY = 'skytalk_server_url';

function decodeJwtPayload(jwt: string): any | null {
  try {
    const base64 = jwt.split('.')[1];
    const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isJwtExpired(jwt: string): boolean {
  const payload = decodeJwtPayload(jwt);
  if (!payload?.exp) return false;
  return payload.exp * 1000 < Date.now();
}

export type ConnectionMode = 'satellite' | 'cellular';
export type ThemeMode = 'dark' | 'light';
export type NotificationSeverity = 'warning' | 'info';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  createdAt: number;
  unread: boolean;
  source?: string;
  dedupeKey?: string;
}

export interface NewNotification {
  title: string;
  message: string;
  severity: NotificationSeverity;
  source?: string;
  dedupeKey?: string;
}

interface User {
  sub: string;
  username: string;
  role: string;
}

export interface UserProfile {
  displayName: string;
  callsign: string;
  photoUrl: string;
  unit: string;
  statusMessage: string;
}

export interface AppState {
  hydrating: boolean;
  jwt: string | null;
  user: User | null;
  customServerUrl: string | null;
  profile: UserProfile;
  activeTalkgroup: string;
  talkgroups: string[];
  preferredConnection: ConnectionMode;
  themeMode: ThemeMode;
  soundsEnabled: boolean;
  notifications: AppNotification[];
  signalStatus: SignalStatus;
  floorStatus: FloorStatus;
  gps: GPS | null;
  hydrateAuth: () => Promise<void>;
  setJwt: (jwt: string | null) => void;
  setCustomServerUrl: (url: string | null) => void;
  setUser: (u: User | null) => void;
  setProfile: (profile: Partial<UserProfile>) => void;
  resetProfile: () => void;
  clearAuth: () => void;
  setActiveTalkgroup: (id: string) => void;
  setPreferredConnection: (mode: ConnectionMode) => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
  setSoundsEnabled: (enabled: boolean) => void;
  pushNotification: (item: NewNotification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  setSignalStatus: (s: SignalStatus) => void;
  setFloorStatus: (f: FloorStatus) => void;
  setGPS: (g: GPS) => void;
}

export const useStore = create<AppState>((set) => ({
  hydrating: true,
  jwt: null,
  user: null,
  customServerUrl: null,
  profile: {
    displayName: "",
    callsign: "",
    photoUrl: "",
    unit: "",
    statusMessage: "",
  },
  activeTalkgroup: '',
  talkgroups: [],
  preferredConnection: 'cellular',
  themeMode: 'dark',
  soundsEnabled: true,
  notifications: [],
  signalStatus: { certusDataBars: 0, cellularSignal: 0, activeLink: 'none', certusDataUsedKB: 0 },
  floorStatus: { holder: null, talkgroup: '', timestamp: 0 },
  gps: null,
  hydrateAuth: async () => {
    try {
      const [stored, storedUrl] = await Promise.all([
        SecureStore.getItemAsync(JWT_KEY),
        SecureStore.getItemAsync(SERVER_URL_KEY),
      ]);
      const patch: Partial<AppState> = { hydrating: false, customServerUrl: storedUrl ?? null };
      if (stored && !isJwtExpired(stored)) {
        const payload = decodeJwtPayload(stored);
        const user = payload ? { sub: payload.sub, username: payload.username, role: payload.role } : null;
        Object.assign(patch, { jwt: stored, user });
      } else {
        if (stored) await SecureStore.deleteItemAsync(JWT_KEY);
      }
      set(patch);
    } catch {
      set({ hydrating: false });
    }
  },
  setJwt: (jwt) => {
    if (jwt) SecureStore.setItemAsync(JWT_KEY, jwt).catch(() => {});
    else SecureStore.deleteItemAsync(JWT_KEY).catch(() => {});
    set({ jwt });
  },
  setCustomServerUrl: (url) => {
    if (url) SecureStore.setItemAsync(SERVER_URL_KEY, url).catch(() => {});
    else SecureStore.deleteItemAsync(SERVER_URL_KEY).catch(() => {});
    set({ customServerUrl: url });
  },
  setUser: (user) => set({ user }),
  setProfile: (profile) =>
    set((state) => ({
      profile: { ...state.profile, ...profile },
    })),
  resetProfile: () =>
    set({
      profile: {
        displayName: "",
        callsign: "",
        photoUrl: "",
        unit: "",
        statusMessage: "",
      },
    }),
  clearAuth: () => {
    SecureStore.deleteItemAsync(JWT_KEY).catch(() => {});
    set({
      jwt: null,
      user: null,
      notifications: [],
      profile: {
        displayName: "",
        callsign: "",
        photoUrl: "",
        unit: "",
        statusMessage: "",
      },
    });
  },
  setActiveTalkgroup: (id) => set({ activeTalkgroup: id }),
  setPreferredConnection: (preferredConnection) => set({ preferredConnection }),
  setThemeMode: (themeMode) => set({ themeMode }),
  toggleThemeMode: () => set((state) => ({ themeMode: state.themeMode === 'dark' ? 'light' : 'dark' })),
  setSoundsEnabled: (soundsEnabled) => set({ soundsEnabled }),
  pushNotification: (item) =>
    set((state) => {
      const now = Date.now();
      if (item.dedupeKey) {
        const existing = state.notifications.find((n) => n.dedupeKey === item.dedupeKey);
        if (
          existing &&
          existing.title === item.title &&
          existing.message === item.message &&
          now - existing.createdAt < 45_000
        ) {
          return state;
        }
      }

      const notification: AppNotification = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        title: item.title,
        message: item.message,
        severity: item.severity,
        createdAt: now,
        unread: true,
        source: item.source,
        dedupeKey: item.dedupeKey,
      };

      return {
        notifications: [notification, ...state.notifications].slice(0, 100),
      };
    }),
  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, unread: false } : n,
      ),
    })),
  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, unread: false })),
    })),
  clearNotifications: () => set({ notifications: [] }),
  setSignalStatus: (signalStatus) => set({ signalStatus }),
  setFloorStatus: (floorStatus) => set({ floorStatus }),
  setGPS: (gps) => set({ gps }),
}));
