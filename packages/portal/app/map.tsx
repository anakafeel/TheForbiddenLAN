import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MapPlaceholder } from '../src/components/MapPlaceholder';
import { RouterDetailsPanel } from '../src/components/RouterDetailsPanel';
import { useAppStore } from '../src/store';
import { sharedStyles, theme } from '../src/theme';

export default function MapPage() {
  const { routers, devices, selectedRouterId, setSelectedRouterId, refreshData, isSyncing } = useAppStore();

  const selectedRouter = routers.find((router) => router.id === selectedRouterId);
  const connectedDevices = devices.filter((device) => device.routerId === selectedRouterId);

  return (
    <View style={sharedStyles.screen}>
      <View style={styles.headerRow}>
        <Text style={sharedStyles.pageTitle}>Map</Text>
        <Pressable style={styles.refreshButton} onPress={() => void refreshData()}>
          <Text style={styles.refreshText}>{isSyncing ? 'Syncing...' : 'Refresh GPS'}</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <MapPlaceholder
          routers={routers}
          devices={devices}
          selectedRouterId={selectedRouterId}
          onSelectRouter={setSelectedRouterId}
        />
        <RouterDetailsPanel router={selectedRouter} devices={connectedDevices} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  refreshButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  refreshText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
});
