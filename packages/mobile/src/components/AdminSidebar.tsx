// AdminSidebar — web sidebar layout replacing bottom tabs.
// Manages its own active tab state and renders admin screens directly.
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import { useStore } from '../store';

import { AdminDashboard } from '../screens/admin/AdminDashboard';
import { AdminDevices } from '../screens/admin/AdminDevices';
import { AdminTalkgroups } from '../screens/admin/AdminTalkgroups';
import { AdminUsers } from '../screens/admin/AdminUsers';
import { AdminMap } from '../screens/admin/AdminMap';

const TAB_CONFIG = [
  { key: 'Dashboard',  label: 'Dashboard',  icon: '\u25A3' },   // filled square
  { key: 'Devices',    label: 'Devices',     icon: '\u25C8' },   // diamond in square
  { key: 'Talkgroups', label: 'Talkgroups',  icon: '\u25CE' },   // bullseye
  { key: 'Users',      label: 'Users',       icon: '\u25CB' },   // circle
  { key: 'Map',        label: 'Map',         icon: '\u25C7' },   // diamond
];

const SCREEN_MAP = {
  Dashboard: AdminDashboard,
  Devices: AdminDevices,
  Talkgroups: AdminTalkgroups,
  Users: AdminUsers,
  Map: AdminMap,
};

export function AdminSidebar() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const clearAuth = useStore(s => s.clearAuth);
  const user = useStore(s => s.user);
  const ActiveComponent = SCREEN_MAP[activeTab] ?? AdminDashboard;

  return (
    <View style={styles.layout}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        {/* Branding */}
        <View style={styles.brandSection}>
          <Text style={styles.logo}>SkyTalk</Text>
          <Text style={styles.logoSub}>Admin Panel</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Navigation */}
        <View style={styles.navSection}>
          {TAB_CONFIG.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.navItem, isActive && styles.navItemActive]}
              >
                {isActive && <View style={styles.activeIndicator} />}
                <Text style={[styles.navIcon, isActive && styles.navIconActive]}>{tab.icon}</Text>
                <Text style={[styles.navText, isActive && styles.navTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Spacer pushes user info + logout to bottom */}
        <View style={{ flex: 1 }} />

        {/* Divider */}
        <View style={styles.divider} />

        {/* User info + logout */}
        <View style={styles.userSection}>
          {user && (
            <View style={styles.userInfoRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user.username.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{user.username}</Text>
                <Text style={styles.userRole}>{user.role}</Text>
              </View>
            </View>
          )}
          <Pressable onPress={clearAuth} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      {/* Content area with header */}
      <View style={styles.contentWrapper}>
        <View style={styles.contentHeader}>
          <Text style={styles.contentTitle}>{activeTab}</Text>
        </View>
        <View style={styles.content}>
          <ActiveComponent />
        </View>
      </View>
    </View>
  );
}

const SIDEBAR_WIDTH = 240;

const styles = StyleSheet.create({
  layout: { flex: 1, flexDirection: 'row', backgroundColor: colors.background.primary },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.background.secondary,
    paddingVertical: spacing.lg,
    borderRightWidth: 1,
    borderRightColor: colors.border.subtle,
  },
  brandSection: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  logo: {
    color: colors.text.primary,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  logoSub: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.wider,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: spacing.md,
  },
  navSection: {
    paddingHorizontal: spacing.sm,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginBottom: 2,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: 'rgba(37, 55, 70, 0.6)',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.status.active,
  },
  navIcon: {
    color: colors.text.muted,
    fontSize: typography.size.md,
    marginRight: spacing.sm,
    width: 20,
    textAlign: 'center',
  },
  navIconActive: {
    color: colors.status.active,
  },
  navText: {
    color: colors.text.muted,
    fontSize: typography.size.md,
  },
  navTextActive: {
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
  userSection: {
    paddingHorizontal: spacing.lg,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    color: colors.text.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  userName: {
    color: colors.text.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  userRole: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
  },
  logoutBtn: {
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
  },
  logoutText: { color: colors.status.danger, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
  contentWrapper: { flex: 1, flexDirection: 'column' },
  contentHeader: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.background.secondary,
  },
  contentTitle: {
    color: colors.text.primary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  content: { flex: 1 },
});
