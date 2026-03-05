import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import theme from "../theme";

const { colors, spacing, radius, typography } = theme;

const ITEMS = [
  { key: "Dashboard", icon: "⌂" },
  { key: "Channels", icon: "📡" },
  { key: "PTT", icon: "🎙️" },
  { key: "Profile", icon: "👤" },
];

export default function BottomMenu({ navigation, active }) {
  return (
    <View style={styles.wrap}>
      {ITEMS.map((item) => {
        const isActive = active === item.key;
        const forceWhiteIcon = item.key === "Dashboard" || item.key === "Profile";
        return (
          <Pressable
            key={item.key}
            style={({ pressed }) => [styles.item, isActive && styles.itemActive, pressed && styles.itemPressed]}
            onPress={() => navigation.navigate(item.key)}
          >
            <Text style={[styles.icon, forceWhiteIcon && styles.iconWhite]}>{item.icon}</Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>{item.key}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
  iconWhite: {
    color: colors.text.primary,
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
