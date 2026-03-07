// Zustand global store — auth token, user info, active talkgroup, signal status
import { create } from 'zustand';
import type { SignalStatus, FloorStatus, GPS } from '@forbiddenlan/comms';
import { clearDlsSession } from '../lib/dlsAuth';

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
  jwt: string | null;
  user: User | null;
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
  setJwt: (jwt: string | null) => void;
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
  jwt: null,
  user: null,
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
  setJwt: (jwt) => set({ jwt }),
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
  clearAuth: () =>
    set(() => {
      clearDlsSession();
      return {
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
      };
    }),
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
