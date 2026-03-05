// Admin Dashboard — overview stats: total users, devices, talkgroups + device status list.
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet, Switch } from 'react-native';
import { api } from '../../lib/api';
import { useAppTheme } from '../../theme';

export function AdminDashboard() {
  const { colors, spacing, radius, typography, themeMode, setThemeMode } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );
  const [stats, setStats] = useState({ users: 0, devices: 0, activeDevices: 0, talkgroups: 0 });
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [devRes, tgRes, usrRes] = await Promise.all([
        api.get('/devices'),
        api.get('/talkgroups'),
        api.get('/users'),
      ]);
      const devs = devRes.devices ?? [];
      setDevices(devs);
      setStats({
        users: (usrRes.users ?? []).length,
        devices: devs.length,
        activeDevices: devs.filter(d => d.active).length,
        talkgroups: (tgRes.talkgroups ?? []).length,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.status.info} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Overview</Text>
        <View style={styles.themeToggleWrap}>
          <Text style={styles.themeToggleLabel}>{themeMode === 'dark' ? 'Dark' : 'Light'}</Text>
          <Switch
            value={themeMode === 'dark'}
            onValueChange={(enabled) => setThemeMode(enabled ? 'dark' : 'light')}
            trackColor={{ false: colors.border.medium, true: colors.accent.primaryLight }}
            thumbColor={colors.text.primary}
            style={styles.themeToggleSwitch}
          />
        </View>
      </View>

      {/* Stat cards */}
      <View style={styles.statsGrid}>
        <StatCard label="Total Users" value={stats.users} color={colors.status.info} styles={styles} />
        <StatCard label="Total Devices" value={stats.devices} color={colors.accent.primaryLight} styles={styles} />
        <StatCard label="Active Devices" value={stats.activeDevices} color={colors.status.active} styles={styles} />
        <StatCard label="Talkgroups" value={stats.talkgroups} color={colors.status.warning} styles={styles} />
      </View>

      {/* Device list */}
      <View style={styles.listSection}>
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Device Status</Text>
          <Pressable onPress={load} style={styles.refreshBtn}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>
        {devices.length === 0 ? (
          <Text style={styles.empty}>No devices registered</Text>
        ) : (
          devices.map(item => (
            <View key={item.id} style={styles.row}>
              <View style={[styles.statusDot, { backgroundColor: item.active ? colors.status.active : colors.status.danger }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name ?? item.serial}</Text>
                <Text style={styles.rowSub}>{item.site ?? '—'} · {item.serial}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: item.active ? colors.status.activeSubtle : colors.status.dangerSubtle }]}>
                <Text style={[styles.badgeText, { color: item.active ? colors.status.active : colors.status.danger }]}>
                  {item.active ? 'ONLINE' : 'OFFLINE'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value, color, styles }) {
  return (
    <View style={[styles.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <Text style={[styles.cardValue, { color }]}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

function createStyles(colors: any, spacing: any, radius: any, typography: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background.primary },
    scrollContent: { padding: spacing.xl },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary },
    error: { color: colors.status.danger, marginBottom: spacing.md, textAlign: 'center', fontSize: typography.size.sm },
    pageHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    pageTitle: {
      color: colors.text.muted,
      fontSize: typography.size.sm,
      textTransform: 'uppercase',
      letterSpacing: typography.letterSpacing.wide,
      fontWeight: typography.weight.bold,
    },
    themeToggleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.full,
      paddingLeft: spacing.sm,
      paddingRight: 2,
      paddingVertical: 2,
      gap: spacing.xs,
    },
    themeToggleLabel: {
      color: colors.text.secondary,
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.wide,
      minWidth: 34,
      textAlign: 'center',
    },
    themeToggleSwitch: {
      transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.xl,
    },
    card: {
      flex: 1,
      minWidth: 140,
      backgroundColor: colors.background.secondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.lg,
    },
    cardValue: { fontSize: typography.size.xxxl, fontWeight: typography.weight.bold },
    cardLabel: { fontSize: typography.size.sm, color: colors.text.muted, marginTop: spacing.xs },
    listSection: {
      backgroundColor: colors.background.secondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.lg,
    },
    listHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    sectionTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text.primary },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: spacing.sm,
    },
    rowTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.medium },
    rowSub: { color: colors.text.muted, fontSize: typography.size.sm, marginTop: 2 },
    badge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    badgeText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: typography.letterSpacing.wide },
    empty: { color: colors.text.muted, textAlign: 'center', paddingVertical: spacing.xl },
    refreshBtn: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.accent.glow,
      borderRadius: radius.sm,
    },
    refreshText: { color: colors.text.secondary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
  });
}
