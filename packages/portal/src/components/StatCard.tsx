import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'danger';
}

export function StatCard({ label, value, hint, tone = 'default' }: StatCardProps) {
  const toneStyle =
    tone === 'good'
      ? styles.goodCard
      : tone === 'warn'
        ? styles.warnCard
        : tone === 'danger'
          ? styles.dangerCard
          : styles.card;

  return (
    <View style={toneStyle}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 112,
    minWidth: 190,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.md,
    justifyContent: 'space-between',
  },
  goodCard: {
    minHeight: 112,
    minWidth: 190,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.success,
    borderWidth: 1,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.md,
    justifyContent: 'space-between',
  },
  warnCard: {
    minHeight: 112,
    minWidth: 190,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.warning,
    borderWidth: 1,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.md,
    justifyContent: 'space-between',
  },
  dangerCard: {
    minHeight: 112,
    minWidth: 190,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.danger,
    borderWidth: 1,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.md,
    justifyContent: 'space-between',
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  value: {
    color: theme.colors.textPrimary,
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 34,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
  },
});
