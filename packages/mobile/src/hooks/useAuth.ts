// Authentication API hooks — login, register, changePassword
import { useState, useCallback } from 'react';
import { CONFIG } from '../config';
import { useStore, type AppState } from '../store';
import { clearDlsSession, setDlsCredentials } from '../lib/dlsAuth';

interface AuthResponse {
  jwt?: string;
  userId?: string;
  error?: string;
}

interface AuthState {
  loading: boolean;
  error: string | null;
}

/**
 * useLogin — POST /auth/login
 * Returns { jwt } on success
 */
export function useLogin() {
  const [state, setState] = useState<AuthState>({ loading: false, error: null });
  const setJwt = useStore((s: AppState) => s.setJwt);

  const login = useCallback(async (username: string, password: string): Promise<AuthResponse> => {
    setState({ loading: true, error: null });

    try {
      const res = await fetch(`${CONFIG.API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ loading: false, error: data.error ?? 'Login failed' });
        return { error: data.error ?? 'Login failed' };
      }

      setDlsCredentials(username, password);
      setJwt(data.jwt);
      setState({ loading: false, error: null });
      return { jwt: data.jwt };
    } catch (err) {
      const errorMsg = 'Cannot reach server';
      setState({ loading: false, error: errorMsg });
      return { error: errorMsg };
    }
  }, [setJwt]);

  return { login, ...state };
}

/**
 * useRegister — POST /auth/register
 * Creates a new user account and returns { jwt, userId }
 */
export function useRegister() {
  const [state, setState] = useState<AuthState>({ loading: false, error: null });
  const setJwt = useStore((s: AppState) => s.setJwt);

  const register = useCallback(async (
    username: string,
    password: string,
    deviceSerial?: string,
    site?: string
  ): Promise<AuthResponse> => {
    setState({ loading: true, error: null });

    try {
      const res = await fetch(`${CONFIG.API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, deviceSerial, site }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ loading: false, error: data.error ?? 'Registration failed' });
        return { error: data.error ?? 'Registration failed' };
      }

      setJwt(data.jwt);
      setState({ loading: false, error: null });
      return { jwt: data.jwt, userId: data.userId };
    } catch (err) {
      const errorMsg = 'Cannot reach server';
      setState({ loading: false, error: errorMsg });
      return { error: errorMsg };
    }
  }, [setJwt]);

  return { register, ...state };
}

/**
 * useChangePassword — POST /auth/changepassword
 * Changes password for authenticated user
 */
export function useChangePassword() {
  const [state, setState] = useState<AuthState>({ loading: false, error: null });
  const jwt = useStore((s: AppState) => s.jwt);

  const changePassword = useCallback(async (
    oldPassword: string,
    newPassword: string
  ): Promise<{ ok?: boolean; error?: string }> => {
    if (!jwt) {
      return { error: 'Not authenticated' };
    }

    setState({ loading: true, error: null });

    try {
      const res = await fetch(`${CONFIG.API_URL}/auth/changepassword`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({ oldpassword: oldPassword, newpassword: newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ loading: false, error: data.error ?? 'Password change failed' });
        return { error: data.error ?? 'Password change failed' };
      }

      setState({ loading: false, error: null });
      return { ok: true };
    } catch (err) {
      const errorMsg = 'Cannot reach server';
      setState({ loading: false, error: errorMsg });
      return { error: errorMsg };
    }
  }, [jwt]);

  return { changePassword, ...state };
}

/**
 * useLogout — clears JWT from store
 */
export function useLogout() {
  const setJwt = useStore((s: AppState) => s.setJwt);

  const logout = useCallback(() => {
    // Clear the JWT (set to empty string or null depending on store implementation)
    clearDlsSession();
    setJwt('');
  }, [setJwt]);

  return { logout };
}
