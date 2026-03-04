import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Device, Router } from '../store';
import { theme } from '../theme';

interface RouterDetailsPanelProps {
  router: Router | undefined;
  devices: Device[];
}

export function RouterDetailsPanel({ router, devices }: RouterDetailsPanelProps) {
  if (!router) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Router Details</Text>
        <Text style={styles.value}>No router selected.</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Router Details</Text>
      <Text style={styles.value}>{router.name}</Text>

      <View style={styles.metaBlock}>
        <LabelValue label="Router ID" value={router.id} />
        <LabelValue label="Region" value={router.region} />
        <LabelValue label="Status" value={router.status.toUpperCase()} />
        <LabelValue label="Signal Strength" value={`${router.signalStrength}%`} />
        <LabelValue label="Channels" value={router.assignedChannels.join(', ')} />
      </View>

      <Text style={styles.sectionTitle}>Connected Devices</Text>
      <View style={styles.deviceList}>
        {devices.map((device) => (
          <View key={device.id} style={styles.deviceRow}>
            <Text style={styles.deviceId}>{device.id}</Text>
            <Text style={styles.deviceMeta}>{device.label}</Text>
            <Text style={styles.deviceMeta}>SIG {device.signalStrength}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 360,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sectionTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    marginTop: theme.spacing.sm,
  },
  metaBlock: {
    gap: theme.spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
  },
  value: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
    fontWeight: '600',
  },
  deviceList: {
    gap: 6,
  },
  deviceRow: {
    minHeight: 32,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    backgroundColor: theme.colors.bgElevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
  },
  deviceId: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  deviceMeta: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
  },
});
