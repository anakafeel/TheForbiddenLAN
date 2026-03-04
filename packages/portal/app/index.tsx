import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StatCard } from '../src/components/StatCard';
import { useAppStore } from '../src/store';
import { sharedStyles, theme } from '../src/theme';

export default function DashboardPage() {
  const { routers, devices, channels, users, transmissions, activities } = useAppStore();

  const onlineUsers = users.filter((user) => user.status === 'online' && !user.suspended).length;

  return (
    <View style={sharedStyles.screen}>
      <Text style={sharedStyles.pageTitle}>Dashboard</Text>

      <View style={styles.statsGrid}>
        <StatCard label="Total Routers" value={routers.length} hint="Network backbone nodes" />
        <StatCard label="Total Devices" value={devices.length} hint="Provisioned endpoint radios" />
        <StatCard label="Active Channels" value={channels.length} hint="Talkgroups in current profile" />
        <StatCard label="Online Users" value={onlineUsers} hint="Authenticated active operators" tone="good" />
        <StatCard
          label="Live Transmissions"
          value={transmissions.length}
          hint="Current push-to-talk sessions"
          tone="warn"
        />
      </View>

      <View style={styles.activityPanel}>
        <Text style={sharedStyles.sectionTitle}>Recent Activity</Text>
        <View style={styles.activityTable}>
          {activities.map((event) => (
            <View key={event.id} style={styles.activityRow}>
              <Text style={styles.activityTime}>{event.timestamp}</Text>
              <Text
                style={[
                  styles.activitySeverity,
                  event.severity === 'critical'
                    ? styles.critical
                    : event.severity === 'warning'
                      ? styles.warning
                      : styles.info,
                ]}
              >
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

const styles = StyleSheet.create({
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
    backgroundColor: theme.colors.bgElevated,
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
    fontSize: 11,
    fontWeight: '700',
  },
  info: {
    color: '#8db9f1',
  },
  warning: {
    color: '#f2c066',
  },
  critical: {
    color: '#ef8392',
  },
  activityMsg: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
  },
});
