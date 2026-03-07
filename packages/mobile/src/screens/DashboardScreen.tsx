import React, { useMemo, useEffect, useState, useCallback, useRef, useContext } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch } from "react-native";
import BottomMenu from "../components/BottomMenu";
import { useAppTheme } from "../theme";
import { hp, s } from '../utils/responsive';
import { useStore, type ConnectionMode } from "../store";
import { comms } from "../utils/comms";
import { CONFIG } from "../config";
import { ChannelContext } from "../context/ChannelContext";
import { joinChannel } from "../utils/socket";
import {
  getSignalColor,
  getSignalStrengthFromBars,
  getSignalStrengthFromPercent,
  getBarsFromPercent,
} from "../utils/signalStrength";

type Talkgroup = {
  id: string;
  name: string;
  discord_channel_id?: string | null;
  discordChannelId?: string | null;
  discord_channel_url?: string | null;
  discordChannelUrl?: string | null;
};

type TalkgroupMember = {
  id: string;
  username: string;
  displayName?: string;
  photoUrl?: string;
};

type ActiveUserRow = {
  key: string;
  userId: string;
  displayName: string;
  channelId: string;
  channelName: string;
};

function formatUserLabel(userId: string, localUserId?: string | null) {
  if (!userId) return "UNKNOWN";
  if (localUserId && userId === localUserId) return "YOU";
  if (userId.length <= 20) return userId;
  return `${userId.slice(0, 8)}...${userId.slice(-6)}`;
}

function getMinutesAgo(createdAt: number) {
  const deltaMs = Math.max(0, Date.now() - createdAt);
  return Math.floor(deltaMs / 60_000);
}

function formatLinkLabel(strength: "strong" | "weak" | "none") {
  if (strength === "strong") return "Strong";
  if (strength === "weak") return "Weak";
  return "Offline";
}

function formatDataUsage(kb: number) {
  const safe = Math.max(0, Number(kb) || 0);
  if (safe >= 1024 * 1024) return `${(safe / (1024 * 1024)).toFixed(1)} GB`;
  if (safe >= 1024) return `${(safe / 1024).toFixed(1)} MB`;
  return `${Math.round(safe)} KB`;
}


function StatusCard({
  label,
  value,
  metric,
  bars,
  colors,
  strength,
  isActive,
  onPress,
  styles,
}: {
  label: string;
  value: string;
  metric: string;
  bars: number;
  colors: any;
  strength?: "strong" | "weak" | "none";
  isActive?: boolean;
  onPress?: () => void;
  styles: any;
}) {
  const resolvedStrength = strength ?? getSignalStrengthFromBars(bars, 4);
  const signalColor = getSignalColor(resolvedStrength, colors);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.bentoCard,
        styles.signalCard,
        isActive && styles.signalCardActive,
        isActive && { borderColor: signalColor, shadowColor: signalColor },
        pressed && styles.signalCardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.signalTopRow}>
        <Text style={styles.signalLabel}>{label}</Text>
        <View style={styles.barsWrap}>
          {[1, 2, 3, 4].map((n) => (
            <View
              key={`${label}-${n}`}
              style={[
                styles.signalBar,
                { height: 5 + n * 4 },
                n <= bars ? [styles.signalBarOn, { backgroundColor: signalColor }] : styles.signalBarOff,
              ]}
            />
          ))}
        </View>
      </View>
      <Text style={styles.signalValue}>{value}</Text>
      <Text style={[styles.signalMetric, { color: signalColor }]}>{metric}</Text>
    </Pressable>
  );
}

export default function DashboardScreen({ navigation }: { navigation: any }) {
  const { colors, spacing, radius, typography, themeMode, setThemeMode } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );

  const notifications = useStore((s) => s.notifications);
  const unread = notifications.filter((n) => n.unread).length;
  const notificationFeed = notifications.slice(0, 8);
  const jwt = useStore((s) => s.jwt);
  const user = useStore((s) => s.user);
  const setActiveTalkgroup = useStore((s) => s.setActiveTalkgroup);
  const signalStatus = useStore((s) => s.signalStatus);
  const setPreferredConnection = useStore((s) => s.setPreferredConnection);
  const { current, setCurrent } = useContext(ChannelContext as any) as {
    current: { id: string; name: string } | null;
    setCurrent: (channel: any) => void;
  };

  const [talkgroups, setTalkgroups] = useState<Talkgroup[]>([]);
  const [presenceByTalkgroup, setPresenceByTalkgroup] = useState<Record<string, string[]>>({});
  const [membersById, setMembersById] = useState<Record<string, TalkgroupMember>>({});

  const mountedRef = useRef(true);

  const selectConnection = (mode: ConnectionMode) => {
    setPreferredConnection(mode);
    // Switch actual transport — 'satellite' maps to 'satcom' in the comms SDK
    comms.setTransportMode(mode === 'satellite' ? 'satcom' : 'cellular');
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!jwt) {
      setTalkgroups([]);
      setPresenceByTalkgroup({});
      setMembersById({});
      return;
    }

    let cancelled = false;

    const hydrateTalkgroups = async () => {
      try {
        const res = await fetch(`${CONFIG.API_URL}/talkgroups`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch talkgroups: ${res.status}`);

        const data = await res.json();
        const rawTalkgroups = Array.isArray(data?.talkgroups)
          ? data.talkgroups
          : Array.isArray(data)
            ? data
            : [];

        const mappedTalkgroups: Talkgroup[] = rawTalkgroups
          .filter((tg: any) => tg && tg.id && tg.name)
          .map((tg: any) => ({
            id: String(tg.id),
            name: String(tg.name),
            discord_channel_id:
              typeof tg.discord_channel_id === "string" ? tg.discord_channel_id : null,
            discordChannelId:
              typeof tg.discordChannelId === "string" ? tg.discordChannelId : null,
            discord_channel_url:
              typeof tg.discord_channel_url === "string" ? tg.discord_channel_url : null,
            discordChannelUrl:
              typeof tg.discordChannelUrl === "string" ? tg.discordChannelUrl : null,
          }));

        if (cancelled || !mountedRef.current) return;

        setTalkgroups(mappedTalkgroups);
        setPresenceByTalkgroup((prev) => {
          const next: Record<string, string[]> = {};
          mappedTalkgroups.forEach((tg) => {
            next[tg.id] = prev[tg.id] ?? [];
          });
          return next;
        });

        mappedTalkgroups.forEach((tg) => {
          comms.joinTalkgroup(tg.id);
        });

        const memberChunks = await Promise.all(
          mappedTalkgroups.map(async (tg) => {
            try {
              const membersRes = await fetch(`${CONFIG.API_URL}/talkgroups/${tg.id}/members`, {
                headers: { Authorization: `Bearer ${jwt}` },
              });
              if (!membersRes.ok) return [];
              const membersData = await membersRes.json();
              return Array.isArray(membersData?.members) ? membersData.members : [];
            } catch {
              return [];
            }
          }),
        );

        if (cancelled || !mountedRef.current) return;

        const mergedMembers: Record<string, TalkgroupMember> = {};
        memberChunks.flat().forEach((member: any) => {
          if (!member?.id) return;
          const userId = String(member.id);
          const profile = member?.profile && typeof member.profile === "object"
            ? member.profile
            : {};
          mergedMembers[userId] = {
            id: userId,
            username: typeof member.username === "string" ? member.username : userId,
            displayName:
              typeof profile.display_name === "string" && profile.display_name.trim()
                ? profile.display_name.trim()
                : undefined,
            photoUrl:
              typeof profile.photo_url === "string" && profile.photo_url.trim()
                ? profile.photo_url.trim()
                : undefined,
          };
        });

        setMembersById(mergedMembers);
      } catch (err) {
        console.warn("[Dashboard] Failed to hydrate active users panel:", err);
        if (!cancelled && mountedRef.current) {
          setTalkgroups([]);
          setPresenceByTalkgroup({});
          setMembersById({});
        }
      }
    };

    hydrateTalkgroups();

    return () => {
      cancelled = true;
    };
  }, [jwt]);

  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (!mountedRef.current || !msg || msg.type !== "PRESENCE") return;
      if (!msg.talkgroup) return;

      const talkgroupId = String(msg.talkgroup);
      const online: string[] = Array.isArray(msg.online)
        ? Array.from(
            new Set<string>(
              msg.online
                .map((u: any) => String(u))
                .filter((u: string) => u.length > 0),
            ),
          )
        : [];

      setPresenceByTalkgroup((prev) => ({
        ...prev,
        [talkgroupId]: online,
      }));
    };

    try {
      comms.onMessage(handleMessage);
    } catch (err) {
      console.warn("[Dashboard] Presence listener unavailable:", err);
    }
  }, []);

  const activeUsers = useMemo<ActiveUserRow[]>(() => {
    if (talkgroups.length === 0) return [];

    const users: ActiveUserRow[] = [];
    const seen = new Set<string>();

    talkgroups.forEach((tg) => {
      const onlineUsers = presenceByTalkgroup[tg.id] ?? [];
      if (!Array.isArray(onlineUsers) || onlineUsers.length === 0) return;

      onlineUsers.forEach((userId) => {
        const localUserId = user?.sub ? String(user.sub) : null;
        if (localUserId && String(userId) === localUserId) return;
        const rowKey = `${tg.id}:${userId}`;
        if (seen.has(rowKey)) return;
        seen.add(rowKey);

        const member = membersById[userId];
        users.push({
          key: rowKey,
          userId,
          displayName:
            member?.displayName ||
            member?.username ||
            formatUserLabel(userId, user?.sub ?? null),
          channelId: tg.id,
          channelName: tg.name,
        });
      });
    });

    users.sort((a, b) => {
      if (a.channelName === b.channelName) {
        return a.displayName.localeCompare(b.displayName);
      }
      return a.channelName.localeCompare(b.channelName);
    });

    return users;
  }, [
    talkgroups,
    presenceByTalkgroup,
    membersById,
    user?.sub,
  ]);

  const handleUserPress = useCallback((activeUser: ActiveUserRow) => {
    const selectedChannel = {
      id: activeUser.channelId,
      name: activeUser.channelName,
      status: "active",
      users: null,
      transmitting: false,
    };

    setCurrent(selectedChannel as any);
    setActiveTalkgroup(activeUser.channelId);
    joinChannel(activeUser.channelId);
    navigation.navigate("PTT");
  }, [navigation, setActiveTalkgroup, setCurrent]);

  const satStrength = getSignalStrengthFromBars(signalStatus.certusDataBars, 5);
  const cellStrength = getSignalStrengthFromPercent(signalStatus.cellularSignal);
  const satBars = Math.max(
    0,
    Math.min(4, Math.round((Math.max(0, Number(signalStatus.certusDataBars) || 0) / 5) * 4)),
  );
  const cellBars = Math.max(0, Math.min(4, getBarsFromPercent(signalStatus.cellularSignal, 4)));
  const satValue = formatLinkLabel(satStrength);
  const cellValue = formatLinkLabel(cellStrength);
  const satMetric = `${Math.max(0, Number(signalStatus.certusDataBars) || 0)}/5 bars · ${formatDataUsage(signalStatus.certusDataUsedKB)}`;
  const cellMetric = `${Math.max(0, Number(signalStatus.cellularSignal) || 0)}% signal`;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.sectionTitle}>Dashboard</Text>
            <Text style={styles.helper}>Live Ops Overview</Text>
          </View>
          <View style={styles.themeToggleWrap}>
            <Text style={styles.themeToggleLabel}>
              {themeMode === "dark" ? "Dark" : "Light"}
            </Text>
            <Switch
              value={themeMode === "dark"}
              onValueChange={(enabled) => setThemeMode(enabled ? "dark" : "light")}
              trackColor={{ false: colors.border.medium, true: colors.accent.primaryLight }}
              thumbColor={colors.text.primary}
              style={styles.themeToggleSwitch}
            />
          </View>
        </View>

        <View style={styles.bentoGrid}>
          <View style={[styles.bentoCard, styles.usersBento]}>
            <View style={styles.usersHeaderRow}>
              <Text style={styles.usersPanelTitle}>Active Users</Text>
              <Pressable style={styles.usersLink} onPress={() => navigation.navigate("Channels")}>
                <Text style={styles.usersLinkText}>Open</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.usersScroll}
              contentContainerStyle={styles.usersList}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {activeUsers.length === 0 ? (
                <Text style={styles.usersEmptyText}>No live users in your talk groups</Text>
              ) : (
                activeUsers.map((activeUser) => (
                  <Pressable
                    key={activeUser.key}
                    onPress={() => handleUserPress(activeUser)}
                    style={({ pressed }) => [
                      styles.userRow,
                      pressed && styles.userRowPressed,
                    ]}
                  >
                    <View style={styles.userRowLeft}>
                      <View style={[styles.userDot, styles.userDotActive]} />
                      <View>
                        <Text style={styles.userName}>{activeUser.displayName}</Text>
                        <Text style={styles.userChannel}>{activeUser.channelName}</Text>
                      </View>
                    </View>
                    <Text
                      style={styles.userStatus}
                    >
                      {current?.id === activeUser.channelId ? "IN GROUP" : "JOIN"}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>

          <View style={styles.signalStack}>
            <StatusCard
              label="Satellite"
              value={satValue}
              metric={satMetric}
              bars={satBars}
              strength={satStrength}
              colors={colors}
              isActive={signalStatus.activeLink === "satellite"}
              onPress={() => selectConnection("satellite")}
              styles={styles}
            />
            <StatusCard
              label="Cellular"
              value={cellValue}
              metric={cellMetric}
              bars={cellBars}
              strength={cellStrength}
              colors={colors}
              isActive={signalStatus.activeLink === "cellular"}
              onPress={() => selectConnection("cellular")}
              styles={styles}
            />
          </View>
        </View>

        <View style={styles.notificationsHeader}>
          <Text style={styles.notificationsTitle}>Notifications</Text>
          <Pressable style={styles.activeBadge} onPress={() => navigation.navigate("Notifications")}>
            <Text style={styles.activeBadgeText}>{unread} Active</Text>
          </Pressable>
        </View>

        <View style={styles.notificationsPanel}>
          <ScrollView
            style={styles.notificationsScroll}
            contentContainerStyle={styles.notificationsList}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {notificationFeed.length === 0 ? (
              <Text style={styles.notificationEmpty}>No real-time alerts yet</Text>
            ) : (
              notificationFeed.map((n) => (
                <Pressable key={n.id} style={styles.notificationCard} onPress={() => navigation.navigate("Notifications")}>
                  <View style={[styles.notificationIcon, n.severity === "warning" ? styles.notificationWarn : styles.notificationInfo]}>
                    <Text style={styles.notificationIconText}>{n.severity === "warning" ? "⚠" : "i"}</Text>
                  </View>
                  <View style={styles.notificationCopy}>
                    <Text style={styles.notificationTitle}>{n.title}</Text>
                    <Text style={styles.notificationMessage}>{n.message}</Text>
                  </View>
                  <Text style={styles.notificationTime}>{getMinutesAgo(n.createdAt)}m ago</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </ScrollView>

      <BottomMenu navigation={navigation} active="Dashboard" />
    </View>
  );
}

function createStyles(colors: any, spacing: any, radius: any, typography: any) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    paddingBottom: spacing.xxl + s(84),
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
  themeToggleWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.full,
    paddingLeft: spacing.sm,
    paddingRight: 2,
    paddingVertical: 2,
    gap: spacing.xs,
  },
  themeToggleLabel: {
    color: colors.text.secondary,
    fontSize: typography.size.xs,
    fontWeight: "700",
    letterSpacing: 0.4,
    minWidth: 34,
    textAlign: "center",
  },
  themeToggleSwitch: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
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
  bentoGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.md,
  },
  bentoCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  usersBento: {
    flex: 1.2,
    height: hp(38),
    paddingTop: spacing.lg,
  },
  usersHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  usersPanelTitle: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  usersLink: {
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  usersLinkText: {
    color: colors.text.secondary,
    fontSize: typography.size.xs,
    fontWeight: "700",
  },
  usersScroll: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  usersList: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  usersEmptyText: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    textAlign: "center",
    paddingTop: spacing.md,
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
  userRowPressed: {
    opacity: 0.9,
  },
  userRowDisabled: {
    opacity: 0.55,
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
    color: colors.status.info,
    fontSize: 10,
    fontWeight: "700",
  },
  userStatusUnavailable: {
    color: colors.text.muted,
  },
  signalStack: {
    flex: 0.95,
    gap: spacing.md,
    alignSelf: "stretch",
    height: hp(38),
  },
  signalCard: {
    flex: 1,
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
  signalCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
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
    fontSize: typography.size.sm,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "700",
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
    fontSize: typography.size.sm,
    textTransform: "uppercase",
    letterSpacing: 1.2,
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
    minHeight: 220,
    maxHeight: hp(32),
  },
  notificationsScroll: {
    flex: 1,
  },
  notificationsList: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  notificationEmpty: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    textAlign: "center",
    paddingVertical: spacing.md,
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
}
