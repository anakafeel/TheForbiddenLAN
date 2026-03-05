import React, { createContext, useContext, useMemo, useCallback } from "react";
import { useStore } from "../store";

type AuthContextValue = {
  jwt: string | null;
  isAuthed: boolean;
  signIn: (jwt: string) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const jwt = useStore((s) => s.jwt);
  const setJwt = useStore((s) => s.setJwt);

  const signIn = useCallback(
    (token: string) => {
      setJwt(token);
    },
    [setJwt]
  );

  const signOut = useCallback(() => {
    setJwt(null);
  }, [setJwt]);

  const value = useMemo<AuthContextValue>(
    () => ({
      jwt,
      isAuthed: !!jwt,
      signIn,
      signOut,
    }),
    [jwt, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}