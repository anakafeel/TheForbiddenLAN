import { create } from 'zustand';

interface AppState {
  jwt: string | null;
  setJwt: (jwt: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  jwt: null,
  setJwt: (jwt) => set({ jwt }),
}));
