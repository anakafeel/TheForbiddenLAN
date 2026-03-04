import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyGroup, User } from '../store';
import { theme } from '../theme';
import { DataColumn, DataTable } from './DataTable';

interface UserKeyManagerProps {
  rows: User[];
  keyGroups: KeyGroup[];
  onProvision: (userId: string) => void;
  onRevoke: (userId: string) => void;
  onAssign: (userId: string) => void;
  onSuspend: (userId: string) => void;
}

export function UserKeyManager({ rows, keyGroups, onProvision, onRevoke, onAssign, onSuspend }: UserKeyManagerProps) {
  const groupName = (id: string) => keyGroups.find((group) => group.id === id)?.name ?? id;

  const columns: DataColumn<User>[] = [
    { key: 'id', title: 'User ID', width: 110, render: (row) => <Text style={styles.cellText}>{row.id}</Text> },
    {
      key: 'device',
      title: 'Assigned Device',
      width: 130,
      render: (row) => <Text style={styles.cellText}>{row.assignedDeviceId ?? 'Unassigned'}</Text>,
    },
    {
      key: 'channel',
      title: 'Active Channel',
      width: 130,
      render: (row) => <Text style={styles.cellText}>{row.activeChannelId ?? 'None'}</Text>,
    },
    { key: 'role', title: 'Role', width: 110, render: (row) => <Text style={styles.cellText}>{row.role}</Text> },
    {
      key: 'keys',
      title: 'Key Group',
      width: 160,
      render: (row) => <Text style={styles.cellText}>{groupName(row.keyGroupId)}</Text>,
    },
    {
      key: 'status',
      title: 'Status',
      width: 130,
      render: (row) => <Text style={styles.cellText}>{row.suspended ? 'Suspended' : row.status}</Text>,
    },
    {
      key: 'actions',
      title: 'Actions',
      width: 350,
      render: (row) => (
        <View style={styles.actionsRow}>
          <ActionButton label="Provision" tone="primary" onPress={() => onProvision(row.id)} />
          <ActionButton label="Revoke" tone="danger" onPress={() => onRevoke(row.id)} />
          <ActionButton label="Assign" tone="neutral" onPress={() => onAssign(row.id)} />
          <ActionButton
            label={row.suspended ? 'Unsuspend' : 'Suspend'}
            tone="warn"
            onPress={() => onSuspend(row.id)}
          />
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
