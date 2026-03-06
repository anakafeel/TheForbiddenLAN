// Zustand global store — auth token, user info, active talkgroup, signal status
import { create } from 'zustand';
import type { SignalStatus, FloorStatus, GPS } from '@forbiddenlan/comms';

export type ConnectionMode = 'satellite' | 'cellular';
export type ThemeMode = 'dark' | 'light';

interface User {
  sub: string;
  username: string;
  role: string;
}

export interface AppState {
  jwt: string | null;
  user: User | null;
  activeTalkgroup: string;
  talkgroups: string[];
  preferredConnection: ConnectionMode;
  themeMode: ThemeMode;
  signalStatus: SignalStatus;
  floorStatus: FloorStatus;
  gps: GPS | null;
  // Increments each time the local SQLite op log changes — subscribers
  // re-query the DB when this bumps (sync_complete and live OP applied).
  syncVersion: number;
  setJwt: (jwt: string) => void;
  setUser: (u: User | null) => void;
  clearAuth: () => void;
  setActiveTalkgroup: (id: string) => void;
  setPreferredConnection: (mode: ConnectionMode) => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
  setSignalStatus: (s: SignalStatus) => void;
  setFloorStatus: (f: FloorStatus) => void;
  setGPS: (g: GPS) => void;
  bumpSyncVersion: () => void;
}

export const useStore = create<AppState>((set) => ({
  jwt: null,
  user: null,
  activeTalkgroup: '',
  talkgroups: [],
  preferredConnection: 'satellite',
  themeMode: 'dark',
  signalStatus: { certusDataBars: 0, cellularSignal: 0, activeLink: 'none', certusDataUsedKB: 0 },
  floorStatus: { holder: null, talkgroup: '', timestamp: 0 },
  gps: null,
  syncVersion: 0,
  setJwt: (jwt) => set({ jwt }),
  setUser: (user) => set({ user }),
  clearAuth: () => set({ jwt: null, user: null }),
  setActiveTalkgroup: (id) => set({ activeTalkgroup: id }),
  setPreferredConnection: (preferredConnection) => set({ preferredConnection }),
  setThemeMode: (themeMode) => set({ themeMode }),
  toggleThemeMode: () => set((state) => ({ themeMode: state.themeMode === 'dark' ? 'light' : 'dark' })),
  setSignalStatus: (signalStatus) => set({ signalStatus }),
  setFloorStatus: (floorStatus) => set({ floorStatus }),
  setGPS: (gps) => set({ gps }),
  bumpSyncVersion: () => set((state) => ({ syncVersion: state.syncVersion + 1 })),
}));
