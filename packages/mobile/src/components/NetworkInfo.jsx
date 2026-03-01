import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { CONFIG } from '../config';
import theme from '../theme';

const { colors, spacing, radius, shadows, typography } = theme;

let Icon;
if (Platform.OS !== 'web') {
  Icon = require('react-native-vector-icons/MaterialCommunityIcons').default;
}

export default function NetworkInfo() {
  const [state, setState] = useState({ type: 'unknown', isConnected: false });

  useEffect(() => {
    if (CONFIG.MOCK_MODE) {
      setState({
        type: 'satellite',
        isConnected: true,
        details: {
          strength: -40,
        },
      });
    } else {
      const unsubscribe = NetInfo.addEventListener(info => {
        setState(info);
      });
      return unsubscribe;
    }
  }, []);

  const getSignalIcon = () => {
    if (state.type === 'wifi') return '📶';
    if (state.type === 'cellular') return '📱';
    return '📡';
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, state.isConnected && styles.statusDotActive]} />
        <Text style={styles.statusLabel}>NETWORK STATUS:</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>
            {state.isConnected ? 'CONNECTED' : 'OFFLINE'}
          </Text>
        </View>
      </View>
      
      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>TYPE</Text>
          <Text style={styles.infoValue}>{state.type.toUpperCase()}</Text>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>SIGNAL</Text>
          <View style={styles.signalBars}>
            {[1, 2, 3, 4].map(i => (
              <View
                key={i}
                style={[
                  styles.signalBar,
                  { height: 4 + i * 4 },
                  i <= 3 && styles.signalBarActive
                ]}
              />
            ))}
          </View>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>LATENCY</Text>
          <Text style={styles.infoValue}>42ms</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background.card,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.status.danger,
    marginRight: spacing.sm,
  },
  statusDotActive: {
    backgroundColor: colors.status.active,
  },
  statusLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.wider,
    marginRight: spacing.sm,
  },
  statusBadge: {
    backgroundColor: colors.status.active,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  statusBadgeText: {
    color: colors.text.inverse,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
  },
  infoLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.wide,
    marginBottom: spacing.xs,
  },
  infoValue: {
    color: colors.text.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  infoDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border.subtle,
  },
  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  signalBar: {
    width: 4,
    backgroundColor: colors.text.muted,
    borderRadius: 1,
    opacity: 0.3,
    marginRight: 2,
  },
  signalBarActive: {
    backgroundColor: colors.accent.primary,
    opacity: 1,
  },
});
