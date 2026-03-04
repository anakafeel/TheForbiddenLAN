import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StatCard } from '../src/components/StatCard';
import { useAppStore } from '../src/store';
import { sharedStyles, theme } from '../src/theme';

export default function DashboardPage() {
  const {
    routers,
    devices,
    channels,
    users,
    transmissions,
    activities,
    mode,
    authUsername,
    isAuthenticated,
    lastSyncedAt,
    error,
  } = useAppStore();

  const onlineUsers = users.filter((user) => user.status === 'online' && !user.suspended).length;
  const activeDevices = devices.filter((device) => device.status === 'online').length;

  return (
    <View style={sharedStyles.screen}>
      <Text style={sharedStyles.pageTitle}>Dashboard</Text>

      <View style={styles.ribbon}>
        <Text style={styles.ribbonText}>Mode: {mode.toUpperCase()}</Text>
        <Text style={styles.ribbonText}>Operator: {isAuthenticated ? authUsername : 'Guest'}</Text>
        <Text style={styles.ribbonText}>
          Last Sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Never'}
        </Text>
        {error ? <Text style={styles.errorText}>Error: {error}</Text> : null}
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Total Routers" value={routers.length} hint="Site core nodes" />
        <StatCard label="Total Devices" value={devices.length} hint="Provisioned endpoints" />
        <StatCard label="Active Devices" value={activeDevices} hint="Current active radios" tone="good" />
        <StatCard label="Talkgroups" value={channels.length} hint="Available network channels" />
        <StatCard label="Online Users" value={onlineUsers} hint="Authenticated active operators" tone="good" />
        <StatCard label="Live Transmissions" value={transmissions.length} hint="Current PTT sessions" tone="warn" />
      </View>

      <View style={styles.activityPanel}>
        <Text style={sharedStyles.sectionTitle}>Recent Activity</Text>
        <View style={styles.activityTable}>
          {activities.map((event) => (
            <View key={event.id} style={styles.activityRow}>
              <Text style={styles.activityTime}>{event.timestamp}</Text>
              <Text style={{ ...styles.activitySeverity, color: severityColor(event.severity) }}>
                {event.severity.toUpperCase()}
              </Text>
              <Text style={styles.activityMsg}>{event.message}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function severityColor(severity: 'info' | 'warning' | 'critical') {
  if (severity === 'critical') {
    return theme.colors.danger;
  }
  if (severity === 'warning') {
    return theme.colors.warning;
  }
  return theme.colors.info;
}

const styles = StyleSheet.create({
  ribbon: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.background.secondary,
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  ribbonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '600',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  activityPanel: {
    flex: 1,
    ...sharedStyles.card,
    padding: theme.spacing.md,
  },
  activityTable: {
    gap: 6,
  },
  activityRow: {
    minHeight: 34,
    borderRadius: 6,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  activityTime: {
    width: 72,
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  activitySeverity: {
    width: 74,
    fontSize: theme.typography.small,
    fontWeight: '700',
  },
  activityMsg: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
  },
});
