import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ChannelControlPanel } from '../src/components/ChannelControlPanel';
import { DataColumn, DataTable } from '../src/components/DataTable';
import { useAppStore } from '../src/store';
import { Channel } from '../src/store/types';
import { sharedStyles, theme } from '../src/theme';

export default function ChannelsPage() {
  const { channels, routers, users } = useAppStore();
  const [query, setQuery] = useState('');

  const filteredChannels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return channels;
    }
    return channels.filter((channel) => channel.name.toLowerCase().includes(normalized) || channel.id.toLowerCase().includes(normalized));
  }, [channels, query]);

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
    { key: 'name', title: 'Talkgroup', width: 220, render: (row) => <Text style={styles.cellText}>{row.name}</Text> },
    { key: 'id', title: 'ID', width: 200, render: (row) => <Text style={styles.mutedCellText}>{row.id}</Text> },
    {
      key: 'active',
      title: 'Active Tx',
      width: 100,
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
      width: 240,
      render: (row) => <Text style={styles.cellText}>{routerNames(row.assignedRouterIds) || 'None'}</Text>,
    },
    {
      key: 'enc',
      title: 'Encryption',
      width: 120,
      render: (row) => <Text style={styles.cellText}>{row.encrypted ? 'Enabled' : 'Disabled'}</Text>,
    },
    {
      key: 'rotation',
      title: 'Rotation',
      width: 110,
      render: (row) => <Text style={styles.cellText}>{row.rotationCounter ?? 0}</Text>,
    },
    {
      key: 'lock',
      title: 'Lock',
      width: 90,
      render: (row) => <Text style={styles.cellText}>{row.locked ? 'Locked' : 'Open'}</Text>,
    },
    {
      key: 'mute',
      title: 'Mute',
      width: 90,
      render: (row) => <Text style={styles.cellText}>{row.muted ? 'Muted' : 'Live'}</Text>,
    },
  ];

  return (
    <View style={sharedStyles.screen}>
      <Text style={sharedStyles.pageTitle}>Channels</Text>
      <View style={styles.filters}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder="Search talkgroups by name or ID"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
        />
        <Text style={styles.counterText}>{filteredChannels.length} channels</Text>
      </View>
      <View style={styles.stack}>
        <DataTable columns={columns} rows={filteredChannels} rowKey={(row) => row.id} />
        <ChannelControlPanel />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  searchInput: {
    minWidth: 280,
    maxWidth: 440,
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.background.tertiary,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
    paddingHorizontal: theme.spacing.sm,
  },
  counterText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '600',
  },
  stack: {
    flex: 1,
    gap: theme.spacing.md,
  },
  cellText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
  },
  mutedCellText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
  },
});
