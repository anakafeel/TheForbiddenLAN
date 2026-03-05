// Admin Devices — list all devices + enable/disable toggle per device.
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { api } from '../../lib/api';
import { useAppTheme } from '../../theme';

export function AdminDevices() {
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/devices');
      setDevices(res.devices ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (device) => {
    try {
      await api.patch(`/devices/${device.id}/status`, { active: !device.active });
      setDevices(prev => prev.map(d => d.id === device.id ? { ...d, active: !d.active } : d));
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.status.info} /></View>;
  }

  return (
    <View style={styles.container}>
      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.headerRow}>
        <Text style={styles.countText}>{devices.length} device{devices.length !== 1 ? 's' : ''}</Text>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.statusDot, { backgroundColor: item.active ? colors.status.active : colors.status.danger }]} />
              <Text style={styles.name}>{item.name ?? 'Unnamed Device'}</Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Serial</Text>
                <Text style={styles.detailValue}>{item.serial}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Site</Text>
                <Text style={styles.detailValue}>{item.site ?? '—'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Pressable
                  onPress={() => toggle(item)}
                  style={[styles.toggleBtn, item.active ? styles.toggleActive : styles.toggleInactive]}
                >
                  <Text style={styles.toggleText}>{item.active ? 'Enabled' : 'Disabled'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No devices registered</Text>}
        contentContainerStyle={devices.length === 0 ? { flex: 1 } : undefined}
      />
    </View>
  );
}

function createStyles(colors: any, spacing: any, radius: any, typography: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background.primary, padding: spacing.xl },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary },
    error: { color: colors.status.danger, marginBottom: spacing.md, textAlign: 'center', fontSize: typography.size.sm },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    countText: { color: colors.text.muted, fontSize: typography.size.sm },
    card: {
      backgroundColor: colors.background.secondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginBottom: spacing.sm,
      overflow: 'hidden',
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: spacing.sm,
    },
    name: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
    cardBody: { padding: spacing.lg },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    detailLabel: { color: colors.text.muted, fontSize: typography.size.sm },
    detailValue: { color: colors.text.secondary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
    toggleBtn: {
      borderRadius: radius.sm,
      paddingVertical: 4,
      paddingHorizontal: spacing.md,
    },
    toggleActive: {
      backgroundColor: colors.status.activeSubtle,
    },
    toggleInactive: {
      backgroundColor: colors.status.dangerSubtle,
    },
    toggleText: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
    empty: { color: colors.text.muted, textAlign: 'center', marginTop: spacing.xl },
    refreshBtn: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.accent.glow,
      borderRadius: radius.sm,
    },
    refreshText: { color: colors.text.secondary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
  });
}
