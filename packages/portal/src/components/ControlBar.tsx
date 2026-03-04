import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppStore } from '../store';
import { theme } from '../theme';

export function ControlBar() {
  const {
    mode,
    apiBaseUrl,
    setApiBaseUrl,
    authUsername,
    authRole,
    isAuthenticated,
    isSyncing,
    lastSyncedAt,
    error,
    login,
    logout,
    refreshData,
  } = useAppStore();

  const [username, setUsername] = useState(authUsername || 'admin');
  const [password, setPassword] = useState('admin');
  const [draftApiUrl, setDraftApiUrl] = useState(apiBaseUrl);

  return (
    <View style={styles.root}>
      <View style={styles.leftSection}>
        <Text style={styles.title}>Admin Control Plane</Text>
        <View style={styles.pills}>
          <StatusPill label={mode === 'live' ? 'LIVE BACKEND' : 'MOCK MODE'} tone={mode === 'live' ? 'info' : 'warn'} />
          <StatusPill
            label={isAuthenticated ? `AUTH ${authRole ?? 'UNKNOWN'}` : 'AUTH OFFLINE'}
            tone={isAuthenticated ? 'good' : 'danger'}
          />
          <StatusPill label={isSyncing ? 'SYNCING' : 'IDLE'} tone={isSyncing ? 'info' : 'good'} />
        </View>
      </View>

      <View style={styles.centerSection}>
        <TextInput
          value={draftApiUrl}
          onChangeText={setDraftApiUrl}
          onBlur={() => setApiBaseUrl(draftApiUrl.trim() || apiBaseUrl)}
          style={styles.inputWide}
          placeholder="http://localhost:3000"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          value={username}
          onChangeText={setUsername}
          style={styles.input}
          placeholder="username"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          placeholder="password"
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.rightSection}>
        <Pressable
          onPress={() => {
            if (isAuthenticated) {
              void refreshData();
              return;
            }
            void login(username.trim(), password);
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.buttonText}>{isAuthenticated ? 'Sync' : 'Login'}</Text>
        </Pressable>

        <Pressable onPress={logout} style={styles.secondaryButton}>
          <Text style={styles.buttonText}>Reset</Text>
        </Pressable>

        <Text style={styles.syncText}>{lastSyncedAt ? `Last sync ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Not synced'}</Text>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function StatusPill({ label, tone }: { label: string; tone: 'good' | 'warn' | 'danger' | 'info' }) {
  const backgroundColor =
    tone === 'good'
      ? theme.colors.status.activeGlow
      : tone === 'warn'
        ? theme.colors.status.warningGlow
        : tone === 'danger'
          ? theme.colors.status.dangerGlow
          : theme.colors.status.infoGlow;

  const textColor =
    tone === 'good'
      ? theme.colors.success
      : tone === 'warn'
        ? theme.colors.warning
        : tone === 'danger'
          ? theme.colors.danger
          : theme.colors.info;

  const pillStyle = { ...styles.pill, backgroundColor };
  const pillTextStyle = { ...styles.pillText, color: textColor };

  return (
    <View style={pillStyle}>
      <Text style={pillTextStyle}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: theme.layout.topBarHeight,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background.card,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  leftSection: {
    minWidth: 220,
    gap: theme.spacing.xs,
  },
  centerSection: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginLeft: 'auto',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pills: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  pill: {
    minHeight: 22,
    borderRadius: 999,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillText: {
    fontSize: theme.typography.small,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  input: {
    minWidth: 100,
    height: 32,
    backgroundColor: theme.colors.background.tertiary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.sm,
    fontSize: theme.typography.caption,
  },
  inputWide: {
    minWidth: 240,
    height: 32,
    backgroundColor: theme.colors.background.tertiary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.sm,
    fontSize: theme.typography.caption,
  },
  primaryButton: {
    minHeight: 32,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  secondaryButton: {
    minHeight: 32,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.background.tertiary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  buttonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  syncText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    marginLeft: theme.spacing.xs,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    width: '100%',
    marginTop: 2,
  },
});
