import React, { useContext, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { ChannelContext } from '../context/ChannelContext';
import socket from '../utils/socket';
import { CONFIG } from '../config';
import theme from '../theme';

const { colors, spacing, radius, shadows, typography } = theme;

// Mock channels for UI testing (no backend required)
const MOCK_CHANNELS = [
  { id: 'air-op-1', name: 'AIR-OP-1', status: 'active', users: 10, transmitting: true },
  { id: 'emergency-sec', name: 'EMERGENCY-SEC', status: 'monitoring', users: 5, transmitting: false },
  { id: 'ground-logs', name: 'GROUND-LOGS', status: 'idle', users: 8, transmitting: false },
  { id: 'outpost-beta', name: 'OUTPOST-BETA', status: 'idle', users: 3, transmitting: false },
  { id: 'tactical-main', name: 'TACTICAL-MAIN', status: 'idle', users: 12, transmitting: false },
];

// Filter Tabs Component
function FilterTabs({ activeFilter, onFilterChange }) {
  const filters = ['ALL', 'ACTIVE', 'STARRED'];
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

// Channel Card Component
function ChannelCard({ channel, onPress, isActive }) {
  return (
    <TouchableOpacity
      style={[styles.channelCard, isActive && styles.channelCardActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.channelHeader}>
        <View style={styles.channelTitleRow}>
          {channel.transmitting && (
            <View style={styles.transmitBadge}>
              <Text style={styles.transmitText}>● ACTIVE TRANSMITTING</Text>
            </View>
          )}
          {!channel.transmitting && channel.status === 'monitoring' && (
            <View style={styles.monitorBadge}>
              <Text style={styles.monitorText}>◐ MONITORING</Text>
            </View>
          )}
        </View>
        <Text style={styles.channelName}>{channel.name}</Text>
        <View style={styles.channelMeta}>
          <Text style={styles.channelUsers}>👤 {channel.users} Operators</Text>
        </View>
      </View>
      <View style={styles.channelActions}>
        <View style={styles.signalBars}>
          <View style={[styles.signalBar, styles.signalBarFull]} />
          <View style={[styles.signalBar, styles.signalBarFull]} />
          <View style={[styles.signalBar, styles.signalBarFull]} />
          <View style={[styles.signalBar, channel.users > 5 ? styles.signalBarFull : styles.signalBarEmpty]} />
        </View>
        {isActive && (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>DISCONNECT</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function ChannelsScreen({ navigation }) {
  const { setCurrent, current } = useContext(ChannelContext);
  const [channels, setChannels] = useState(CONFIG.MOCK_MODE ? MOCK_CHANNELS : []);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!CONFIG.MOCK_MODE) {
      socket.emit('list-channels');
      socket.on('channels', list => setChannels(list));
      return () => socket.off('channels');
    }
  }, []);

  const openChannel = channel => {
    setCurrent(channel);
    navigation.navigate('PTT');
  };

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
      onPress={() => openChannel(item)}
      isActive={current?.id === item.id}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.menuIcon}>☰</Text>
          <Text style={styles.title}>TALKGROUPS</Text>
          <Text style={styles.settingsIcon}>⚙️</Text>
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

      {/* Section Label */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>SYSTEM GROUPS: TACTICAL</Text>
      </View>

      {/* Channel List */}
      <FlatList
        data={filteredChannels}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
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
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.widest,
    fontWeight: typography.weight.medium,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  channelCard: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
});
