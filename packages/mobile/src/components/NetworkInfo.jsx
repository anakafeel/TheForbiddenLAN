import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAppTheme } from '../theme';
import {
  getBarsFromPercent,
  getSignalColor,
  getSignalStrengthFromPercent,
} from '../utils/signalStrength';

export default function NetworkInfo() {
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );
  const [state, setState] = useState({ type: 'unknown', isConnected: false });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(info => {
      setState(info);
    });
    return unsubscribe;
  }, []);

  const signalPercent = useMemo(() => {
    if (!state.isConnected) return 0;
    const rawStrength = state?.details?.strength;
    if (typeof rawStrength === 'number' && Number.isFinite(rawStrength)) {
      if (rawStrength > 0) return Math.max(0, Math.min(100, rawStrength));
      // Typical dBm range normalization for mobile UI
      if (rawStrength <= -120) return 0;
      if (rawStrength >= -50) return 100;
      return Math.round(((rawStrength + 120) / 70) * 100);
    }
    if (state.type === 'wifi') return 85;
    if (state.type === 'cellular') return 62;
    return 48;
  }, [state]);

  const signalStrength = getSignalStrengthFromPercent(signalPercent);
  const activeBars = getBarsFromPercent(signalPercent, 4);
  const signalColor = getSignalColor(signalStrength, colors);

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, state.isConnected && styles.statusDotActive]} />
        <Text style={styles.statusLabel}>NETWORK STATUS:</Text>
        <View style={[styles.statusBadge, !state.isConnected && styles.statusBadgeOffline]}>
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
                  i <= activeBars && [styles.signalBarActive, { backgroundColor: signalColor }],
                ]}
              />
            ))}
          </View>
          <Text style={[styles.signalStrengthText, { color: signalColor }]}>
            {signalStrength.toUpperCase()}
          </Text>
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

function createStyles(colors, spacing, radius, typography) {
  return StyleSheet.create({
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
    statusBadgeOffline: {
      backgroundColor: colors.background.tertiary,
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
    signalStrengthText: {
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
      marginTop: spacing.xs,
    },
  });
}
