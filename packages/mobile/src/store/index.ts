// Zustand global store — auth token, active talkgroup, signal status
import { create } from 'zustand';
import type { SignalStatus, FloorStatus, GPS } from '@forbiddenlan/comms';

export interface AppState {
  jwt: string | null;
  activeTalkgroup: string;
  talkgroups: string[];
  signalStatus: SignalStatus;
  floorStatus: FloorStatus;
  gps: GPS | null;
  setJwt: (jwt: string) => void;
  setActiveTalkgroup: (id: string) => void;
  setSignalStatus: (s: SignalStatus) => void;
  setFloorStatus: (f: FloorStatus) => void;
  setGPS: (g: GPS) => void;
}

// =====================
// WARNING: DEV MODE ONLY!
// For development/testing, we set a dummy JWT so the app skips login.
// REMOVE THIS BEFORE PRODUCTION!
// =====================
  jwt: "devtoken", // <--- REMOVE BEFORE PRODUCTION
  activeTalkgroup: '',
  talkgroups: [],
  signalStatus: { certusDataBars: 0, cellularSignal: 0, activeLink: 'none', certusDataUsedKB: 0 },
  floorStatus: { holder: null, talkgroup: '', timestamp: 0 },
  gps: null,
  setJwt: (jwt) => set({ jwt }),
  setActiveTalkgroup: (id) => set({ activeTalkgroup: id }),
  setSignalStatus: (signalStatus) => set({ signalStatus }),
  setFloorStatus: (floorStatus) => set({ floorStatus }),
  setGPS: (gps) => set({ gps }),
}));
