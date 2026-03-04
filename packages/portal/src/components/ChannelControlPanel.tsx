import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppStore } from '../store';
import { theme } from '../theme';
import { Modal } from './Modal';

export function ChannelControlPanel() {
  const {
    channels,
    users,
    routers,
    toggleChannelLock,
    forceMuteChannel,
    moveUserToChannel,
    createChannel,
    deleteChannel,
    rotateChannelKey,
  } = useAppStore();

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
      <Text style={styles.heading}>Channel Controls</Text>

      <View style={styles.chipRow}>
        {channels.slice(0, 8).map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setSelectedChannelId(item.id)}
            style={item.id === channel.id ? styles.selectedChip : styles.chip}
          >
            <Text style={styles.chipText}>{item.name}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.controlRow}>
        <View style={styles.inputBlock}>
          <Text style={styles.label}>Selected Channel ID</Text>
          <TextInput
            value={selectedChannelId}
            onChangeText={setSelectedChannelId}
            style={styles.input}
            placeholder="talkgroup-id"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputBlock}>
          <Text style={styles.label}>User ID to Move</Text>
          <TextInput
            value={selectedUserId}
            onChangeText={setSelectedUserId}
            style={styles.input}
            placeholder="user-id"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
          />
        </View>
      </View>

      <View style={styles.controlRow}>
        <ActionButton
          label={channel.muted ? 'Unmute Channel' : 'Force Mute'}
          tone="danger"
          onPress={() => forceMuteChannel(channel.id)}
        />
        <ActionButton label="Move User" tone="neutral" onPress={() => moveUserToChannel(selectedUserId, channel.id)} />
        <ActionButton
          label={channel.locked ? 'Unlock Channel' : 'Lock Channel'}
          tone="warn"
          onPress={() => toggleChannelLock(channel.id)}
        />
        <ActionButton label="Rotate Key" tone="primary" onPress={() => void rotateChannelKey(channel.id)} />
        <ActionButton label="Delete Channel" tone="danger" onPress={() => void deleteChannel(channel.id)} />
        <ActionButton label="Create Channel" tone="primary" onPress={() => setShowCreateModal(true)} />
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Routers: {channel.assignedRouterIds.join(', ') || 'None'}</Text>
        <Text style={styles.metaText}>Rotation Counter: {channel.rotationCounter ?? 0}</Text>
        <Text style={styles.metaText}>Encryption: {channel.encrypted ? 'Enabled' : 'Disabled'}</Text>
      </View>

      <Modal visible={showCreateModal} title="Create Talkgroup" onClose={() => setShowCreateModal(false)}>
        <Text style={styles.label}>Talkgroup Name</Text>
        <TextInput
          value={channelName}
          onChangeText={setChannelName}
          style={styles.input}
          placeholder="Bravo Tactical"
          placeholderTextColor={theme.colors.textMuted}
        />
        <ActionButton
          label={`Encryption: ${encrypted ? 'Enabled' : 'Disabled'}`}
          tone="neutral"
          onPress={() => setEncrypted((prev) => !prev)}
        />
        <ActionButton
          label="Confirm Create"
          tone="primary"
          onPress={() => {
            if (channelName.trim().length < 3) {
              return;
            }
            void createChannel(channelName.trim(), encrypted);
            setChannelName('');
            setEncrypted(true);
            setShowCreateModal(false);
          }}
        />
        <Text style={styles.metaText}>Known routers: {routers.map((router) => router.name).join(' | ')}</Text>
      </Modal>
    </View>
  );
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
  const buttonStyle =
    tone === 'primary'
      ? styles.primaryBtn
      : tone === 'warn'
        ? styles.warnBtn
        : tone === 'danger'
          ? styles.dangerBtn
          : styles.neutralBtn;

  return (
    <Pressable onPress={onPress} style={buttonStyle}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
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
  heading: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  chipRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  chip: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.background.tertiary,
    paddingHorizontal: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedChip: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  controlRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  inputBlock: {
    minWidth: 240,
    gap: theme.spacing.xs,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  input: {
    height: 36,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.background.tertiary,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.sm,
    fontSize: theme.typography.body,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  primaryBtn: {
    minHeight: 34,
    minWidth: 128,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.borderStrong,
  },
  neutralBtn: {
    minHeight: 34,
    minWidth: 128,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: theme.colors.background.tertiary,
    borderColor: theme.colors.borderStrong,
  },
  warnBtn: {
    minHeight: 34,
    minWidth: 128,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: 'rgba(245, 158, 11, 0.55)',
  },
  dangerBtn: {
    minHeight: 34,
    minWidth: 128,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: 'rgba(239, 68, 68, 0.55)',
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
