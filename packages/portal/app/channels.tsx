import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChannelControlPanel } from '../src/components/ChannelControlPanel';
import { DataColumn, DataTable } from '../src/components/DataTable';
import { useAppStore } from '../src/store';
import { Channel, User } from '../src/store/types';
import { sharedStyles, theme } from '../src/theme';

export default function ChannelsPage() {
  const { channels, routers, users } = useAppStore();

  const userNameById = (id: string | null) => {
    if (!id) {
      return 'None';
    }
    return users.find((user) => user.id === id)?.displayName ?? id;
  };

  const routerNames = (ids: string[]) =>
    ids
      .map((id) => routers.find((router) => router.id === id)?.name ?? id)
      .join(', ');

  const columns: DataColumn<Channel>[] = [
    { key: 'name', title: 'Talkgroup', width: 180, render: (row) => <Text style={styles.cellText}>{row.name}</Text> },
    {
      key: 'active',
      title: 'Active Transmission',
      width: 160,
      render: (row) => <Text style={styles.cellText}>{row.activeTransmission ? 'Yes' : 'No'}</Text>,
    },
    {
      key: 'user',
      title: 'Transmitting User',
      width: 180,
      render: (row) => <Text style={styles.cellText}>{userNameById(row.transmittingUserId)}</Text>,
    },
    {
      key: 'routers',
      title: 'Assigned Routers',
      width: 260,
      render: (row) => <Text style={styles.cellText}>{routerNames(row.assignedRouterIds) || 'None'}</Text>,
    },
    {
      key: 'enc',
      title: 'Encryption',
      width: 120,
      render: (row) => <Text style={styles.cellText}>{row.encrypted ? 'Enabled' : 'Disabled'}</Text>,
    },
    {
      key: 'lock',
      title: 'Lock State',
      width: 120,
      render: (row) => <Text style={styles.cellText}>{row.locked ? 'Locked' : 'Open'}</Text>,
    },
    {
      key: 'mute',
      title: 'Mute State',
      width: 120,
      render: (row) => <Text style={styles.cellText}>{row.muted ? 'Muted' : 'Live'}</Text>,
    },
  ];

  return (
    <View style={sharedStyles.screen}>
      <Text style={sharedStyles.pageTitle}>Channels</Text>
      <View style={styles.stack}>
        <DataTable columns={columns} rows={channels} rowKey={(row) => row.id} />
        <ChannelControlPanel />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flex: 1,
    gap: theme.spacing.md,
  },
  cellText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
  },
});
