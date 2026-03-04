import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Device } from '../store';
import { theme } from '../theme';
import { DataColumn, DataTable } from './DataTable';

interface DeviceTableProps {
  rows: Device[];
  onDisable: (deviceId: string) => void;
  onReboot: (deviceId: string) => void;
  onReassign: (deviceId: string) => void;
  onLogs: (deviceId: string) => void;
}

function StatusPill({ status }: { status: Device['status'] }) {
  const bg = status === 'online' ? '#1f4d34' : status === 'degraded' ? '#5a4a22' : '#5a2631';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={styles.pillText}>{status.toUpperCase()}</Text>
    </View>
  );
}

export function DeviceTable({ rows, onDisable, onReboot, onReassign, onLogs }: DeviceTableProps) {
  const columns: DataColumn<Device>[] = [
    { key: 'id', title: 'Device ID', width: 130, render: (row) => <Text style={styles.cellText}>{row.id}</Text> },
    { key: 'router', title: 'Router', width: 130, render: (row) => <Text style={styles.cellText}>{row.routerId}</Text> },
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
    { key: 'gps', title: 'Last GPS', width: 150, render: (row) => <Text style={styles.cellText}>{row.lastGps}</Text> },
    {
      key: 'actions',
      title: 'Actions',
      width: 330,
      render: (row) => (
        <View style={styles.actionsRow}>
          <ActionButton label="Disable" tone="danger" onPress={() => onDisable(row.id)} />
          <ActionButton label="Reboot" tone="neutral" onPress={() => onReboot(row.id)} />
          <ActionButton label="Reassign" tone="warn" onPress={() => onReassign(row.id)} />
          <ActionButton label="Logs" tone="primary" onPress={() => onLogs(row.id)} />
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
  const toneStyle =
    tone === 'primary'
      ? styles.primary
      : tone === 'warn'
        ? styles.warn
        : tone === 'danger'
          ? styles.danger
          : styles.neutral;

  return (
    <Pressable style={[styles.actionBtn, toneStyle]} onPress={onPress}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cellText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
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
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  actionBtn: {
    minHeight: 28,
    borderRadius: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  primary: {
    backgroundColor: '#17467f',
    borderColor: '#2f8cff',
  },
  neutral: {
    backgroundColor: '#1b2a3b',
    borderColor: '#2e425a',
  },
  warn: {
    backgroundColor: '#5a4a22',
    borderColor: '#8f6a29',
  },
  danger: {
    backgroundColor: '#5a2631',
    borderColor: '#944659',
  },
});
