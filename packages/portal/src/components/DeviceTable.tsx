import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Device } from '../store';
import { theme } from '../theme';
import { DataColumn, DataTable } from './DataTable';

interface DeviceTableProps {
  rows: Device[];
  onToggleActive: (deviceId: string) => void;
  onReboot: (deviceId: string) => void;
  onReassign: (deviceId: string) => void;
  onLogs: (deviceId: string) => void;
}

function StatusPill({ status }: { status: Device['status'] }) {
  const backgroundColor =
    status === 'online'
      ? theme.colors.status.activeGlow
      : status === 'degraded'
        ? theme.colors.status.warningGlow
        : theme.colors.status.dangerGlow;

  const textColor =
    status === 'online' ? theme.colors.success : status === 'degraded' ? theme.colors.warning : theme.colors.danger;

  return (
    <View style={{ ...styles.pill, backgroundColor }}>
      <Text style={{ ...styles.pillText, color: textColor }}>{status.toUpperCase()}</Text>
    </View>
  );
}

export function DeviceTable({ rows, onToggleActive, onReboot, onReassign, onLogs }: DeviceTableProps) {
  const columns: DataColumn<Device>[] = [
    {
      key: 'id',
      title: 'Device ID',
      width: 220,
      render: (row) => (
        <View>
          <Text style={styles.cellText}>{row.id}</Text>
          <Text style={styles.muted}>{row.serial ?? 'no-serial'}</Text>
        </View>
      ),
    },
    {
      key: 'router',
      title: 'Router/Site',
      width: 160,
      render: (row) => <Text style={styles.cellText}>{row.site || row.routerId}</Text>,
    },
    { key: 'status', title: 'Online Status', width: 140, render: (row) => <StatusPill status={row.status} /> },
    {
      key: 'signal',
      title: 'Signal',
      width: 90,
      render: (row) => <Text style={styles.cellText}>{row.signalStrength}%</Text>,
    },
    {
      key: 'battery',
      title: 'Battery',
      width: 90,
      render: (row) => <Text style={styles.cellText}>{row.battery}%</Text>,
    },
    {
      key: 'talkgroup',
      title: 'Assigned Talkgroup',
      width: 170,
      render: (row) => <Text style={styles.cellText}>{row.assignedTalkgroup}</Text>,
    },
    {
      key: 'gps',
      title: 'Last GPS',
      width: 190,
      render: (row) => (
        <View>
          <Text style={styles.cellText}>{row.lastGps}</Text>
          <Text style={styles.muted}>{row.updatedAt ? new Date(row.updatedAt).toLocaleTimeString() : 'no timestamp'}</Text>
        </View>
      ),
    },
    {
      key: 'actions',
      title: 'Actions',
      width: 340,
      render: (row) => (
        <View style={styles.actionsRow}>
          <ActionButton
            label={row.active === false || row.status === 'offline' ? 'Enable' : 'Disable'}
            tone={row.active === false || row.status === 'offline' ? 'primary' : 'danger'}
            onPress={() => onToggleActive(row.id)}
          />
          <ActionButton label="Reboot" tone="neutral" onPress={() => onReboot(row.id)} />
          <ActionButton label="Reassign" tone="warn" onPress={() => onReassign(row.id)} />
          <ActionButton label="Logs" tone="neutral" onPress={() => onLogs(row.id)} />
        </View>
      ),
    },
  ];

  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />;
}

function ActionButton({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: 'primary' | 'neutral' | 'warn' | 'danger';
  onPress: () => void;
}) {
  const style =
    tone === 'primary'
      ? styles.primary
      : tone === 'warn'
        ? styles.warn
        : tone === 'danger'
          ? styles.danger
          : styles.neutral;

  return (
    <Pressable style={style} onPress={onPress}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cellText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
  },
  muted: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.small,
  },
  pill: {
    minWidth: 86,
    minHeight: 24,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  primary: {
    minHeight: 28,
    borderRadius: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.borderStrong,
  },
  neutral: {
    minHeight: 28,
    borderRadius: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: theme.colors.background.tertiary,
    borderColor: theme.colors.borderStrong,
  },
  warn: {
    minHeight: 28,
    borderRadius: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: 'rgba(245, 158, 11, 0.55)',
  },
  danger: {
    minHeight: 28,
    borderRadius: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: 'rgba(239, 68, 68, 0.55)',
  },
});
