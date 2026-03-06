import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  Switch,
  ScrollView,
  Pressable,
} from "react-native";
import BottomMenu from "../components/BottomMenu";
import { useAppTheme } from "../theme";
import { useStore } from "../store";
import { CONFIG } from "../config";

function getInitials(name: string) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "OP";
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function ProfileScreen({ navigation }: { navigation: any }) {
  const {
    colors,
    spacing,
    radius,
    typography,
    themeMode,
    setThemeMode,
  } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );

  const user = useStore((s) => s.user);
  const clearAuth = useStore((s) => s.clearAuth);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const soundsEnabled = useStore((s) => s.soundsEnabled);
  const setSoundsEnabled = useStore((s) => s.setSoundsEnabled);
  const preferredConnection = useStore((s) => s.preferredConnection);
  const setPreferredConnection = useStore((s) => s.setPreferredConnection);

  const [form, setForm] = useState(profile);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setForm(profile);
  }, [profile]);

  useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(null), 2200);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const resolvedName = form.displayName.trim() || user?.username || "Operator";
  const resolvedCallsign = form.callsign.trim() || "UNASSIGNED";
  const roleLabel = user?.role === "admin" ? "Administrator" : "Field Operator";
  const statusMessage =
    form.statusMessage.trim() || "No status set. Add one in the profile form.";
  const hasUnsavedChanges =
    form.displayName !== profile.displayName ||
    form.callsign !== profile.callsign ||
    form.photoUrl !== profile.photoUrl ||
    form.unit !== profile.unit ||
    form.statusMessage !== profile.statusMessage;

  const updateField = (
    key: "displayName" | "callsign" | "photoUrl" | "unit" | "statusMessage",
    value: string,
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveProfile = () => {
    setProfile({
      displayName: form.displayName.trim(),
      callsign: form.callsign.trim().toUpperCase(),
      photoUrl: form.photoUrl.trim(),
      unit: form.unit.trim(),
      statusMessage: form.statusMessage.trim(),
    });
    setSavedAt(Date.now());
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Text style={styles.headerSubtitle}>
            Local settings and operator identity
          </Text>
        </View>

        <View style={styles.heroCard}>
          {form.photoUrl.trim() ? (
            <Image source={{ uri: form.photoUrl.trim() }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackText}>
                {getInitials(resolvedName)}
              </Text>
            </View>
          )}
          <Text style={styles.heroName}>{resolvedName}</Text>
          <Text style={styles.heroMeta}>{resolvedCallsign}</Text>
          <Text style={styles.heroStatus}>{statusMessage}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Identity</Text>
          <TextInput
            value={form.displayName}
            onChangeText={(value) => updateField("displayName", value)}
            placeholder="Display name"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
          />
          <TextInput
            value={form.callsign}
            onChangeText={(value) => updateField("callsign", value)}
            placeholder="Callsign"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="characters"
            style={styles.input}
          />
          <TextInput
            value={form.unit}
            onChangeText={(value) => updateField("unit", value)}
            placeholder="Unit / Team"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
          />
          <TextInput
            value={form.statusMessage}
            onChangeText={(value) => updateField("statusMessage", value)}
            placeholder="Status message"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
          />
          <TextInput
            value={form.photoUrl}
            onChangeText={(value) => updateField("photoUrl", value)}
            placeholder="Avatar image URL (optional)"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Preferences</Text>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>PTT sounds</Text>
              <Text style={styles.settingDetail}>Play tone when talking starts</Text>
            </View>
            <Switch
              value={soundsEnabled}
              onValueChange={setSoundsEnabled}
              trackColor={{
                false: colors.border.subtle,
                true: colors.accent.primaryLight,
              }}
              thumbColor={colors.text.primary}
            />
          </View>

          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>Theme</Text>
              <Text style={styles.settingDetail}>
                {themeMode === "dark" ? "Dark mode" : "Light mode"}
              </Text>
            </View>
            <Switch
              value={themeMode === "dark"}
              onValueChange={(enabled) =>
                setThemeMode(enabled ? "dark" : "light")
              }
              trackColor={{
                false: colors.border.subtle,
                true: colors.accent.primaryLight,
              }}
              thumbColor={colors.text.primary}
            />
          </View>

          <Text style={styles.settingLabel}>Preferred link</Text>
          <View style={styles.segmented}>
            {(["cellular", "satellite"] as const).map((mode) => {
              const active = preferredConnection === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setPreferredConnection(mode)}
                  style={[
                    styles.segment,
                    active && styles.segmentActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      active && styles.segmentTextActive,
                    ]}
                  >
                    {mode.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Username</Text>
            <Text style={styles.metaValue}>{user?.username || "-"}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Role</Text>
            <Text style={styles.metaValue}>{roleLabel}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>User ID</Text>
            <Text style={styles.metaValue}>{user?.sub || "-"}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Device ID</Text>
            <Text style={styles.metaValue}>{CONFIG.DEVICE_ID}</Text>
          </View>
        </View>

        {savedAt ? (
          <Text style={styles.savedBanner}>Profile saved locally.</Text>
        ) : null}

        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={saveProfile}
            disabled={!hasUnsavedChanges}
            style={[
              styles.primaryButton,
              !hasUnsavedChanges && styles.primaryButtonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>Save Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={clearAuth}>
            <Text style={styles.logoutButtonText}>Log out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BottomMenu navigation={navigation} active="Profile" />
    </View>
  );
}

function createStyles(colors: any, spacing: any, radius: any, typography: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xxl + 94,
      gap: spacing.md,
    },
    header: {
      marginBottom: spacing.xs,
    },
    headerTitle: {
      color: colors.text.primary,
      fontSize: typography.size.xxl,
      fontWeight: typography.weight.bold,
    },
    headerSubtitle: {
      marginTop: 2,
      color: colors.text.muted,
      fontSize: typography.size.sm,
    },
    heroCard: {
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.xl,
      padding: spacing.lg,
      alignItems: "center",
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 2,
      borderColor: colors.border.medium,
      marginBottom: spacing.md,
    },
    avatarFallback: {
      backgroundColor: colors.background.tertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarFallbackText: {
      color: colors.text.primary,
      fontSize: typography.size.xl,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.wide,
    },
    heroName: {
      color: colors.text.primary,
      fontSize: typography.size.xl,
      fontWeight: typography.weight.bold,
    },
    heroMeta: {
      marginTop: 2,
      color: colors.text.accent,
      fontSize: typography.size.sm,
      letterSpacing: typography.letterSpacing.wider,
      fontWeight: typography.weight.semibold,
    },
    heroStatus: {
      marginTop: spacing.sm,
      color: colors.text.secondary,
      textAlign: "center",
      fontSize: typography.size.sm,
    },
    card: {
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.xl,
      padding: spacing.md,
    },
    cardTitle: {
      color: colors.text.muted,
      fontSize: typography.size.xs,
      letterSpacing: typography.letterSpacing.wider,
      fontWeight: typography.weight.bold,
      marginBottom: spacing.sm,
      textTransform: "uppercase",
    },
    input: {
      width: "100%",
      backgroundColor: colors.background.tertiary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.md,
      color: colors.text.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.sm,
      fontSize: typography.size.md,
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.background.tertiary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.sm,
      gap: spacing.sm,
    },
    settingLabel: {
      color: colors.text.primary,
      fontSize: typography.size.md,
      fontWeight: typography.weight.semibold,
    },
    settingDetail: {
      marginTop: 2,
      color: colors.text.muted,
      fontSize: typography.size.xs,
    },
    segmented: {
      marginTop: spacing.sm,
      flexDirection: "row",
      gap: spacing.sm,
    },
    segment: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: "center",
      backgroundColor: colors.background.tertiary,
    },
    segmentActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    segmentText: {
      color: colors.text.muted,
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.wide,
    },
    segmentTextActive: {
      color: colors.text.primary,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    metaKey: {
      color: colors.text.muted,
      fontSize: typography.size.sm,
    },
    metaValue: {
      flexShrink: 1,
      color: colors.text.primary,
      fontSize: typography.size.sm,
      fontWeight: typography.weight.semibold,
      textAlign: "right",
      marginLeft: spacing.md,
    },
    savedBanner: {
      color: colors.status.active,
      fontSize: typography.size.sm,
      fontWeight: typography.weight.semibold,
      textAlign: "center",
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    primaryButton: {
      flex: 1,
      backgroundColor: colors.accent.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: "center",
    },
    primaryButtonDisabled: {
      opacity: 0.45,
    },
    primaryButtonText: {
      color: colors.text.primary,
      fontSize: typography.size.md,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.wide,
    },
    logoutButton: {
      flex: 1,
      backgroundColor: colors.status.danger,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: "center",
    },
    logoutButtonText: {
      color: colors.text.primary,
      fontSize: typography.size.md,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.wide,
    },
  });
}
