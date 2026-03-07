import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAppTheme } from "../theme";
import { s } from '../utils/responsive';
import { Mic, TvMinimalPlay, House, UserPen } from "lucide-react-native";

const ITEMS = [
  { key: "Dashboard", Icon: House },
  { key: "Channels", label: "Talk Groups", Icon: TvMinimalPlay },
  { key: "PTT", Icon: Mic },
  { key: "Profile", Icon: UserPen },
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
              <item.Icon size={s(16)} color={iconColor} strokeWidth={2.2} />
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
    fontSize: typography.size.lg,
    marginBottom: 2,
  },
  iconWrap: {
    height: typography.size.lg + 2,
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
