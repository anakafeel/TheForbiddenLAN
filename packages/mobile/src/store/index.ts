// Zustand global store — auth token, user info, active talkgroup, signal status
import { create } from 'zustand';
import type { SignalStatus, FloorStatus, GPS } from '@forbiddenlan/comms';

interface User {
  sub: string;
  username: string;
  role: string;
}

interface AppState {
  jwt: string | null;
  user: User | null;
  activeTalkgroup: string;
  talkgroups: string[];
  signalStatus: SignalStatus;
  floorStatus: FloorStatus;
  gps: GPS | null;
  setJwt: (jwt: string) => void;
  setUser: (u: User | null) => void;
  clearAuth: () => void;
  setActiveTalkgroup: (id: string) => void;
  setSignalStatus: (s: SignalStatus) => void;
  setFloorStatus: (f: FloorStatus) => void;
  setGPS: (g: GPS) => void;
}

export const useStore = create<AppState>((set) => ({
  jwt: null,
  user: null,
  activeTalkgroup: '',
  talkgroups: [],
  signalStatus: { certusDataBars: 0, cellularSignal: 0, activeLink: 'none', certusDataUsedKB: 0 },
  floorStatus: { holder: null, talkgroup: '', timestamp: 0 },
  gps: null,
  setJwt: (jwt) => set({ jwt }),
  setUser: (user) => set({ user }),
  clearAuth: () => set({ jwt: null, user: null }),
  setActiveTalkgroup: (id) => set({ activeTalkgroup: id }),
  setSignalStatus: (signalStatus) => set({ signalStatus }),
  setFloorStatus: (floorStatus) => set({ floorStatus }),
  setGPS: (gps) => set({ gps }),
}));
