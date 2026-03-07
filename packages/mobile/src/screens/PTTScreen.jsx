import React, {
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Switch,
  Animated,
  Easing,
  Platform,
  Image,
  useWindowDimensions,
} from "react-native";
import { Mic } from "lucide-react-native";
import { s, wp, hp } from '../utils/responsive';
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
import {
  getSignalColor,
  getSignalStrengthFromBars,
  getSignalStrengthFromPercent,
} from "../utils/signalStrength";
import { playPTTPressBeep } from "../utils/pttSounds";
import BottomMenu from "../components/BottomMenu";

const LOCAL_USER_LABEL = "YOU";

function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const mins = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatUser(user, localUserIds = []) {
  const normalized = String(user || "").trim();
  if (!normalized) return "UNKNOWN";
  if (localUserIds.includes(normalized) || normalized === LOCAL_USER_LABEL) {
    return LOCAL_USER_LABEL;
  }
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

function getUserInitials(user, localUserIds = []) {
  const label = formatUser(user, localUserIds);
  if (label === LOCAL_USER_LABEL) return LOCAL_USER_LABEL;

  const words = label
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  const compact = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!compact) return "?";
  return compact.slice(0, 2).toUpperCase();
}

function ParticipantOrbit({
  participants,
  styles,
  orbitRadiusX,
  orbitRadiusY,
}) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (participants.length === 0) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 24000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );

    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [participants.length, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const bubbleSize =
    participants.length > 12 ? s(30) : participants.length > 8 ? s(34) : s(40);
  const halfBubble = bubbleSize / 2;

  // The animated view must be a square large enough to contain every bubble at any
  // rotation angle. The worst case is the diagonal: sqrt(rx² + ry²) + halfBubble.
  const maxRadius = Math.sqrt(orbitRadiusX * orbitRadiusX + orbitRadiusY * orbitRadiusY);
  const trackSize = Math.ceil(2 * (maxRadius + halfBubble + 2));
  const center = trackSize / 2;

  return (
    <View pointerEvents="none" style={styles.orbitContainer}>
      <Animated.View
        style={{
          width: trackSize,
          height: trackSize,
          transform: participants.length > 0 ? [{ rotate }] : [],
        }}
      >
        {participants.map((participant, index) => {
          const count = Math.max(1, participants.length);
          const angle = (Math.PI * 2 * index) / count;
          const tx = Math.cos(angle) * orbitRadiusX;
          const ty = Math.sin(angle) * orbitRadiusY;
          const highlighted = participant.isTalking;

          return (
            <View
              key={`${participant.id}-${index}`}
              style={[
                styles.orbitBubble,
                highlighted && styles.orbitBubbleActive,
                highlighted && styles.orbitBubbleTalking,
                {
                  width: bubbleSize,
                  height: bubbleSize,
                  borderRadius: bubbleSize / 2,
                  left: center + tx - halfBubble,
                  top: center + ty - halfBubble,
                },
              ]}
            >
              {participant.photoUrl ? (
                <Image source={{ uri: participant.photoUrl }} style={styles.orbitAvatarImage} />
              ) : (
                <Text
                  style={[
                    styles.orbitBubbleText,
                    highlighted && styles.orbitBubbleTextActive,
                  ]}
                >
                  {getUserInitials(participant.displayName)}
                </Text>
              )}
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

export default function PTTScreen({ navigation }) {
  const { colors, spacing, radius, typography } = useAppTheme();
  const { height: screenH } = useWindowDimensions();
  const isCompact = screenH < 680;
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography, isCompact),
    [colors, spacing, radius, typography, isCompact],
  );

  const [pttAreaHeight, setPttAreaHeight] = useState(0);
  const handlePttAreaLayout = useCallback(
    (e) => setPttAreaHeight(e.nativeEvent.layout.height),
    [],
  );

  // Compute orbit radii that are guaranteed to fit inside pttArea.
  // The Animated.View is a square of side = 2*(sqrt(rx²+ry²) + halfBubble + 2).
  // Its half-diagonal must be <= pttAreaHeight/2 so it never overflows into
  // sibling views that would paint on top and hide the bubbles.
  const { orbitRadiusX, orbitRadiusY } = useMemo(() => {
    const maxDiag = pttAreaHeight > 0
      ? Math.max(50, pttAreaHeight / 2 - s(22))
      : s(132); // safe default before layout
    // Maintain original 132:92 aspect ratio
    const aspect = 132 / 92;
    const ry = Math.round(maxDiag / Math.sqrt(aspect * aspect + 1));
    const rx = Math.round(aspect * ry);
    return { orbitRadiusX: rx, orbitRadiusY: ry };
  }, [pttAreaHeight]);

  const { current, setCurrent } = useContext(ChannelContext);
  const jwt = useStore((s) => s.jwt);
  const authUser = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const soundsEnabled = useStore((s) => s.soundsEnabled);
  const signalStatus = useStore((s) => s.signalStatus);
  const preferredConnection = useStore((s) => s.preferredConnection);
  const setPreferredConnection = useStore((s) => s.setPreferredConnection);

  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isPressingPTT, setIsPressingPTT] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [channelBusy, setChannelBusy] = useState(false);
  const [busyHolder, setBusyHolder] = useState(null);
  const [waitingForFloor, setWaitingForFloor] = useState(false);

  const [availableChannels, setAvailableChannels] = useState([]);
  const [channelMenuOpen, setChannelMenuOpen] = useState(false);

  const [isSatcom, setIsSatcom] = useState(preferredConnection === "satellite");
  const [satsVisible, setSatsVisible] = useState(0);

  const [presenceUsers, setPresenceUsers] = useState([]);
  const [hasPresenceSnapshot, setHasPresenceSnapshot] = useState(false);
  const [memberDetailsById, setMemberDetailsById] = useState({});

  const [joinedAt, setJoinedAt] = useState(null);
  const [callDurationSec, setCallDurationSec] = useState(0);

  const isMountedRef = useRef(true);
  const isTransmittingRef = useRef(false);
  const currentChannelIdRef = useRef(null);

  const localDeviceId = CONFIG.DEVICE_ID;
  const localUserId = authUser?.sub ? String(authUser.sub) : null;
  const localParticipantId = localUserId || localDeviceId;
  const localUserIds = useMemo(() => {
    const ids = [localParticipantId, localDeviceId].filter(Boolean);
    return Array.from(new Set(ids.map((id) => String(id))));
  }, [localDeviceId, localParticipantId]);

  useEffect(() => {
    isTransmittingRef.current = isTransmitting;
  }, [isTransmitting]);

  useEffect(() => {
    currentChannelIdRef.current = current?.id || null;
  }, [current?.id]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setIsSatcom(preferredConnection === "satellite");
  }, [preferredConnection]);

  useEffect(() => {
    let intervalId = null;
    let cancelled = false;

    if (!isSatcom || !jwt) {
      setSatsVisible(0);
      return undefined;
    }

    updateTLEs(jwt)
      .then(() => {
        if (cancelled) return;

        const checkSats = () => {
          const visible = getVisibleSatellites();
          setSatsVisible(Array.isArray(visible) ? visible.length : 0);
        };

        checkSats();
        intervalId = setInterval(checkSats, 5000);
      })
      .catch((err) => {
        console.warn("[PTTScreen] Satellite visibility update failed:", err);
        if (!cancelled) setSatsVisible(0);
      });

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isSatcom, jwt]);

  useEffect(() => {
    let isMounted = true;

    const hydrateChannels = async () => {
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
            users: typeof tg.users === "number" ? tg.users : null,
          }));

        if (!isMounted) return;

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

  useEffect(() => {
    if (!jwt || !current?.id) {
      setMemberDetailsById({});
      return;
    }

    let cancelled = false;

    const fetchMemberDetails = async () => {
      try {
        const res = await fetch(`${CONFIG.API_URL}/talkgroups/${current.id}/members`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch talkgroup members: ${res.status}`);

        const data = await res.json();
        const members = Array.isArray(data?.members) ? data.members : [];
        const next = {};

        members.forEach((member) => {
          if (!member?.id) return;
          const userId = String(member.id);
          const profilePayload =
            member?.profile && typeof member.profile === "object"
              ? member.profile
              : {};

          next[userId] = {
            displayName:
              (typeof profilePayload.display_name === "string" && profilePayload.display_name.trim()) ||
              (typeof member.username === "string" && member.username.trim()) ||
              userId,
            photoUrl:
              (typeof profilePayload.photo_url === "string" && profilePayload.photo_url.trim()) ||
              "",
          };
        });

        if (!cancelled) setMemberDetailsById(next);
      } catch (err) {
        console.warn("[PTTScreen] Failed to fetch member details:", err);
        if (!cancelled) setMemberDetailsById({});
      }
    };

    fetchMemberDetails();
    const refreshInterval = setInterval(fetchMemberDetails, 30_000);

    return () => {
      cancelled = true;
      clearInterval(refreshInterval);
    };
  }, [jwt, current?.id]);

  useEffect(() => {
    setChannelMenuOpen(false);
    setCurrentSpeaker(null);
    setChannelBusy(false);
    setBusyHolder(null);
    setWaitingForFloor(false);
    setPresenceUsers([]);
    setHasPresenceSnapshot(false);

    if (current?.id) {
      joinChannel(current.id);
      setJoinedAt(Date.now());
      setCallDurationSec(0);
      console.log(`[PTTScreen] joined talkgroup: ${current.id}`);
    } else {
      setJoinedAt(null);
      setCallDurationSec(0);
    }
  }, [current?.id]);

  useEffect(() => {
    if (!joinedAt) return undefined;

    const tick = () => {
      setCallDurationSec(Math.floor((Date.now() - joinedAt) / 1000));
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [joinedAt]);

  useEffect(() => {
    const handleMessage = (msg) => {
      if (!msg?.type) return;
      if (!isMountedRef.current) return;

      const activeChannel = currentChannelIdRef.current;
      if (!activeChannel) return;

      if (msg.talkgroup && String(msg.talkgroup) !== String(activeChannel)) {
        return;
      }

      if (msg.type === "PRESENCE") {
        const online = Array.isArray(msg.online)
          ? msg.online.map((u) => String(u)).filter(Boolean)
          : [];
        setPresenceUsers(Array.from(new Set(online)));
        setHasPresenceSnapshot(true);
        return;
      }

      if (msg.type === "FLOOR_GRANT") {
        const winner = msg.winnerUserId
          ? String(msg.winnerUserId)
          : msg.winner
            ? String(msg.winner)
            : null;
        setCurrentSpeaker(winner);

        if (!winner || localUserIds.includes(String(winner))) {
          setChannelBusy(false);
          setBusyHolder(null);
          setWaitingForFloor(false);
        } else {
          setChannelBusy(true);
          setBusyHolder(winner);
        }

        return;
      }

      if (msg.type === "FLOOR_DENY") {
        const holder = msg.holderUserId
          ? String(msg.holderUserId)
          : msg.holder
            ? String(msg.holder)
            : null;

        setWaitingForFloor(true);
        setChannelBusy(true);
        setBusyHolder(holder);
        if (holder) setCurrentSpeaker(holder);
        return;
      }

      if (msg.type === "FLOOR_RELEASED" || msg.type === "PTT_END") {
        setChannelBusy(false);
        setBusyHolder(null);
        setWaitingForFloor(false);

        if (!isTransmittingRef.current) {
          setCurrentSpeaker(null);
        }
      }
    };

    try {
      comms.onMessage(handleMessage);
    } catch (err) {
      console.warn("[PTTScreen] onMessage listener unavailable:", err);
    }
  }, [localUserIds]);

  useEffect(() => {
    onFloorDenied((talkgroup, holder) => {
      if (!isMountedRef.current) return;

      const activeChannel = currentChannelIdRef.current;
      if (activeChannel && talkgroup && String(talkgroup) !== String(activeChannel)) {
        return;
      }

      const floorHolder = holder ? String(holder) : null;
      setIsTransmitting(false);
      setIsPressingPTT(false);
      setWaitingForFloor(true);
      setChannelBusy(true);
      if (floorHolder) {
        // Keep any authoritative user-id value already set by FLOOR_DENY message payload.
        setBusyHolder((prev) => prev || floorHolder);
        setCurrentSpeaker((prev) => prev || floorHolder);
      }

      stopAudioStream().catch((err) => {
        console.warn("[PTTScreen] stopAudioStream after floor deny failed:", err);
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      const channelId = currentChannelIdRef.current;
      if (isTransmittingRef.current && channelId) {
        stopAudioStream().catch(() => {});
        emitStopTalking(localDeviceId, channelId);
      }
    };
  }, [localDeviceId]);

  const startTransmit = useCallback(async () => {
    if (!current?.id || isTransmitting) {
      return;
    }

    playPTTPressBeep(soundsEnabled);

    const accepted = emitStartTalking(localDeviceId, current.id);
    if (accepted === false) {
      const floorState = getFloorState();
      const holder = floorState?.holder ? String(floorState.holder) : null;
      setWaitingForFloor(true);
      setChannelBusy(true);
      setBusyHolder(holder);
      setCurrentSpeaker(holder);
      return;
    }

    setWaitingForFloor(false);
    setChannelBusy(false);
    setBusyHolder(null);
    setIsTransmitting(true);
    setCurrentSpeaker(localParticipantId);

    try {
      await startAudioStream();
    } catch (err) {
      console.warn("[PTTScreen] Audio start error:", err);
      setIsTransmitting(false);
      setCurrentSpeaker(null);
      emitStopTalking(localDeviceId, current.id);
    }
  }, [
    current,
    isTransmitting,
    soundsEnabled,
    localDeviceId,
    localParticipantId,
  ]);

  const stopTransmit = useCallback(async () => {
    if (!current?.id || !isTransmitting) return;

    setIsTransmitting(false);

    try {
      await stopAudioStream();
    } catch (err) {
      console.warn("[PTTScreen] Audio stop error:", err);
    }

    emitStopTalking(localDeviceId, current.id);

    if (currentSpeaker && localUserIds.includes(String(currentSpeaker))) {
      setCurrentSpeaker(null);
    }
  }, [current, isTransmitting, currentSpeaker, localDeviceId, localUserIds]);

  const handlePttPressIn = useCallback(() => {
    setIsPressingPTT(true);
    startTransmit();
  }, [startTransmit]);

  const handlePttPressOut = useCallback(() => {
    setIsPressingPTT(false);
    stopTransmit();
  }, [stopTransmit]);

  const toggleSatcom = useCallback(() => {
    const newValue = !isSatcom;
    setIsSatcom(newValue);
    console.log('#############################################');
    console.log('##### SATCOM TOGGLE PRESSED: ' + (newValue ? 'ON' : 'OFF') + ' #####');
    console.log('#############################################');
    comms.setTransportMode(newValue ? "satcom" : "cellular");
    setPreferredConnection(newValue ? "satellite" : "cellular");
    console.log(`[PTTScreen] SATCOM toggle: ${newValue ? 'ON' : 'OFF'}`);
  }, [isSatcom, setPreferredConnection]);

  const handleChannelChange = useCallback(
    async (channel) => {
      if (!channel?.id) return;
      setChannelMenuOpen(false);
      if (current?.id === channel.id) return;

      if (isTransmitting && current?.id) {
        await stopTransmit();
      }

      setCurrent(channel);
    },
    [current, isTransmitting, setCurrent, stopTransmit],
  );

  const channelUsers = useMemo(() => {
    if (!hasPresenceSnapshot) return [];

    const normalized = Array.from(
      new Set(presenceUsers.map((user) => String(user)).filter(Boolean)),
    );

    if (currentSpeaker && !normalized.includes(String(currentSpeaker))) {
      normalized.unshift(String(currentSpeaker));
    }

    if (isTransmitting && !normalized.includes(String(localParticipantId))) {
      normalized.unshift(String(localParticipantId));
    }

    return normalized;
  }, [
    hasPresenceSnapshot,
    presenceUsers,
    currentSpeaker,
    isTransmitting,
    localParticipantId,
  ]);

  const participantDetailsById = useMemo(() => {
    const merged = { ...memberDetailsById };
    if (!localParticipantId) return merged;

    const existing = merged[localParticipantId] ?? {};
    merged[localParticipantId] = {
      displayName:
        (profile.displayName && profile.displayName.trim()) ||
        existing.displayName ||
        authUser?.username ||
        localParticipantId,
      photoUrl:
        (profile.photoUrl && profile.photoUrl.trim()) ||
        existing.photoUrl ||
        "",
    };
    return merged;
  }, [memberDetailsById, localParticipantId, profile.displayName, profile.photoUrl, authUser?.username]);

  const orbitParticipants = useMemo(() => {
    return channelUsers.map((userId) => {
      const details = participantDetailsById[userId] ?? {};
      const displayName =
        (typeof details.displayName === "string" && details.displayName) ||
        formatUser(userId, localUserIds);
      const isTalking =
        (currentSpeaker && String(currentSpeaker) === String(userId)) ||
        (isTransmitting && localUserIds.includes(String(userId)));

      return {
        id: userId,
        displayName,
        photoUrl:
          typeof details.photoUrl === "string" && details.photoUrl.trim()
            ? details.photoUrl.trim()
            : null,
        isTalking,
      };
    });
  }, [channelUsers, participantDetailsById, currentSpeaker, isTransmitting, localUserIds]);

  const participantCount = hasPresenceSnapshot ? channelUsers.length : null;
  const callDurationLabel = joinedAt ? formatDuration(callDurationSec) : "--:--";

  const remoteSpeakerActive =
    !!currentSpeaker && !localUserIds.includes(String(currentSpeaker));

  const hasSignalTelemetry =
    signalStatus.activeLink !== "none" ||
    signalStatus.certusDataBars > 0 ||
    signalStatus.cellularSignal > 0 ||
    signalStatus.certusDataUsedKB > 0;

  const satLineOfSightMissing = isSatcom && satsVisible === 0;
  const pttDisabled = hasSignalTelemetry && signalStatus.activeLink === "none";
  const pttVisualActive = isTransmitting || isPressingPTT;

  const satStrength = getSignalStrengthFromBars(signalStatus.certusDataBars, 5);
  const cellStrength = getSignalStrengthFromPercent(signalStatus.cellularSignal);
  const linkStrength =
    signalStatus.activeLink === "satellite"
      ? satStrength
      : signalStatus.activeLink === "cellular"
        ? cellStrength
        : "none";

  const satColor = getSignalColor(satStrength, colors);
  const cellColor = getSignalColor(cellStrength, colors);
  const linkColor = getSignalColor(linkStrength, colors);
  if (!current) {
    return (
      <View style={styles.container}>
        <View style={styles.noChannelContainer}>
          <Text style={styles.noChannelIcon}>📡</Text>
          <Text style={styles.noChannelTitle}>No Talk Group Selected</Text>
          <Text style={styles.noChannelSubtitle}>
            Select a talk group to start communicating
          </Text>
          <TouchableOpacity
            style={styles.selectChannelBtn}
            onPress={() => navigation.navigate("Channels")}
          >
            <Text style={styles.selectChannelText}>GO TO TALK GROUPS</Text>
          </TouchableOpacity>
        </View>
        <BottomMenu navigation={navigation} active="PTT" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.channelHeader}>
        <View style={styles.channelBadge}>
          <View
            style={[
              styles.liveDot,
              (remoteSpeakerActive || isTransmitting) && styles.liveDotActive,
            ]}
          />
          <Text style={styles.channelLabel}>LIVE TALK GROUP</Text>
        </View>

        <Text style={styles.channelName}>{current.name}</Text>
        <Text style={styles.channelUsers}>
          👤 {participantCount === null ? "Presence unavailable" : `${participantCount} Online`}
        </Text>

        <View style={styles.channelSelectorWrap}>
          <Text style={styles.channelSelectorLabel}>SELECT TALK GROUP</Text>
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
                <Text style={styles.channelSelectorEmpty}>No talk groups available</Text>
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
                      {typeof channel.users === "number" ? `👤 ${channel.users}` : "JOIN"}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          )}
        </View>
      </View>

      <View style={styles.userCirclesSection}>
        <View style={styles.userCirclesHeaderRow}>
          <Text style={styles.userCirclesLabel}>USERS IN TALK GROUP</Text>
          <Text style={styles.userCirclesMeta}>CALL {callDurationLabel}</Text>
        </View>

        {!hasPresenceSnapshot ? (
          <Text style={styles.userCirclesEmpty}>Presence unavailable</Text>
        ) : channelUsers.length === 0 ? (
          <Text style={styles.userCirclesEmpty}>No active users</Text>
        ) : (
          <Text style={styles.userCirclesEmpty}>
            {channelUsers.length} user{channelUsers.length === 1 ? "" : "s"} orbiting PTT
          </Text>
        )}
      </View>

      <View
        style={[
          styles.speakingBar,
          (remoteSpeakerActive || isTransmitting) && styles.speakingBarActive,
          (channelBusy || waitingForFloor) && styles.speakingBarBusy,
          (pttDisabled || satLineOfSightMissing) && styles.speakingBarNoSat,
        ]}
      >
        <Text style={styles.speakingText}>
          {pttDisabled
            ? "🚫 NO ACTIVE TRANSPORT LINK"
            : waitingForFloor
              ? "⌛ WAITING FOR FLOOR"
              : channelBusy
                ? `🚫 TALK GROUP BUSY — ${busyHolder ? formatUser(busyHolder, localUserIds) : "another device"} is transmitting`
                : isTransmitting
                  ? "📡 YOU ARE TRANSMITTING"
                  : remoteSpeakerActive
                    ? `🎙️ NOW SPEAKING: ${formatUser(currentSpeaker, localUserIds)}`
                    : satLineOfSightMissing
                      ? "🛰️ SATELLITE OUT OF VIEW — CELLULAR FALLBACK READY"
                      : "— Talk group idle —"}
        </Text>
      </View>

      <View style={styles.pttArea} onLayout={handlePttAreaLayout}>
        <View
          style={[
            styles.glowRing,
            styles.glowRing1,
            pttVisualActive && styles.glowRingActive,
          ]}
        />
        <View
          style={[
            styles.glowRing,
            styles.glowRing2,
            pttVisualActive && styles.glowRingActive,
          ]}
        />
        <View
          style={[
            styles.glowRing,
            styles.glowRing3,
            pttVisualActive && styles.glowRingActive,
          ]}
        />

        <Pressable
          onPressIn={handlePttPressIn}
          onPressOut={handlePttPressOut}
          disabled={pttDisabled}
          style={({ pressed }) => [
            styles.pttButton,
            (pttVisualActive || pressed) && styles.pttButtonActive,
            pressed && styles.pttButtonPressed,
            pttDisabled && styles.pttButtonDisabled,
          ]}
        >
          <View style={styles.pttIconWrap}>
            {Platform.OS === "web" ? (
              <Mic size={s(46)} color={colors.text.inverse} strokeWidth={2.2} />
            ) : (
              <Text style={styles.pttIcon}>{isTransmitting ? "🔴" : "🎙️"}</Text>
            )}
          </View>
          <Text style={[styles.pttLabel, isTransmitting && styles.pttLabelActive]}>
            {isTransmitting ? "TRANSMITTING" : "HOLD TO TALK"}
          </Text>
        </Pressable>

        {hasPresenceSnapshot && channelUsers.length > 0 && (
          <ParticipantOrbit
            participants={orbitParticipants}
            styles={styles}
            orbitRadiusX={orbitRadiusX}
            orbitRadiusY={orbitRadiusY}
          />
        )}
      </View>

      <View style={styles.toggleContainer}>
        <Text style={[styles.toggleLabel, !isSatcom && styles.toggleLabelActive]}>
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
        <Text style={[styles.toggleLabel, isSatcom && styles.toggleLabelActive]}>
          SATCOM LINK
        </Text>
      </View>

      <View style={styles.signalInfoContainer}>
        {isSatcom && (
          <Text style={styles.satText}>
            Visible Satellites: {jwt ? satsVisible : "Unavailable"}
          </Text>
        )}

        {hasSignalTelemetry ? (
          <View style={styles.signalRow}>
            <Text style={[styles.signalMetric, { color: satColor }]}>
              SAT {signalStatus.certusDataBars}/5
            </Text>
            <Text style={[styles.signalMetric, { color: linkColor }]}>
              LINK {String(signalStatus.activeLink || "none").toUpperCase()}
            </Text>
            <Text style={[styles.signalMetric, { color: cellColor }]}>
              CELL {signalStatus.cellularSignal}%
            </Text>
          </View>
        ) : (
          <Text style={styles.signalUnavailable}>Signal telemetry unavailable</Text>
        )}
      </View>

      <Text style={styles.hint}>
        {pttDisabled
          ? "No active transport link. Reconnect to transmit."
          : isTransmitting
            ? "Release to stop transmitting"
            : waitingForFloor
              ? "Floor is busy. Wait for release."
              : satLineOfSightMissing
                ? "Satellite out of view. Cellular fallback can still transmit."
                : "Hold button to talk"}
      </Text>
      <BottomMenu navigation={navigation} active="PTT" />
    </View>
  );
}

function createStyles(colors, spacing, radius, typography, isCompact = false) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    noChannelContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    noChannelIcon: {
      fontSize: s(64),
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
    channelHeader: {
      alignItems: "center",
      paddingVertical: isCompact ? spacing.xs : spacing.xl,
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
      paddingVertical: isCompact ? spacing.xs : spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      backgroundColor: colors.background.secondary,
    },
    userCirclesHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    userCirclesLabel: {
      color: colors.text.muted,
      fontSize: typography.size.xs,
      letterSpacing: typography.letterSpacing.wide,
    },
    userCirclesMeta: {
      color: colors.text.muted,
      fontSize: typography.size.xs,
      letterSpacing: typography.letterSpacing.wide,
      fontWeight: typography.weight.bold,
    },
    userCirclesEmpty: {
      color: colors.text.muted,
      fontSize: typography.size.sm,
    },
    speakingBar: {
      backgroundColor: colors.background.tertiary,
      paddingVertical: isCompact ? spacing.xs : spacing.md,
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
    pttArea: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "visible",
    },
    orbitContainer: {
      position: "absolute",
      width: wp(87),
      height: isCompact ? hp(28) : hp(30),
      alignItems: "center",
      justifyContent: "center",
      overflow: "visible",
    },
    orbitTrack: {
      width: 1,
      height: 1,
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
    },
    orbitBubble: {
      position: "absolute",
      backgroundColor: colors.background.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.background.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 5,
      elevation: 3,
    },
    orbitBubbleActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primaryLight,
      shadowColor: colors.accent.primary,
      shadowOpacity: 0.45,
      shadowRadius: 9,
    },
    orbitBubbleTalking: {
      borderColor: colors.status.active,
      shadowColor: colors.status.active,
      shadowOpacity: 0.85,
      shadowRadius: 14,
      elevation: 8,
    },
    orbitAvatarImage: {
      width: "100%",
      height: "100%",
      borderRadius: 999,
      backgroundColor: colors.background.tertiary,
    },
    orbitBubbleText: {
      color: colors.text.secondary,
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.tight,
    },
    orbitBubbleTextActive: {
      color: colors.text.primary,
    },
    glowRing: {
      position: "absolute",
      borderRadius: 999,
      borderWidth: 2,
      borderColor: colors.border.subtle,
      opacity: 0.3,
    },
    glowRing1: {
      width: isCompact ? s(220) : s(280),
      height: isCompact ? s(220) : s(280),
    },
    glowRing2: {
      width: isCompact ? s(180) : s(240),
      height: isCompact ? s(180) : s(240),
    },
    glowRing3: {
      width: isCompact ? s(150) : s(200),
      height: isCompact ? s(150) : s(200),
    },
    glowRingActive: {
      borderColor: colors.status.danger,
      opacity: 0.6,
    },
    pttButton: {
      width: isCompact ? s(130) : s(160),
      height: isCompact ? s(130) : s(160),
      borderRadius: isCompact ? s(65) : s(80),
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
      fontSize: s(48),
      marginBottom: 0,
    },
    pttIconWrap: {
      height: s(52),
      justifyContent: "center",
      alignItems: "center",
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
    toggleContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: isCompact ? spacing.xs : spacing.lg,
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
    signalInfoContainer: {
      alignItems: "center",
      paddingBottom: spacing.sm,
      gap: spacing.xs,
      minHeight: 36,
    },
    satText: {
      color: colors.status.active,
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
    },
    signalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
    },
    signalMetric: {
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.wide,
    },
    signalUnavailable: {
      color: colors.text.muted,
      fontSize: typography.size.xs,
    },
    hint: {
      color: colors.text.muted,
      fontSize: typography.size.sm,
      textAlign: "center",
      paddingBottom: (isCompact ? spacing.xs : spacing.xxl) + s(84),
      letterSpacing: typography.letterSpacing.wide,
    },
  });
}
