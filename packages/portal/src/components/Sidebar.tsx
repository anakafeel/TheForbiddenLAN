import { router, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

const navItems = [
  { label: 'Dashboard', href: '/' },
  { label: 'Map', href: '/map' },
  { label: 'Channels', href: '/channels' },
  { label: 'Devices', href: '/devices' },
  { label: 'Users', href: '/users' },
] as const;

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <View style={styles.sidebar}>
      <View style={styles.header}>
        <Text style={styles.brand}>ForbiddenLAN</Text>
        <Text style={styles.subtitle}>Operations Portal</Text>
      </View>

      <View style={styles.navSection}>
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Pressable
              key={item.href}
              onPress={() => router.push(item.href)}
              style={active ? styles.navItemActiveState : styles.navItem}
            >
              <Text style={active ? styles.navTextActiveState : styles.navText}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Network Core</Text>
        <Text style={styles.footerValue}>SYNCED</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: theme.layout.sidebarWidth,
    backgroundColor: theme.colors.bgSidebar,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  header: {
    marginBottom: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  brand: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    marginTop: theme.spacing.xs,
    letterSpacing: 0.4,
  },
  navSection: {
    gap: theme.spacing.xs,
  },
  navItem: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  navItemActiveState: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: 8,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  navText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body,
    fontWeight: '600',
  },
  navTextActiveState: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
    fontWeight: '600',
  },
  footer: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
  },
  footerLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
  },
  footerValue: {
    marginTop: theme.spacing.xs,
    color: theme.colors.success,
    fontSize: theme.typography.body,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
