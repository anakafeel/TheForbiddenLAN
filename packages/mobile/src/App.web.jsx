import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Platform } from 'react-native';
import { ChannelProvider, useChannel } from './context/ChannelContext';
import theme from './theme';

const { colors, spacing, radius, shadows, typography } = theme;

// Lazy load screens to catch import errors
const ChannelsScreen = React.lazy(() => import('./screens/Channels.jsx'));
const PTTScreen = React.lazy(() => import('./screens/PTTScreen.jsx'));

// Bottom Navigation Bar
function BottomNav({ activeScreen, onNavigate }) {
  const tabs = [
    { id: 'Channels', icon: '📡', label: 'CHANNELS' },
    { id: 'PTT', icon: '🎙️', label: 'PTT' },
    { id: 'Map', icon: '🗺️', label: 'MAP' },
    { id: 'Settings', icon: '⚙️', label: 'SETTINGS' },
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.id}
          style={[styles.navItem, activeScreen === tab.id && styles.navItemActive]}
          onPress={() => onNavigate(tab.id)}
        >
          <Text style={styles.navIcon}>{tab.icon}</Text>
          <Text style={[styles.navLabel, activeScreen === tab.id && styles.navLabelActive]}>
            {tab.label}
          </Text>
          {activeScreen === tab.id && <View style={styles.navIndicator} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Status Bar Header
function StatusBar() {
  return (
    <View style={styles.statusBar}>
      <View style={styles.statusLeft}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>SYSTEM</Text>
        <Text style={styles.statusLabel}>FORBIDDEN LAN</Text>
      </View>
      <View style={styles.statusRight}>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>🔒 ENCRYPTED</Text>
        </View>
        <Text style={styles.statusTime}>SAT-LINK</Text>
      </View>
    </View>
  );
}

function AppContent() {
  const [screen, setScreen] = useState('Channels');
  const [error, setError] = useState(null);
  const { current } = useChannel();

  const navigate = (screenName) => {
    setScreen(screenName);
  };

  const navigation = {
    navigate,
    goBack: () => setScreen('Channels'),
  };

  // Simple loading fallback
  const LoadingFallback = () => (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Loading...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Debug element - remove after testing */}
      <Text style={{ color: '#FF00FF', fontSize: 20, padding: 10, backgroundColor: '#222' }}>
        DEBUG: React is rendering
      </Text>
      
      {/* Background gradient overlay */}
      <View style={styles.backgroundGradient} />
      
      <SafeAreaView style={styles.safeArea}>
        <StatusBar />
        
        <View style={styles.content}>
          <React.Suspense fallback={<LoadingFallback />}>
            {screen === 'Channels' ? (
              <ChannelsScreen navigation={navigation} />
            ) : screen === 'PTT' ? (
              <PTTScreen navigation={navigation} />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>{screen} - Coming Soon</Text>
              </View>
            )}
          </React.Suspense>
        </View>
        
        <BottomNav activeScreen={screen} onNavigate={navigate} />
      </SafeAreaView>
    </View>
  );
}

export default function AppWeb() {
  console.log('AppWeb rendering');
  return (
    <ChannelProvider>
      <AppContent />
    </ChannelProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background.primary,
    // Radial gradient effect using multiple layers
  },
  safeArea: {
    flex: 1,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.background.secondary,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.status.active,
    marginRight: spacing.sm,
  },
  statusText: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.wider,
  },
  statusLabel: {
    color: colors.text.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    backgroundColor: colors.status.active,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  statusBadgeText: {
    color: colors.text.inverse,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  statusTime: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
  },
  content: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: colors.text.muted,
    fontSize: typography.size.lg,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.background.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.sm,
    paddingTop: spacing.sm,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  navItemActive: {
    // Active state styling handled by children
  },
  navIcon: {
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  navLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.wide,
    fontWeight: typography.weight.medium,
  },
  navLabelActive: {
    color: colors.accent.primary,
  },
  navIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 2,
    backgroundColor: colors.accent.primary,
    borderRadius: 1,
  },
});
