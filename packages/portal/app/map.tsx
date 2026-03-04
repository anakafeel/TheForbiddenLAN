import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MapPlaceholder } from '../src/components/MapPlaceholder';
import { RouterDetailsPanel } from '../src/components/RouterDetailsPanel';
import { useAppStore } from '../src/store';
import { sharedStyles, theme } from '../src/theme';

export default function MapPage() {
  const { routers, devices, selectedRouterId, setSelectedRouterId } = useAppStore();

  const selectedRouter = routers.find((router) => router.id === selectedRouterId);
  const connectedDevices = devices.filter((device) => device.routerId === selectedRouterId);

  return (
    <View style={sharedStyles.screen}>
      <Text style={sharedStyles.pageTitle}>Map</Text>
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
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
});
