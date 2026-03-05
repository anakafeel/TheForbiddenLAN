import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import BottomMenu from "../components/BottomMenu";
import theme from "../theme";
import { MOCK_NOTIFICATIONS, getUnreadCount } from "../data/notifications";

const { colors, spacing, radius, typography } = theme;

const ACTIVE_USERS = [
  { id: "u1", name: "ECHO-1", status: "ACTIVE", channel: "Tactical-Main" },
  { id: "u2", name: "BRAVO-2", status: "ACTIVE", channel: "Recon-Units" },
  { id: "u3", name: "CHARLIE-3", status: "IDLE", channel: "HQ-Command" },
  { id: "u4", name: "DELTA-4", status: "ACTIVE", channel: "Tactical-Main" },
  { id: "u5", name: "FOXTROT-5", status: "IDLE", channel: "Recon-Units" },
];

function StatusCard({
  label,
  value,
  metric,
  bars,
  isActive,
}: {
  label: string;
  value: string;
  metric: string;
  bars: number;
  isActive?: boolean;
}) {
  return (
    <View style={[styles.signalCard, isActive && styles.signalCardActive]}>
      <View style={styles.signalTopRow}>
        <Text style={styles.signalLabel}>{label}</Text>
        <View style={styles.barsWrap}>
          {[1, 2, 3, 4].map((n) => (
            <View
              key={`${label}-${n}`}
              style={[
                styles.signalBar,
                { height: 5 + n * 4 },
                n <= bars ? styles.signalBarOn : styles.signalBarOff,
              ]}
            />
          ))}
        </View>
      </View>
      <Text style={styles.signalValue}>{value}</Text>
      <Text style={styles.signalMetric}>{metric}</Text>
    </View>
  );
}

export default function DashboardScreen({ navigation }: { navigation: any }) {
  const unread = getUnreadCount();
  const activeNotifications = MOCK_NOTIFICATIONS.filter((n) => n.unread).slice(0, 2);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Dashboard</Text>
          <Text style={styles.helper}>Live Ops Overview</Text>
        </View>

        <View style={styles.topGrid}>
          <Pressable style={styles.usersPanel} onPress={() => navigation.navigate("Channels")}>
            <Text style={styles.usersPanelTitle}>Active Users</Text>
            <View style={styles.usersList}>
              {ACTIVE_USERS.map((user) => (
                <View key={user.id} style={styles.userRow}>
                  <View style={styles.userRowLeft}>
                    <View style={[styles.userDot, user.status === "ACTIVE" ? styles.userDotActive : styles.userDotIdle]} />
                    <View>
                      <Text style={styles.userName}>{user.name}</Text>
                      <Text style={styles.userChannel}>{user.channel}</Text>
                    </View>
                  </View>
                  <Text style={styles.userStatus}>{user.status}</Text>
                </View>
              ))}
            </View>
          </Pressable>

          <View style={styles.signalColumn}>
            <StatusCard label="Satellite" value="Strong" metric="+99% Latency Opt." bars={4} isActive />
            <StatusCard label="Cellular" value="Optimal" metric="+95% Signal" bars={3} />
          </View>
        </View>

        <View style={styles.notificationsHeader}>
          <Text style={styles.notificationsTitle}>Notifications</Text>
          <Pressable style={styles.activeBadge} onPress={() => navigation.navigate("Notifications")}>
            <Text style={styles.activeBadgeText}>{unread} Active</Text>
          </Pressable>
        </View>

        <View style={styles.notificationsPanel}>
          {activeNotifications.map((n) => (
            <Pressable key={n.id} style={styles.notificationCard} onPress={() => navigation.navigate("Notifications")}>
              <View style={[styles.notificationIcon, n.severity === "warning" ? styles.notificationWarn : styles.notificationInfo]}>
                <Text style={styles.notificationIconText}>{n.severity === "warning" ? "⚠" : "i"}</Text>
              </View>
              <View style={styles.notificationCopy}>
                <Text style={styles.notificationTitle}>{n.title}</Text>
                <Text style={styles.notificationMessage}>{n.message}</Text>
              </View>
              <Text style={styles.notificationTime}>{n.minutesAgo}m ago</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <BottomMenu navigation={navigation} active="Dashboard" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    paddingBottom: spacing.xxl + 84,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  helper: {
    color: colors.text.secondary,
    fontSize: 10,
  },
  topGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.md,
  },
  usersPanel: {
    flex: 1.2,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
  },
  usersPanelTitle: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  usersList: {
    gap: spacing.sm,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  userRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  userDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  userDotActive: {
    backgroundColor: colors.status.active,
  },
  userDotIdle: {
    backgroundColor: colors.text.muted,
  },
  userName: {
    color: colors.text.primary,
    fontSize: typography.size.md,
    fontWeight: "700",
  },
  userChannel: {
    color: colors.text.secondary,
    fontSize: typography.size.xs,
  },
  userStatus: {
    color: colors.text.secondary,
    fontSize: 10,
    fontWeight: "700",
  },
  signalColumn: {
    flex: 0.95,
    gap: spacing.md,
    alignSelf: "stretch",
  },
  signalCard: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    justifyContent: "space-between",
  },
  signalCardActive: {
    borderColor: colors.status.active,
    shadowColor: colors.status.active,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  signalTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  barsWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  signalBar: {
    width: 4,
    borderRadius: 2,
  },
  signalBarOn: {
    backgroundColor: colors.status.active,
  },
  signalBarOff: {
    backgroundColor: colors.text.muted,
    opacity: 0.35,
  },
  signalLabel: {
    color: colors.text.muted,
    fontSize: typography.size.md,
    marginBottom: spacing.xs,
  },
  signalValue: {
    color: colors.text.primary,
    fontSize: typography.size.xxxl,
    fontWeight: "800",
  },
  signalMetric: {
    color: colors.status.active,
    fontSize: typography.size.lg,
    fontWeight: "700",
  },
  notificationsHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  notificationsTitle: {
    color: colors.text.muted,
    fontSize: typography.size.xl,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  activeBadge: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  activeBadgeText: {
    color: colors.status.warning,
    fontWeight: "700",
    fontSize: typography.size.md,
  },
  notificationsPanel: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.md,
    gap: spacing.md,
  },
  notificationCard: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  notificationIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationWarn: {
    backgroundColor: colors.status.warningGlow,
  },
  notificationInfo: {
    backgroundColor: colors.status.infoGlow,
  },
  notificationIconText: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: "700",
  },
  notificationCopy: {
    flex: 1,
  },
  notificationTitle: {
    color: colors.text.primary,
    fontSize: typography.size.lg,
    fontWeight: "700",
  },
  notificationMessage: {
    color: colors.text.secondary,
    fontSize: typography.size.md,
  },
  notificationTime: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    fontWeight: "700",
  },
});
