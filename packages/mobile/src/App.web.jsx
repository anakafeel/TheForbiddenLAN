import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Platform } from 'react-native';
import { ChannelProvider, useChannel } from './context/ChannelContext';
import theme from './theme';

const { colors, spacing, radius, shadows, typography } = theme;

// Lazy load screens to catch import errors
const ChannelsScreen = React.lazy(() => import('./screens/Channels.jsx'));
const PTTScreen = React.lazy(() => import('./screens/PTTScreen.jsx'));
const VoiceChannelChatPage = React.lazy(() => import('./screens/VoiceChannelChatPage.jsx'));

// Bottom Navigation Bar
function BottomNav({ activeScreen, onNavigate }) {
  const tabs = [
    { id: 'Channels', icon: '📡', label: 'CHANNELS' },
    { id: 'PTT', icon: '🎙️', label: 'PTT' },
    { id: 'Map', icon: '🗺️', label: 'MAP' },
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

// Status Bar Header with network detection
function StatusBar() {
  const [activeNetwork, setActiveNetwork] = React.useState('SATELLITE');
  const [satSignal, setSatSignal] = React.useState(4);
  const [cellSignal, setCellSignal] = React.useState(2);

  // Simulate network detection
  React.useEffect(() => {
    const signals = [1, 2, 3, 4, 5];
    
    // Simulate signal changes
    const interval = setInterval(() => {
      setSatSignal(signals[Math.floor(Math.random() * signals.length)]);
      setCellSignal(signals[Math.floor(Math.random() * signals.length)]);
      // Occasionally switch active network
      if (Math.random() > 0.85) {
        setActiveNetwork(prev => prev === 'SATELLITE' ? 'CELLULAR' : 'SATELLITE');
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const SignalBars = ({ strength, isActive, type }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
      <Text style={{ fontSize: 12, marginRight: 4 }}>{type === 'SAT' ? '📡' : '📶'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        {[1, 2, 3, 4, 5].map(bar => (
          <View
            key={bar}
            style={{
              width: 3,
              height: 4 + bar * 2,
              backgroundColor: bar <= strength 
                ? (isActive ? '#22C55E' : '#666')
                : '#333',
              marginRight: 1,
              borderRadius: 1,
            }}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.statusBar}>
      <View style={styles.statusLeft}>
        <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
        <Text style={styles.statusText}>SKYTALK</Text>
      </View>
      <View style={styles.statusRight}>
        <SignalBars strength={satSignal} isActive={activeNetwork === 'SATELLITE'} type="SAT" />
        <SignalBars strength={cellSignal} isActive={activeNetwork === 'CELLULAR'} type="CELL" />
      </View>
    </View>
  );
}

function AppContent() {
  const [screen, setScreen] = useState('Channels');
  const [routeParams, setRouteParams] = useState({});
  const [error, setError] = useState(null);
  const { current } = useChannel();

  const navigate = (screenName, params = {}) => {
    setScreen(screenName);
    setRouteParams(params);
  };

  const navigation = {
    navigate,
    goBack: () => setScreen('Channels'),
  };

  const route = { params: routeParams };

  // Simple loading fallback
  const LoadingFallback = () => (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Loading...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
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
            ) : screen === 'VoiceChannel' ? (
              <VoiceChannelChatPage navigation={navigation} route={route} />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>{screen} - Coming Soon</Text>
              </View>
            )}
          </React.Suspense>
        </View>
        
        {screen !== 'VoiceChannel' && <BottomNav activeScreen={screen} onNavigate={navigate} />}
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
