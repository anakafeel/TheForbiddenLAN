// Login screen — username/password → POST /auth/login → decode JWT → set user in store.
// Navigation is handled by App.jsx via conditional rendering (no navigate() call).
// Admin users skip comms connection; regular users connect to the relay.
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useStore } from '../store';
import { CONFIG } from '../config';
import { useAppTheme } from '../theme';

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
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [diagnosticText, setDiagnosticText] = useState('');

  const [isDiagnosing, setIsDiagnosing] = useState(false);

  const runDiagnostics = async () => {
    if (isDiagnosing) {
      setIsDiagnosing(false);
      setDiagnosticText(prev => prev + '\n🛑 Diagnostics stopped.');
      return;
    }
    setIsDiagnosing(true);
    setDiagnosticText('Running SATCOM diagnostics...\n');
    let log = 'Running SATCOM diagnostics...\n';
    const addLog = (msg: string) => {
      log += msg + '\n';
      setDiagnosticText(log);
    };

    addLog('Note: High packet loss means TCP handshakes (fetch) may take 20s+ to establish.\n');

    // 1. Internet Check
    try {
      const start = Date.now();
      addLog('Pinging Google 204 (Reachability)...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      const url = `https://clients3.google.com/generate_204?t=${start}`;
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeoutId);
      addLog(`✅ Internet reached in ${Date.now() - start}ms (Status: ${res.status})`);
    } catch (e: any) {
        if (e.name === 'AbortError') addLog(`❌ Internet timeout (90s). TCP failed.`);
      else addLog(`❌ Internet error: ${e.message}`);
    }

    // 2. API Check Continuous
    addLog(`\nPinging API (${CONFIG.API_URL})... waiting for connection...`);
    let connected = false;
    while (!connected && isDiagnosing) {
      try {
        const start = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // Longer timeout for SATCOM
        const url = `${CONFIG.API_URL}/ping?t=${start}`;
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeoutId);
        
        if (res.ok) {
           connected = true;
           addLog(`✅ Connected to API in ${Date.now() - start}ms (Status: ${res.status})`);
        } else {
           addLog(`⚠️ API responded with ${res.status}, retrying...`);
           await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e: any) {
         if (e.name === 'AbortError') addLog(`⚠️ API timeout (15s), retrying...`);
         else addLog(`⚠️ API error: ${e.message}, retrying...`);
         await new Promise(r => setTimeout(r, 2000));
      }
    }

    setIsDiagnosing(false);
  };

  const login = async () => {
    if (!username || !password) { setError('Enter username and password'); return; }
    setError('');
    setLoading(true);
    try {
      // 90s timeout — SATCOM links have 800ms+ latency with significant packet loss
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const res = await fetch(`${CONFIG.API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Login failed'); setLoading(false); return; }

      // DLS-140 credentials come from EXPO_PUBLIC_DLS140_USERNAME/PASSWORD env vars.
      // SkyTalk relay and DLS-140 router have separate auth systems.

      const payload = decodeJwtPayload(data.jwt);

      // Use getState() directly — avoids stale closure / cache issues with selectors
      const store = useStore.getState();
      store.setJwt(data.jwt);
      store.setUser({ sub: payload.sub, username: payload.username, role: payload.role });
      store.setProfile({
        displayName: payload.username ?? "",
        callsign: (payload.username ?? "")
          .replace(/[^a-z0-9]/gi, "")
          .toUpperCase()
          .slice(0, 8),
        photoUrl: "",
        unit: "",
        statusMessage: "",
      });

      // Only connect to the relay for regular users (PTT). Admins don't need comms.
      // Lazy import to avoid pulling native audio modules on web.
      if (payload.role !== 'admin') {
        const { connectComms } = require('../utils/socket');
        await connectComms(data.jwt);
      }
      // App.jsx re-renders automatically when user is set in the store — no navigate() needed.
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('Server did not respond in 90s. If on SATCOM, bad packet loss disrupts TCP handshakes. Ensure clear sky path and retry.');
      } else {
        setError(`Cannot reach server: ${e.message}`);
      }
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
            ? <ActivityIndicator color={colors.text.primary} />
            : <Text style={styles.buttonText}>Connect</Text>
          }
        </Pressable>

        <Pressable onPress={runDiagnostics} style={[styles.diagButton, isDiagnosing && { opacity: 0.6 }]} disabled={loading}>
          <Text style={styles.diagButtonText}>{isDiagnosing ? 'Stop Diagnostics' : 'Run Connection Diagnostics'}</Text>
        </Pressable>

        {!!diagnosticText && (
          <View style={styles.diagBox}>
            <Text style={styles.diagText}>
              {diagnosticText}
            </Text>
          </View>
        )}

        <Text style={styles.serverInfo}>{CONFIG.API_URL}</Text>
      </View>
    </View>
  );
}

function createStyles(colors: any, spacing: any, radius: any, typography: any) {
  return StyleSheet.create({
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
  diagButton: {
    width: '100%',
    paddingVertical: spacing.md,
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    marginTop: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  diagButtonText: {
    color: colors.text.primary,
    fontSize: typography.size.md,
  },
  diagBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  diagText: {
    color: colors.status.active,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: typography.size.xs,
  },
  serverInfo: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    marginTop: spacing.lg,
  },
  });
}
