import React, { useMemo, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import BottomMenu from "../components/BottomMenu";
import { useAppTheme } from "../theme";
import { useStore } from "../store";

function getMinutesAgo(createdAt: number) {
  const deltaMs = Math.max(0, Date.now() - createdAt);
  return Math.floor(deltaMs / 60_000);
}

export default function NotificationsScreen({ navigation }: { navigation: any }) {
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );
  const notifications = useStore((s) => s.notifications);
  const markNotificationRead = useStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useStore((s) => s.markAllNotificationsRead);

  useEffect(() => {
    if (notifications.some((n) => n.unread)) {
      markAllNotificationsRead();
    }
  }, [notifications, markAllNotificationsRead]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notifications</Text>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No real-time notifications yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.card,
              item.severity === "warning" ? styles.cardWarning : styles.cardInfo,
              item.unread && styles.cardUnread,
            ]}
            onPress={() => markNotificationRead(item.id)}
          >
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.time}>{getMinutesAgo(item.createdAt)}m ago</Text>
            </View>
            <Text style={styles.message}>{item.message}</Text>
          </Pressable>
        )}
      />
      <BottomMenu navigation={navigation} active="Notifications" />
    </View>
  );
}

function createStyles(colors: any, spacing: any, radius: any, typography: any) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl + 84,
  },
  title: {
    color: colors.text.primary,
    fontSize: typography.size.xl,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  list: {
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  emptyWrap: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
  },
  cardWarning: {
    borderColor: colors.status.warning,
  },
  cardInfo: {
    borderColor: colors.border.subtle,
  },
  cardUnread: {
    shadowColor: colors.status.info,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  cardTitle: {
    color: colors.text.primary,
    fontSize: typography.size.lg,
    fontWeight: "700",
    flex: 1,
    paddingRight: spacing.sm,
  },
  time: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
  },
  message: {
    color: colors.text.secondary,
    fontSize: typography.size.md,
  },
  });
}
