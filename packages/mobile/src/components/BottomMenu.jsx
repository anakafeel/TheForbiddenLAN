import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useAppTheme } from "../theme";
import { Mic, TvMinimalPlay, House, UserPen } from "lucide-react";

const ITEMS = [
  { key: "Dashboard", Icon: House, fallback: "⌂" },
  { key: "Channels", label: "Talk Groups", Icon: TvMinimalPlay, fallback: "📡" },
  { key: "PTT", Icon: Mic, fallback: "🎙️" },
  { key: "Profile", Icon: UserPen, fallback: "👤" },
];

export default function BottomMenu({ navigation, active }) {
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );

  return (
    <View style={styles.wrap}>
      {ITEMS.map((item) => {
        const isActive = active === item.key;
        const iconColor = isActive ? colors.text.primary : colors.text.muted;
        return (
          <Pressable
            key={item.key}
            style={({ pressed }) => [styles.item, isActive && styles.itemActive, pressed && styles.itemPressed]}
            onPress={() => navigation.navigate(item.key)}
          >
            <View style={styles.iconWrap}>
              {Platform.OS === "web" ? (
                <item.Icon size={16} color={iconColor} strokeWidth={2.2} />
              ) : (
                <Text style={styles.icon}>{item.fallback}</Text>
              )}
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {item.label ?? item.key}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors, spacing, radius, typography) {
  return StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  item: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
  },
  itemActive: {
    backgroundColor: colors.accent.primary,
  },
  itemPressed: {
    opacity: 0.85,
  },
  icon: {
    fontSize: 16,
    marginBottom: 2,
  },
  iconWrap: {
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  label: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  labelActive: {
    color: colors.text.primary,
    fontWeight: typography.weight.bold,
  },
  });
}
