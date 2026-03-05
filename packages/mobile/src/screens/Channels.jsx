import React, { useContext, useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Pressable } from 'react-native';
import { ChannelContext } from '../context/ChannelContext';
import socket from '../utils/socket';
import { CONFIG } from '../config';
import theme from '../theme';
import BottomMenu from '../components/BottomMenu';

const { colors, spacing, radius, shadows, typography } = theme;

// Mock channels for UI testing (no backend required)
const MOCK_CHANNELS = [
  { id: 'channel-1', name: 'Channel 1', status: 'active', users: 10, transmitting: true },
  { id: 'channel-2', name: 'Channel 2', status: 'monitoring', users: 5, transmitting: false },
  { id: 'channel-3', name: 'Channel 3', status: 'idle', users: 8, transmitting: false },
  { id: 'channel-4', name: 'Channel 4', status: 'idle', users: 3, transmitting: false },
  { id: 'channel-5', name: 'Channel 5', status: 'idle', users: 12, transmitting: false },
];

// Filter Tabs Component
function FilterTabs({ activeFilter, onFilterChange }) {
  const filters = ['ALL', 'ACTIVE'];
  return (
    <View style={styles.filterContainer}>
      {filters.map((filter) => (
        <TouchableOpacity
          key={filter}
          style={[styles.filterTab, activeFilter === filter && styles.filterTabActive]}
          onPress={() => onFilterChange(filter)}
        >
          <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>
            {filter}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Channel Card Component with inline PTT button
function ChannelCard({ channel, onPress, isActive, isTransmitting, currentSpeaker, onPTTStart, onPTTEnd, channelSpeaker }) {
  // Show LIVE only when someone is actively speaking or transmitting
  const isLive = channel.transmitting || channelSpeaker || (isActive && (currentSpeaker || isTransmitting));
  const speakerName = isActive && isTransmitting ? 'YOU' : (isActive ? currentSpeaker : channelSpeaker);
  
  return (
    <TouchableOpacity 
      style={[styles.channelCard, isActive && styles.channelCardActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Channel Info */}
      <View style={styles.channelHeader}>
        <View style={styles.channelTitleRow}>
          {isLive && (
            <View style={[styles.transmitBadge, !(channel.transmitting || isTransmitting) && styles.liveBadge]}>
              <Text style={styles.transmitText}>● LIVE</Text>
            </View>
          )}
        </View>
        <Text style={styles.channelName}>{channel.name}</Text>
        <View style={styles.channelMeta}>
          <Text style={styles.channelUsers}>👤 {channel.users} Online</Text>
          {speakerName && (
            <Text style={styles.channelSpeakerPreview}>🎙️ {speakerName}</Text>
          )}
        </View>
      </View>

      {/* Inline PTT Button */}
      {isActive && (
        <Pressable
          onPressIn={(e) => {
            e.stopPropagation();
            onPTTStart();
          }}
          onPressOut={(e) => {
            e.stopPropagation();
            onPTTEnd();
          }}
          style={({ pressed }) => [
            styles.inlinePttButton,
            isTransmitting && styles.inlinePttButtonActive,
            pressed && styles.inlinePttButtonPressed,
          ]}
        >
          <Text style={styles.inlinePttIcon}>{isTransmitting ? '🔴' : '🎙️'}</Text>
        </Pressable>
      )}
    </TouchableOpacity>
  );
}

export default function ChannelsScreen({ navigation }) {
  const { setCurrent, current } = useContext(ChannelContext);
  const [channels, setChannels] = useState(CONFIG.MOCK_MODE ? MOCK_CHANNELS : []);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [channelSpeakers, setChannelSpeakers] = useState({}); // Track speakers per channel

  useEffect(() => {
    if (!CONFIG.MOCK_MODE && socket) {
      socket.emit('list-channels');
      socket.on('channels', list => setChannels(list));
      return () => socket.off('channels');
    }
  }, []);

  // Simulate random speakers across ALL channels
  useEffect(() => {
    const speakers = ['ECHO-1', 'BRAVO-2', 'CHARLIE-3', 'DELTA-4', 'FOXTROT-5', 'GOLF-6'];
    
    const interval = setInterval(() => {
      // Randomly pick a channel to have activity
      const randomChannel = MOCK_CHANNELS[Math.floor(Math.random() * MOCK_CHANNELS.length)];
      
      if (Math.random() > 0.5) {
        const speaker = speakers[Math.floor(Math.random() * speakers.length)];
        setChannelSpeakers(prev => ({ ...prev, [randomChannel.id]: speaker }));
        
        // Clear after random duration
        setTimeout(() => {
          setChannelSpeakers(prev => ({ ...prev, [randomChannel.id]: null }));
        }, 1500 + Math.random() * 2500);
      }
    }, 2500);
    
    return () => clearInterval(interval);
  }, []);

  // Current channel speaker (when you're in the channel)
  useEffect(() => {
    if (!current || isTransmitting) {
      setCurrentSpeaker(null);
      return;
    }
    
    const speakers = ['ECHO-1', 'BRAVO-2', 'CHARLIE-3', 'DELTA-4'];
    const interval = setInterval(() => {
      if (Math.random() > 0.6) {
        const speaker = speakers[Math.floor(Math.random() * speakers.length)];
        setCurrentSpeaker(speaker);
        setTimeout(() => setCurrentSpeaker(null), 2000 + Math.random() * 2000);
      }
    }, 4000);
    
    return () => clearInterval(interval);
  }, [current, isTransmitting]);

  const selectChannel = channel => {
    if (current?.id === channel.id) {
      setCurrent(null); // Deselect if already selected
    } else {
      setCurrent(channel);
    }
  };

  const handlePTTStart = useCallback(() => {
    if (!current) return;
    setIsTransmitting(true);
    // TODO: Start/stop audio capture and transmission
  }, [current]);

  const handlePTTEnd = useCallback(() => {
    if (!current) return;
    setIsTransmitting(false);
    // TODO: Stop audio capture and transmission
  }, [current]);

  const filteredChannels = channels.filter(ch => {
    if (searchQuery && !ch.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (activeFilter === 'ACTIVE') return ch.transmitting || ch.status === 'active';
    return true;
  });

  const renderItem = ({ item }) => (
    <ChannelCard
      channel={item}
      onPress={() => selectChannel(item)}
      isActive={current?.id === item.id}
      isTransmitting={current?.id === item.id && isTransmitting}
      currentSpeaker={current?.id === item.id ? currentSpeaker : null}
      channelSpeaker={channelSpeakers[item.id]}
      onPTTStart={handlePTTStart}
      onPTTEnd={handlePTTEnd}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Pressable onPress={() => navigation.openDrawer()} hitSlop={10}>
            <Text style={styles.menuIcon}>☰</Text>
          </Pressable>
          <Text style={styles.title}>SKYTALK</Text>
          <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={10}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </Pressable>
        </View>
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search channels..."
            placeholderTextColor={colors.text.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Filter Tabs */}
        <FilterTabs activeFilter={activeFilter} onFilterChange={setActiveFilter} />
      </View>

      {/* Channel List */}
      <FlatList
        data={filteredChannels}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
      <BottomMenu navigation={navigation} active="Channels" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  menuIcon: {
    color: colors.text.primary,
    fontSize: 20,
  },
  title: {
    color: colors.text.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wider,
  },
  settingsIcon: {
    fontSize: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    fontSize: typography.size.md,
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  filterTab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    marginRight: spacing.sm,
  },
  filterTabActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  filterText: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    letterSpacing: typography.letterSpacing.wide,
  },
  filterTextActive: {
    color: colors.text.primary,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + 88,
  },
  channelCard: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  channelCardExpanded: {
    borderColor: colors.accent.primary,
  },
  channelCardActive: {
    borderColor: colors.accent.primary,
  },
  channelHeader: {
    flex: 1,
  },
  channelTitleRow: {
    marginBottom: spacing.xs,
  },
  transmitBadge: {
    backgroundColor: colors.status.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    marginBottom: spacing.xs,
  },
  liveBadge: {
    backgroundColor: colors.status.active,
  },
  inlinePttButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
    borderWidth: 2,
    borderColor: colors.accent.primaryLight,
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  inlinePttButtonActive: {
    backgroundColor: colors.status.danger,
    borderColor: '#FF6B6B',
    shadowColor: colors.status.danger,
    shadowOpacity: 0.8,
    shadowRadius: 15,
  },
  inlinePttButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  inlinePttIcon: {
    fontSize: 24,
  },
  transmitText: {
    color: colors.text.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  monitorBadge: {
    backgroundColor: colors.accent.primaryDark,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    marginBottom: spacing.xs,
  },
  monitorText: {
    color: colors.text.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  channelName: {
    color: colors.text.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  channelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  channelUsers: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
  },
  channelSpeakerPreview: {
    color: colors.status.active,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    marginLeft: spacing.md,
  },
  channelActions: {
    alignItems: 'flex-end',
  },
  signalBars: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  signalBar: {
    width: 4,
    borderRadius: 1,
    marginRight: 2,
  },
  signalBarFull: {
    backgroundColor: colors.accent.primary,
    height: 12,
  },
  signalBarEmpty: {
    backgroundColor: colors.text.muted,
    height: 12,
    opacity: 0.3,
  },
  activeBadge: {
    backgroundColor: colors.status.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  activeBadgeText: {
    color: colors.text.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  // PTT Panel Styles
  pttPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.medium,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  pttHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: spacing.md,
  },
  pttHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pttStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.status.active,
    marginRight: spacing.sm,
  },
  pttStatusDotInactive: {
    backgroundColor: colors.text.muted,
  },
  pttChannelName: {
    color: colors.accent.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wider,
  },
  pttChannelNameInactive: {
    color: colors.text.muted,
  },
  pttCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  pttCloseIcon: {
    color: colors.text.muted,
    fontSize: 14,
  },
  speakingIndicator: {
    backgroundColor: colors.background.tertiary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  speakingIndicatorActive: {
    backgroundColor: colors.status.activeGlow,
    borderColor: colors.status.active,
  },
  speakingLabel: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
    letterSpacing: typography.letterSpacing.wide,
  },
  pttContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 180,
    width: 180,
  },
  pttGlowOuter: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    opacity: 0.3,
  },
  pttGlowOuterActive: {
    borderColor: colors.status.danger,
    opacity: 0.8,
    shadowColor: colors.status.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  pttGlowMiddle: {
    position: 'absolute',
    width: 155,
    height: 155,
    borderRadius: 77.5,
    borderWidth: 2,
    borderColor: colors.border.medium,
    opacity: 0.4,
  },
  pttGlowMiddleActive: {
    borderColor: colors.status.danger,
    opacity: 0.9,
  },
  pttGlowInner: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    opacity: 0.3,
  },
  pttGlowInnerActive: {
    borderColor: colors.status.danger,
    opacity: 0.7,
  },
  pttButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.accent.primary,
    borderWidth: 4,
    borderColor: colors.accent.primaryLight,
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  pttButtonActive: {
    backgroundColor: colors.status.danger,
    borderColor: '#FF6B6B',
    shadowColor: colors.status.danger,
    shadowOpacity: 0.9,
    shadowRadius: 40,
  },
  pttButtonDisabled: {
    backgroundColor: colors.background.tertiary,
    borderColor: colors.border.medium,
    shadowOpacity: 0,
  },
  pttButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  pttIcon: {
    fontSize: 36,
    marginBottom: spacing.xs,
  },
  pttLabel: {
    color: colors.text.inverse,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wider,
    textAlign: 'center',
  },
  pttLabelActive: {
    color: colors.text.inverse,
  },
  pttHint: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    marginTop: spacing.md,
    letterSpacing: typography.letterSpacing.wide,
  },
  // Expandable Channel PTT Styles
  expandIcon: {
    color: colors.text.muted,
    fontSize: 18,
    marginLeft: spacing.sm,
  },
  channelPttPanel: {
    backgroundColor: colors.background.tertiary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    alignItems: 'center',
  },
  channelSpeaking: {
    backgroundColor: colors.background.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    width: '100%',
    alignItems: 'center',
  },
  channelSpeakingActive: {
    backgroundColor: colors.status.activeGlow,
    borderColor: colors.status.active,
  },
  channelSpeakingText: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
    letterSpacing: typography.letterSpacing.wide,
  },
  channelPttContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
    width: 120,
    marginVertical: spacing.sm,
  },
  channelPttGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: colors.border.medium,
    opacity: 0.4,
  },
  channelPttGlowActive: {
    borderColor: colors.status.danger,
    opacity: 0.9,
    shadowColor: colors.status.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
  },
  channelPttButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.accent.primary,
    borderWidth: 3,
    borderColor: colors.accent.primaryLight,
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  channelPttButtonActive: {
    backgroundColor: colors.status.danger,
    borderColor: '#FF6B6B',
    shadowColor: colors.status.danger,
    shadowOpacity: 0.9,
    shadowRadius: 30,
  },
  channelPttButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  channelPttIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  channelPttHint: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    marginTop: spacing.sm,
    letterSpacing: typography.letterSpacing.wide,
  },
});
