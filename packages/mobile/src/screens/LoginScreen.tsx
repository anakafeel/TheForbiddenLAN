// Login screen — username/password → POST /auth/login → decode JWT → set user in store.
// Navigation is handled by App.jsx via conditional rendering (no navigate() call).
// Admin users skip comms connection; regular users connect to the relay.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { CONFIG } from '../config';
import { colors, spacing, radius, typography } from '../theme';

/** Decode the payload section of a JWT (no verification — server already signed it).
 *  Uses a pure-JS base64 decode so it works on Hermes, JSC, and web. */
function decodeJwtPayload(jwt: string) {
  const base64 = jwt.split('.')[1];
  // base64url → standard base64
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
  // Hermes may not have atob, so use a polyfill approach
  const decoded = typeof atob === 'function'
    ? atob(padded)
    : Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setJwt = useStore(s => s.setJwt);
  const setUser = useStore(s => s.setUser);

  const login = async () => {
    if (!username || !password) { setError('Enter username and password'); return; }
    setError('');
    setLoading(true);
    try {
      // 30s timeout — required for SATCOM links with 800ms+ latency
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(`${CONFIG.API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Login failed'); setLoading(false); return; }

      const payload = decodeJwtPayload(data.jwt);

      // Use getState() directly — avoids stale closure / cache issues with selectors
      const store = useStore.getState();
      store.setJwt(data.jwt);
      store.setUser({ sub: payload.sub, username: payload.username, role: payload.role });

      // Only connect to the relay for regular users (PTT). Admins don't need comms.
      // Lazy import to avoid pulling native audio modules on web.
      if (payload.role !== 'admin') {
        const { connectComms } = require('../utils/socket');
        await connectComms(data.jwt);
      }
      // App.jsx re-renders automatically when user is set in the store — no navigate() needed.
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('Server did not respond in 30s. If on SATCOM, wait for satellite lock and try again.');
      } else {
        setError(`Cannot reach server: ${e.message}`);
      }
      console.error('[LoginScreen] login error:', e);
      setError(`Cannot reach server: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };


  return (
    <View style={styles.container}>
      <View style={styles.loginCard}>
        <Text style={styles.title}>SkyTalk</Text>
        <Text style={styles.subtitle}>Push-to-Talk over Satellite</Text>

        <TextInput
          placeholder="Username"
          placeholderTextColor={colors.text.muted}
          value={username}
          onChangeText={setUsername}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor={colors.text.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable onPress={login} style={styles.button} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Connect</Text>
          }
        </Pressable>

        <Text style={styles.serverInfo}>{CONFIG.API_URL}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background.primary,
  },
  loginCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.xxl,
    alignItems: 'center',
  },
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold as any,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.wide,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.size.md,
    color: colors.text.muted,
    marginBottom: spacing.xxl,
  },
  input: {
    width: '100%',
    padding: spacing.md,
    fontSize: typography.size.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.status.danger,
    marginBottom: spacing.sm,
    fontSize: typography.size.sm,
  },
  button: {
    width: '100%',
    paddingVertical: spacing.md,
    backgroundColor: colors.accent.primary,
    borderRadius: radius.sm,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.text.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold as any,
  },
  serverInfo: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    marginTop: spacing.lg,
  },
});
