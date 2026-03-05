import React, { useContext, useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Switch,
} from "react-native";
import { ChannelContext } from "../context/ChannelContext";
import { startAudioStream, stopAudioStream } from "../utils/audio";
import {
  emitStartTalking,
  emitStopTalking,
  joinChannel,
} from "../utils/socket";
import { onFloorDenied, getFloorState, comms } from "../utils/comms";
import { updateTLEs, getVisibleSatellites } from "../utils/satellitePredictor";
import { useStore } from "../store";
import { CONFIG } from "../config";
import { useAppTheme } from "../theme";
import BottomMenu from "../components/BottomMenu";

const MOCK_CHANNELS = [
  { id: "channel-1", name: "Channel 1", users: 10 },
  { id: "channel-2", name: "Channel 2", users: 5 },
  { id: "channel-3", name: "Channel 3", users: 8 },
  { id: "channel-4", name: "Channel 4", users: 3 },
  { id: "channel-5", name: "Channel 5", users: 12 },
];

export default function PTTScreen({ navigation }) {
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );

  const { current, setCurrent } = useContext(ChannelContext);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [channelBusy, setChannelBusy] = useState(false);
  const [busyHolder, setBusyHolder] = useState(null);
  const [availableChannels, setAvailableChannels] = useState([]);
  const [channelMenuOpen, setChannelMenuOpen] = useState(false);
  const preferredConnection = useStore((s) => s.preferredConnection);
  const setPreferredConnection = useStore((s) => s.setPreferredConnection);
  const jwt = useStore((s) => s.jwt);
  const [isSatcom, setIsSatcom] = useState(false);
  const [satsVisible, setSatsVisible] = useState(0);

  // Poll for visible Iridium satellites when in SATCOM mode
  useEffect(() => {
    let intervalId = null;

    if (isSatcom) {
      // First, fetch/cache latest TLEs from our server
      updateTLEs(CONFIG.DEVICE_ID).then(() => {
        // Then check visibility every 5 seconds
        const checkSats = () => {
          const visible = getVisibleSatellites();
          setSatsVisible(visible.length);
        };
        checkSats(); // Initial check
        intervalId = setInterval(checkSats, 5000);
      });
    } else {
      setSatsVisible(0); // Reset when not in SATCOM
    }

    return () => clearInterval(intervalId);
  }, [isSatcom]);

  // Load channels for the channel dropdown on the PTT screen
  useEffect(() => {
    let isMounted = true;

    const hydrateChannels = async () => {
      if (CONFIG.MOCK_MODE) {
        if (!isMounted) return;
        setAvailableChannels(MOCK_CHANNELS);
        return;
      }

      if (!jwt) {
        if (isMounted && current) setAvailableChannels([current]);
        return;
      }

      try {
        const res = await fetch(`${CONFIG.API_URL}/talkgroups`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch channels: ${res.status}`);
        const data = await res.json();
        const talkgroups = Array.isArray(data?.talkgroups)
          ? data.talkgroups
          : Array.isArray(data)
            ? data
            : [];
        const mapped = talkgroups
          .filter((tg) => tg && tg.id && tg.name)
          .map((tg) => ({
            id: String(tg.id),
            name: String(tg.name),
            users: typeof tg.users === "number" ? tg.users : 0,
          }));

        if (!isMounted) return;

        // Keep the currently selected channel visible even if the list doesn't include it.
        if (current && !mapped.some((ch) => ch.id === current.id)) {
          setAvailableChannels([current, ...mapped]);
        } else {
          setAvailableChannels(mapped);
        }
      } catch (err) {
        console.warn("[PTTScreen] Failed to fetch channels for selector:", err);
        if (!isMounted) return;
        if (current) setAvailableChannels([current]);
      }
    };

    hydrateChannels();
    return () => {
      isMounted = false;
    };
  }, [jwt, current]);

  const toggleSatcom = () => {
    const newValue = !isSatcom;
    setIsSatcom(newValue);
    comms.setTransportMode(newValue ? "satcom" : "cellular");
    // Keep store in sync so Dashboard connection cards reflect current mode
    setPreferredConnection(newValue ? "satellite" : "cellular");
  };

  const channelUsers = useMemo(() => {
    const totalUsers = Math.max(0, Number(current?.users || 0));
    if (totalUsers === 0) return [];

    const seedNames = [
      "YOU",
      currentSpeaker || "ECHO-1",
      "BRAVO-2",
      "CHARLIE-3",
      "DELTA-4",
      "FOXTROT-5",
      "GOLF-6",
      "HOTEL-7",
      "INDIA-8",
    ];

    const normalized = seedNames.filter((name, idx) => name && seedNames.indexOf(name) === idx);
    return normalized.slice(0, totalUsers);
  }, [current?.users, currentSpeaker]);

  const handleChannelChange = useCallback(
    async (channel) => {
      if (!channel?.id) return;
      setChannelMenuOpen(false);
      if (current?.id === channel.id) return;

      if (isTransmitting && current?.id) {
        setIsTransmitting(false);
        try {
          await stopAudioStream();
        } catch (err) {
          console.warn("[PTTScreen] Failed stopping audio while switching channel:", err);
        }
        emitStopTalking(CONFIG.DEVICE_ID, current.id);
      }

      setChannelBusy(false);
      setBusyHolder(null);
      setCurrentSpeaker(null);
      setCurrent(channel);
      joinChannel(channel.id);
    },
    [current, isTransmitting, setCurrent],
  );

  // Register floor-deny callback — fires when server rejects PTT (walk-on prevention)
  useEffect(() => {
    onFloorDenied((talkgroup, holder) => {
      console.warn(
        `[PTTScreen] Floor denied on ${talkgroup} — held by ${holder}`,
      );
      setIsTransmitting(false);
      setChannelBusy(true);
      setBusyHolder(holder);
      // Clear the "busy" banner after 3 seconds
      setTimeout(() => {
        setChannelBusy(false);
        setBusyHolder(null);
      }, 3000);
    });
  }, []);

  // Re-join talkgroup every time PTT screen mounts / channel changes.
  // This covers: first visit, fast-refresh, WebSocket reconnect, back-navigation.
  useEffect(() => {
    if (current?.id) {
      joinChannel(current.id);
      console.log(`[PTTScreen] joined talkgroup: ${current.id}`);
    }
  }, [current?.id]);

  const handlePTTStart = useCallback(async () => {
    if (!current || isTransmitting || (isSatcom && satsVisible === 0)) return;

    // Walk-on check: emitStartTalking returns false if floor is taken
    const accepted = emitStartTalking(CONFIG.DEVICE_ID, current.id);
    if (accepted === false) {
      const floorState = getFloorState();
      setChannelBusy(true);
      setBusyHolder(floorState.holder);
      setTimeout(() => {
        setChannelBusy(false);
        setBusyHolder(null);
      }, 3000);
      return;
    }

    setIsTransmitting(true);
    try {
      await startAudioStream();
    } catch (e) {
      console.warn("Audio start error:", e);
      setIsTransmitting(false);
      emitStopTalking(CONFIG.DEVICE_ID, current.id);
    }
  }, [current, isSatcom, satsVisible, isTransmitting]);

  const handlePTTEnd = useCallback(async () => {
    if (!current || !isTransmitting) return;
    // stopAudioStream MUST come before emitStopTalking — avoids dropping last audio chunk
    setIsTransmitting(false);
    await stopAudioStream();
    emitStopTalking(CONFIG.DEVICE_ID, current.id);
  }, [current, isTransmitting]);

  // No channel selected - show prompt to select
  if (!current) {
    return (
      <View style={styles.container}>
        <View style={styles.noChannelContainer}>
          <Text style={styles.noChannelIcon}>📡</Text>
          <Text style={styles.noChannelTitle}>No Channel Selected</Text>
          <Text style={styles.noChannelSubtitle}>
            Select a channel to start communicating
          </Text>
          <TouchableOpacity
            style={styles.selectChannelBtn}
            onPress={() => navigation.navigate("Channels")}
          >
            <Text style={styles.selectChannelText}>GO TO CHANNELS</Text>
          </TouchableOpacity>
        </View>
        <BottomMenu navigation={navigation} active="PTT" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Channel Header */}
      <View style={styles.channelHeader}>
        <View style={styles.channelBadge}>
          <View
            style={[
              styles.liveDot,
              (currentSpeaker || isTransmitting) && styles.liveDotActive,
            ]}
          />
          <Text style={styles.channelLabel}>LIVE CHANNEL</Text>
        </View>
        <Text style={styles.channelName}>{current.name}</Text>
        <Text style={styles.channelUsers}>👤 {current.users || 0} Online</Text>

        <View style={styles.channelSelectorWrap}>
          <Text style={styles.channelSelectorLabel}>SELECT CHANNEL</Text>
          <Pressable
            style={styles.channelSelectorButton}
            onPress={() => setChannelMenuOpen((open) => !open)}
          >
            <Text style={styles.channelSelectorText}>{current.name}</Text>
            <Text style={styles.channelSelectorChevron}>
              {channelMenuOpen ? "▲" : "▼"}
            </Text>
          </Pressable>
          {channelMenuOpen && (
            <View style={styles.channelSelectorList}>
              {availableChannels.length === 0 ? (
                <Text style={styles.channelSelectorEmpty}>No channels available</Text>
              ) : (
                availableChannels.map((channel) => (
                  <Pressable
                    key={channel.id}
                    style={[
                      styles.channelSelectorItem,
                      channel.id === current.id && styles.channelSelectorItemActive,
                    ]}
                    onPress={() => handleChannelChange(channel)}
                  >
                    <Text
                      style={[
                        styles.channelSelectorItemText,
                        channel.id === current.id && styles.channelSelectorItemTextActive,
                      ]}
                    >
                      {channel.name}
                    </Text>
                    <Text style={styles.channelSelectorUsers}>
                      👤 {channel.users || 0}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          )}
        </View>
      </View>

      <View style={styles.userCirclesSection}>
        <Text style={styles.userCirclesLabel}>USERS IN CHANNEL</Text>
        {channelUsers.length === 0 ? (
          <Text style={styles.userCirclesEmpty}>No active users</Text>
        ) : (
          <View style={styles.userCirclesRow}>
            {channelUsers.slice(0, 6).map((user, idx) => {
              const initials = user === "YOU"
                ? "YOU"
                : user
                    .split("-")
                    .map((part) => part.charAt(0))
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
              const highlighted = (user === "YOU" && isTransmitting) || user === currentSpeaker;
              return (
                <View
                  key={`${user}-${idx}`}
                  style={[
                    styles.userCircle,
                    highlighted && styles.userCircleActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.userCircleText,
                      highlighted && styles.userCircleTextActive,
                    ]}
                  >
                    {initials}
                  </Text>
                </View>
              );
            })}
            {channelUsers.length > 6 && (
              <View style={[styles.userCircle, styles.userCircleOverflow]}>
                <Text style={styles.userCircleText}>+{channelUsers.length - 6}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Speaking Status */}
      <View
        style={[
          styles.speakingBar,
          (currentSpeaker || isTransmitting) && styles.speakingBarActive,
          channelBusy && styles.speakingBarBusy,
          isSatcom && satsVisible === 0 && styles.speakingBarNoSat,
        ]}
      >
        <Text style={styles.speakingText}>
          {channelBusy
            ? `🚫 CHANNEL BUSY — ${busyHolder || "another device"} is transmitting`
            : isSatcom && satsVisible === 0
              ? "🛰️ WAITING FOR SATELLITE... (No line of sight)"
              : isTransmitting
                ? "📡 YOU ARE TRANSMITTING"
                : currentSpeaker
                  ? `🎙️ NOW SPEAKING: ${currentSpeaker}`
                  : "— Channel idle —"}
        </Text>
      </View>

      {/* Main PTT Area */}
      <View style={styles.pttArea}>
        {/* Glow rings */}
        <View
          style={[
            styles.glowRing,
            styles.glowRing1,
            isTransmitting && styles.glowRingActive,
          ]}
        />
        <View
          style={[
            styles.glowRing,
            styles.glowRing2,
            isTransmitting && styles.glowRingActive,
          ]}
        />
        <View
          style={[
            styles.glowRing,
            styles.glowRing3,
            isTransmitting && styles.glowRingActive,
          ]}
        />

        {/* PTT Button */}
        <Pressable
          onPressIn={handlePTTStart}
          onPressOut={handlePTTEnd}
          disabled={isSatcom && satsVisible === 0}
          style={({ pressed }) => [
            styles.pttButton,
            (isTransmitting || pressed) && styles.pttButtonActive,
            pressed && styles.pttButtonPressed,
            isSatcom && satsVisible === 0 && styles.pttButtonDisabled,
          ]}
        >
          <Text style={styles.pttIcon}>{isTransmitting ? "🔴" : "🎙️"}</Text>
          <Text
            style={[styles.pttLabel, isTransmitting && styles.pttLabelActive]}
          >
            {isTransmitting ? "TRANSMITTING" : "HOLD TO TALK"}
          </Text>
        </Pressable>
      </View>

      {/* Transport Toggle */}
      <View style={styles.toggleContainer}>
        <Text
          style={[styles.toggleLabel, !isSatcom && styles.toggleLabelActive]}
        >
          CELLULAR
        </Text>
        <Switch
          trackColor={{
            false: colors.border.subtle,
            true: colors.status.active,
          }}
          thumbColor={colors.text.inverse}
          onValueChange={toggleSatcom}
          value={isSatcom}
          style={styles.switch}
        />
        <Text
          style={[styles.toggleLabel, isSatcom && styles.toggleLabelActive]}
        >
          SATCOM LINK
        </Text>
      </View>

      {/* Satellite Info Banner */}
      {isSatcom && (
        <View style={styles.satInfo}>
          <Text style={styles.satText}>
            Visible Satellites: {satsVisible} (Iridium Certus)
          </Text>
        </View>
      )}

      {/* Hint */}
      <Text style={styles.hint}>
        {isTransmitting
          ? "Release to stop transmitting"
          : "Hold button to talk"}
      </Text>
      <BottomMenu navigation={navigation} active="PTT" />
    </View>
  );
}

function createStyles(colors, spacing, radius, typography) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  // No channel state
  noChannelContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  noChannelIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
    opacity: 0.5,
  },
  noChannelTitle: {
    color: colors.text.primary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
  },
  noChannelSubtitle: {
    color: colors.text.muted,
    fontSize: typography.size.md,
    marginBottom: spacing.xl,
    textAlign: "center",
  },
  selectChannelBtn: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
  },
  selectChannelText: {
    color: colors.text.inverse,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wider,
  },
  // Channel header
  channelHeader: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  channelBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text.muted,
    marginRight: spacing.sm,
  },
  liveDotActive: {
    backgroundColor: colors.status.active,
  },
  channelLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.widest,
  },
  channelName: {
    color: colors.text.primary,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  channelUsers: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
  },
  channelSelectorWrap: {
    width: "100%",
    marginTop: spacing.md,
    zIndex: 10,
  },
  channelSelectorLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.wide,
    marginBottom: spacing.xs,
    textAlign: "left",
  },
  channelSelectorButton: {
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  channelSelectorText: {
    color: colors.text.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  channelSelectorChevron: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
  },
  channelSelectorList: {
    marginTop: spacing.xs,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  channelSelectorItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  channelSelectorItemActive: {
    backgroundColor: colors.accent.glow,
  },
  channelSelectorItemText: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
  },
  channelSelectorItemTextActive: {
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
  channelSelectorUsers: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
  },
  channelSelectorEmpty: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    paddingVertical: spacing.md,
    textAlign: "center",
  },
  userCirclesSection: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.background.secondary,
  },
  userCirclesLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.wide,
    marginBottom: spacing.sm,
  },
  userCirclesEmpty: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
  },
  userCirclesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  userCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  userCircleActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primaryLight,
  },
  userCircleOverflow: {
    backgroundColor: colors.background.card,
  },
  userCircleText: {
    color: colors.text.secondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.tight,
  },
  userCircleTextActive: {
    color: colors.text.primary,
  },
  // Speaking bar
  speakingBar: {
    backgroundColor: colors.background.tertiary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  speakingBarActive: {
    backgroundColor: colors.status.activeGlow,
  },
  speakingBarBusy: {
    backgroundColor: colors.status.danger,
  },
  speakingBarNoSat: {
    backgroundColor: colors.background.secondary,
  },
  speakingText: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    letterSpacing: typography.letterSpacing.wide,
  },
  // PTT Area
  pttArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  glowRing: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    opacity: 0.3,
  },
  glowRing1: {
    width: 280,
    height: 280,
  },
  glowRing2: {
    width: 240,
    height: 240,
  },
  glowRing3: {
    width: 200,
    height: 200,
  },
  glowRingActive: {
    borderColor: colors.status.danger,
    opacity: 0.6,
  },
  pttButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.accent.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: colors.accent.primaryLight,
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 15,
  },
  pttButtonActive: {
    backgroundColor: colors.status.danger,
    borderColor: colors.status.danger,
    shadowColor: colors.status.danger,
    shadowOpacity: 0.8,
    shadowRadius: 50,
  },
  pttButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  pttIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  pttLabel: {
    color: colors.text.inverse,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wider,
  },
  pttLabelActive: {
    color: colors.text.inverse,
  },
  pttButtonDisabled: {
    backgroundColor: colors.background.tertiary,
    borderColor: colors.border.subtle,
    shadowOpacity: 0,
    elevation: 0,
    opacity: 0.5,
  },
  // Toggle
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
  },
  toggleLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  toggleLabelActive: {
    color: colors.status.active,
  },
  switch: {
    marginHorizontal: spacing.md,
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
  // Satellite Info
  satInfo: {
    alignItems: "center",
    paddingBottom: spacing.sm,
  },
  satText: {
    color: colors.status.active,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  // Hint
  hint: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    textAlign: "center",
    paddingBottom: spacing.xxl + 84,
    letterSpacing: typography.letterSpacing.wide,
  },
  });
}
