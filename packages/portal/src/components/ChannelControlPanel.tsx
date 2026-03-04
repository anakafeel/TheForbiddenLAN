import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppStore } from '../store';
import { theme } from '../theme';
import { Modal } from './Modal';

export function ChannelControlPanel() {
  const { channels, users, routers, toggleChannelLock, forceMuteChannel, moveUserToChannel, createChannel } =
    useAppStore();
  const [selectedChannelId, setSelectedChannelId] = useState<string>(channels[0]?.id ?? '');
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id ?? '');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [encrypted, setEncrypted] = useState(true);

  const channel = useMemo(
    () => channels.find((item) => item.id === selectedChannelId) ?? channels[0],
    [channels, selectedChannelId],
  );

  if (!channel) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.controlRow}>
        <View style={styles.inputBlock}>
          <Text style={styles.label}>Selected Channel</Text>
          <TextInput
            value={selectedChannelId}
            onChangeText={setSelectedChannelId}
            style={styles.input}
            placeholder="ch-alpha"
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>
        <View style={styles.inputBlock}>
          <Text style={styles.label}>User To Move</Text>
          <TextInput
            value={selectedUserId}
            onChangeText={setSelectedUserId}
            style={styles.input}
            placeholder="usr-001"
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>
      </View>

      <View style={styles.controlRow}>
        <Pressable onPress={() => forceMuteChannel(channel.id)} style={[styles.actionBtn, styles.dangerBtn]}>
          <Text style={styles.actionText}>{channel.muted ? 'Unmute Channel' : 'Force Mute'}</Text>
        </Pressable>

        <Pressable
          onPress={() => moveUserToChannel(selectedUserId, channel.id)}
          style={[styles.actionBtn, styles.neutralBtn]}
        >
          <Text style={styles.actionText}>Move User</Text>
        </Pressable>

        <Pressable onPress={() => toggleChannelLock(channel.id)} style={[styles.actionBtn, styles.warnBtn]}>
          <Text style={styles.actionText}>{channel.locked ? 'Unlock Channel' : 'Lock Channel'}</Text>
        </Pressable>

        <Pressable onPress={() => setShowCreateModal(true)} style={[styles.actionBtn, styles.primaryBtn]}>
          <Text style={styles.actionText}>Create Channel</Text>
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Routers: {channel.assignedRouterIds.join(', ') || 'None'}</Text>
        <Text style={styles.metaText}>Transmitting User: {channel.transmittingUserId ?? 'None'}</Text>
        <Text style={styles.metaText}>Encryption: {channel.encrypted ? 'Enabled' : 'Disabled'}</Text>
      </View>

      <Modal visible={showCreateModal} title="Create Channel" onClose={() => setShowCreateModal(false)}>
        <Text style={styles.label}>Channel Name</Text>
        <TextInput
          value={channelName}
          onChangeText={setChannelName}
          style={styles.input}
          placeholder="Bravo Tactical"
          placeholderTextColor={theme.colors.textMuted}
        />
        <Pressable onPress={() => setEncrypted((prev) => !prev)} style={[styles.actionBtn, styles.neutralBtn]}>
          <Text style={styles.actionText}>Encryption: {encrypted ? 'Enabled' : 'Disabled'}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (channelName.trim().length < 3) {
              return;
            }
            createChannel(channelName.trim(), encrypted);
            setChannelName('');
            setEncrypted(true);
            setShowCreateModal(false);
          }}
          style={[styles.actionBtn, styles.primaryBtn]}
        >
          <Text style={styles.actionText}>Confirm Create</Text>
        </Pressable>
        <Text style={styles.metaText}>Known routers: {routers.map((router) => router.name).join(' | ')}</Text>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    backgroundColor: theme.colors.surface,
  },
  controlRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  inputBlock: {
    minWidth: 220,
    gap: theme.spacing.xs,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  input: {
    height: 38,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.sm,
    fontSize: theme.typography.body,
  },
  actionBtn: {
    minHeight: 36,
    minWidth: 132,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  primaryBtn: {
    backgroundColor: '#17467f',
    borderColor: '#2f8cff',
  },
  neutralBtn: {
    backgroundColor: '#1b2a3b',
    borderColor: '#2e425a',
  },
  warnBtn: {
    backgroundColor: '#4e3c1f',
    borderColor: '#8f6a29',
  },
  dangerBtn: {
    backgroundColor: '#512431',
    borderColor: '#944659',
  },
  metaRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  metaText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
  },
});
