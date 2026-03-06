import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, Switch } from 'react-native';
import { ClipboardList as ClipboardClock } from 'lucide-react';
import {
  getAdminMonitoringSnapshot,
  getAdminErrorMessage,
  type AdminMonitoringSnapshot,
  type AdminMonitoringEvent,
} from '../../lib/adminApi';
import { useAppTheme } from '../../theme';

const POLL_INTERVAL_MS = 5000;

function formatUptime(seconds: number) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3600)
    .toString()
    .padStart(2, '0');
  const mins = Math.floor((safe % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(safe % 60)
    .toString()
    .padStart(2, '0');
  if (days > 0) return `${days}d ${hours}:${mins}:${secs}`;
  return `${hours}:${mins}:${secs}`;
}

function ageSeconds(isoTimestamp: string): number {
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000));
}

function levelLabel(level: AdminMonitoringEvent['level']) {
  if (level === 'warn') return 'WARN';
  if (level === 'error') return 'ERROR';
  return 'INFO';
}

export function AdminMonitoring() {
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );

  const [snapshot, setSnapshot] = useState<AdminMonitoringSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);

    try {
      const next = await getAdminMonitoringSnapshot(200);
      setSnapshot(next);
      setError('');
    } catch (e) {
      setError(getAdminErrorMessage(e, 'Failed to load monitoring snapshot'));
    } finally {
      if (initial) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => {
      load(false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const checks = useMemo(() => {
    if (!snapshot) return [];
    const freshness = ageSeconds(snapshot.generated_at);
    const metrics = snapshot.metrics;
    return [
      {
        key: 'freshness',
        label: 'Snapshot Freshness',
        status: freshness <= 15 ? 'HEALTHY' : 'STALE',
        detail: `${freshness}s old`,
        danger: freshness > 15,
      },
      {
        key: 'relay',
        label: 'Background Relay',
        status: metrics.connectedSockets > 0 ? 'ACTIVE' : 'IDLE',
        detail: `${metrics.connectedSockets} sockets online`,
        danger: false,
      },
      {
        key: 'floor',
        label: 'Floor Control',
        status: metrics.floorHolders > 0 ? 'IN USE' : 'READY',
        detail: `${metrics.floorHolders} floor lock${metrics.floorHolders === 1 ? '' : 's'}`,
        danger: false,
      },
    ];
  }, [snapshot]);

  if (loading && !snapshot) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.status.info} />
      </View>
    );
  }

  const metrics = snapshot?.metrics;
  const logs = snapshot?.logs ?? [];
  const rooms = metrics?.rooms ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.headerRow}>
        <View style={styles.headerTitleRow}>
          <ClipboardClock size={18} color={colors.status.info} />
          <Text style={styles.pageTitle}>Logging & Background Monitoring</Text>
        </View>
        <View style={styles.refreshTools}>
          <Text style={styles.autoLabel}>Auto</Text>
          <Switch
            value={autoRefresh}
            onValueChange={setAutoRefresh}
            trackColor={{ false: colors.border.medium, true: colors.accent.primaryLight }}
            thumbColor={colors.text.primary}
            style={styles.autoSwitch}
          />
          <Pressable onPress={() => load(false)} style={styles.refreshBtn}>
            <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
          </Pressable>
        </View>
      </View>

      {snapshot && (
        <Text style={styles.helperText}>
          Uptime {formatUptime(snapshot.uptime_seconds)} | Last snapshot {new Date(snapshot.generated_at).toLocaleTimeString()}
        </Text>
      )}

      <View style={styles.metricsGrid}>
        <MetricCard label="Sockets" value={metrics?.connectedSockets ?? 0} styles={styles} />
        <MetricCard label="Talk Groups" value={metrics?.activeTalkgroups ?? 0} styles={styles} />
        <MetricCard label="UDP Clients" value={metrics?.udpClients ?? 0} styles={styles} />
        <MetricCard label="Audio Relays" value={metrics?.udpAudioRelays ?? 0} styles={styles} />
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Background Checks</Text>
        {checks.map((check) => (
          <View key={check.key} style={styles.row}>
            <View style={[styles.statusDot, { backgroundColor: check.danger ? colors.status.danger : colors.status.active }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{check.label}</Text>
              <Text style={styles.rowSub}>{check.detail}</Text>
            </View>
            <Text style={[styles.badgeText, { color: check.danger ? colors.status.danger : colors.status.active }]}>
              {check.status}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Active Talkgroup Rooms</Text>
        {rooms.length === 0 ? (
          <Text style={styles.empty}>No active talkgroup rooms</Text>
        ) : (
          rooms.map((room, index) => (
            <View
              key={room.talkgroup}
              style={[styles.row, index === rooms.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{room.talkgroup}</Text>
                <Text style={styles.rowSub}>{room.members} connected member{room.members === 1 ? '' : 's'}</Text>
              </View>
              <Text style={styles.rowSub}>
                {room.floorHolder ? `Floor: ${room.floorHolder}` : 'Floor: idle'}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Recent Logs</Text>
        {logs.length === 0 ? (
          <Text style={styles.empty}>No logs recorded yet</Text>
        ) : (
          logs.map((event, index) => {
            const levelColor =
              event.level === 'error'
                ? colors.status.danger
                : event.level === 'warn'
                  ? colors.status.warning
                  : colors.status.info;

            return (
              <View
                key={event.id}
                style={[styles.logRow, index === logs.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.logTopRow}>
                  <Text style={[styles.logLevel, { color: levelColor }]}>{levelLabel(event.level)}</Text>
                  <Text style={styles.logTime}>{new Date(event.timestamp).toLocaleTimeString()}</Text>
                </View>
                <Text style={styles.logMessage}>{event.message}</Text>
                <Text style={styles.logMeta}>{event.category.toUpperCase()}</Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function MetricCard({ label, value, styles }: { label: string; value: number; styles: any }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function createStyles(colors: any, spacing: any, radius: any, typography: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background.primary },
    scrollContent: { padding: spacing.xl, gap: spacing.lg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary },
    error: { color: colors.status.danger, textAlign: 'center', fontSize: typography.size.sm },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.md,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flexShrink: 1,
    },
    pageTitle: {
      color: colors.text.primary,
      fontSize: typography.size.lg,
      fontWeight: typography.weight.bold,
    },
    refreshTools: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    autoLabel: {
      color: colors.text.muted,
      fontSize: typography.size.sm,
      fontWeight: typography.weight.medium,
    },
    autoSwitch: {
      transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
    },
    refreshBtn: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.accent.glow,
      borderRadius: radius.sm,
    },
    refreshText: {
      color: colors.text.secondary,
      fontSize: typography.size.sm,
      fontWeight: typography.weight.medium,
    },
    helperText: {
      color: colors.text.muted,
      fontSize: typography.size.sm,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    metricCard: {
      flex: 1,
      minWidth: 140,
      backgroundColor: colors.background.secondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.lg,
    },
    metricValue: {
      color: colors.text.primary,
      fontSize: typography.size.xxxl,
      fontWeight: typography.weight.bold,
    },
    metricLabel: {
      color: colors.text.muted,
      fontSize: typography.size.sm,
      marginTop: spacing.xs,
    },
    sectionCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.lg,
    },
    sectionTitle: {
      color: colors.text.primary,
      fontSize: typography.size.lg,
      fontWeight: typography.weight.semibold,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    rowTitle: {
      color: colors.text.primary,
      fontSize: typography.size.md,
      fontWeight: typography.weight.medium,
    },
    rowSub: {
      color: colors.text.muted,
      fontSize: typography.size.sm,
    },
    badgeText: {
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.wide,
    },
    empty: {
      color: colors.text.muted,
      fontSize: typography.size.sm,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
    logRow: {
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    logTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 2,
    },
    logLevel: {
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.wide,
    },
    logTime: {
      color: colors.text.muted,
      fontSize: typography.size.xs,
    },
    logMessage: {
      color: colors.text.primary,
      fontSize: typography.size.sm,
    },
    logMeta: {
      color: colors.text.muted,
      fontSize: typography.size.xs,
      marginTop: 2,
    },
  });
}
