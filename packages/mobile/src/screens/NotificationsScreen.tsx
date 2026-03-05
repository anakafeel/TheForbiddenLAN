import React, { useMemo } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import BottomMenu from "../components/BottomMenu";
import { useAppTheme } from "../theme";
import { MOCK_NOTIFICATIONS } from "../data/notifications";

export default function NotificationsScreen({ navigation }: { navigation: any }) {
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notifications</Text>
      <FlatList
        data={MOCK_NOTIFICATIONS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.time}>{item.minutesAgo}m ago</Text>
            </View>
            <Text style={styles.message}>{item.message}</Text>
          </View>
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
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
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
