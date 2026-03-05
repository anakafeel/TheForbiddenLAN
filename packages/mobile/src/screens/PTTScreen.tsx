import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChannelContext } from '../context/ChannelContext';
import PTTButton from '../components/PTTButton';
import BottomMenu from '../components/BottomMenu';
import { CONFIG } from '../config';
import theme from '../theme';

const { colors, spacing, radius, typography } = theme;

type Channel = { id: string; name: string; users: number };
type PTTScreenProps = { navigation: any };

const CHANNELS: Channel[] = [
  { id: 'channel-1', name: 'Channel 1', users: 10 },
  { id: 'channel-2', name: 'Channel 2', users: 5 },
  { id: 'channel-3', name: 'Channel 3', users: 8 },
  { id: 'channel-4', name: 'Channel 4', users: 3 },
];

const ONLINE_USERS: Record<string, string[]> = {
  'channel-1': ['ECHO-1', 'BRAVO-2', 'CHARLIE-3', 'DELTA-4', 'FOXTROT-5'],
  'channel-2': ['GOLF-6', 'HOTEL-7', 'INDIA-8'],
  'channel-3': ['JULIET-9', 'KILO-10', 'LIMA-11', 'MIKE-12'],
  'channel-4': ['NOVEMBER-13', 'OSCAR-14'],
};

export default function PTTScreen({ navigation }: PTTScreenProps) {
  const { current, setCurrent } = useContext(ChannelContext as any) as {
    current: Channel | null;
    setCurrent: (channel: Channel) => void;
  };
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [showChannelDropdown, setShowChannelDropdown] = useState(false);

  useEffect(() => {
    if (!current) {
      setCurrent(CHANNELS[0]);
    }
  }, [current, setCurrent]);

  useEffect(() => {
    if (!current || isTransmitting) {
      setCurrentSpeaker(null);
      return;
    }

    const members = ONLINE_USERS[current.id] ?? [];
    if (members.length === 0) return;

    const interval = setInterval(() => {
      if (Math.random() > 0.6) {
        const speaker = members[Math.floor(Math.random() * members.length)];
        setCurrentSpeaker(speaker);
        setTimeout(() => setCurrentSpeaker(null), 2500);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [current, isTransmitting]);

  const currentUsers = useMemo(() => (current ? ONLINE_USERS[current.id] ?? [] : []), [current]);

  return (
    <View style={styles.container}>
      <View style={styles.topNav}>
        <TouchableOpacity onPress={() => navigation.navigate('Dashboard')}>
          <Text style={styles.topNavIcon}>⌂</Text>
        </TouchableOpacity>
        <Text style={styles.topNavTitle}>PTT</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Text style={styles.topNavIcon}>👤</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.channelSwitchWrap}>
        <TouchableOpacity style={styles.dropdownButton} onPress={() => setShowChannelDropdown((prev) => !prev)}>
          <Text style={styles.dropdownButtonText}>{current?.name ?? 'Select Channel'}</Text>
          <Text style={styles.dropdownChevron}>{showChannelDropdown ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showChannelDropdown ? (
          <View style={styles.dropdownMenu}>
            {CHANNELS.map((channel) => {
              const active = current?.id === channel.id;
              return (
                <TouchableOpacity
                  key={channel.id}
                  style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                  onPress={() => {
                    setCurrent(channel);
                    setShowChannelDropdown(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>
                    {channel.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={styles.channelHeader}>
        <Text style={styles.channelName}>{current?.name ?? 'No Channel'}</Text>
        <Text style={styles.channelUsers}>👤 {currentUsers.length} Online</Text>
      </View>

      <View style={[styles.speakingBar, (currentSpeaker || isTransmitting) && styles.speakingBarActive]}>
        <Text style={styles.speakingText}>
          {isTransmitting
            ? '📡 TRANSMITTING ACTIVE'
            : currentSpeaker
            ? `🎙️ NOW SPEAKING: ${currentSpeaker}`
            : '— Channel idle —'}
        </Text>
      </View>

      <View style={styles.onlineWrap}>
        <Text style={styles.onlineTitle}>Current Users Online</Text>
        <View style={styles.onlineList}>
          {currentUsers.map((name) => (
            <View key={name} style={styles.userPill}>
              <Text style={styles.userPillText}>{name}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.pttArea}>
        <PTTButton userId={CONFIG.DEVICE_ID} onTransmitChange={setIsTransmitting} />
      </View>

      <Text style={styles.hint}>
        {isTransmitting ? 'Tap once to stop transmitting' : 'Tap once to start transmitting'}
      </Text>
      <BottomMenu navigation={navigation} active="PTT" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    paddingBottom: spacing.xxl + 84,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  topNavTitle: {
    color: colors.text.primary,
    fontSize: typography.size.lg,
    fontWeight: '700',
    letterSpacing: 1,
  },
  topNavIcon: {
    color: colors.text.primary,
    fontSize: 22,
  },
  channelSwitchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    position: 'relative',
    zIndex: 5,
  },
  dropdownButton: {
    alignSelf: 'flex-start',
    minWidth: 170,
    maxWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dropdownButtonText: {
    color: colors.text.primary,
    fontSize: typography.size.sm,
    fontWeight: '600',
  },
  dropdownChevron: {
    color: colors.text.secondary,
    fontSize: typography.size.xs,
    marginLeft: spacing.sm,
  },
  dropdownMenu: {
    position: 'absolute',
    top: spacing.md + 40,
    left: spacing.lg,
    right: spacing.lg + 80,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  dropdownItemActive: {
    backgroundColor: colors.accent.primary,
  },
  dropdownItemText: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
  },
  dropdownItemTextActive: {
    color: colors.text.primary,
    fontWeight: '700',
  },
  channelHeader: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    backgroundColor: colors.background.secondary,
  },
  channelName: {
    color: colors.text.primary,
    fontSize: typography.size.xl,
    fontWeight: 'bold',
  },
  channelUsers: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
  },
  speakingBar: {
    backgroundColor: colors.background.tertiary,
    padding: spacing.md,
    alignItems: 'center',
  },
  speakingBarActive: {
    backgroundColor: colors.status.activeGlow,
  },
  speakingText: {
    color: colors.text.secondary,
    fontWeight: '500',
  },
  onlineWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  onlineTitle: {
    color: colors.text.primary,
    fontSize: typography.size.md,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  onlineList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  userPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.secondary,
  },
  userPillText: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
  },
  pttArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    textAlign: 'center',
    color: colors.text.muted,
    paddingBottom: spacing.xl,
  },
});
