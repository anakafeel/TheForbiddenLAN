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
    {
      key: 'identity',
      title: 'User Identity',
      width: 220,
      render: (row) => (
        <View>
          <Text style={styles.cellText}>{row.displayName}</Text>
          <Text style={styles.muted}>{row.id}</Text>
        </View>
      ),
    },
    {
      key: 'device',
      title: 'Assigned Device',
      width: 150,
      render: (row) => <Text style={styles.cellText}>{row.assignedDeviceId ?? 'Unassigned'}</Text>,
    },
    {
      key: 'channel',
      title: 'Active Channel',
      width: 160,
      render: (row) => <Text style={styles.cellText}>{row.activeChannelId ?? 'None'}</Text>,
    },
    {
      key: 'role',
      title: 'Role',
      width: 110,
      render: (row) => <Text style={styles.cellText}>{row.role}</Text>,
    },
    {
      key: 'keys',
      title: 'Key Group',
      width: 180,
      render: (row) => <Text style={styles.cellText}>{groupName(row.keyGroupId)}</Text>,
    },
    {
      key: 'status',
      title: 'Status',
      width: 120,
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
