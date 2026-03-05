import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Animated,
} from 'react-native';
import { useAppTheme } from '../theme';

// Animated waveform bars for speaking indicator
function AnimatedWaveform({ active, styles }) {
  const bars = Array(12).fill(0);
  const animations = useRef(bars.map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    if (active) {
      const animateBar = (index) => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(animations[index], {
              toValue: Math.random() * 0.7 + 0.3,
              duration: 150 + Math.random() * 100,
              useNativeDriver: false,
            }),
            Animated.timing(animations[index], {
              toValue: 0.2 + Math.random() * 0.3,
              duration: 150 + Math.random() * 100,
              useNativeDriver: false,
            }),
          ])
        ).start();
      };
      bars.forEach((_, i) => animateBar(i));
    } else {
      animations.forEach((anim) => {
        anim.stopAnimation();
        anim.setValue(0.3);
      });
    }
  }, [active, animations, bars]);

  return (
    <View style={styles.waveformBars}>
      {bars.map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            {
              transform: [{ scaleY: animations[i] }],
            },
          ]}
        />
      ))}
    </View>
  );
}

// Header Component
function Header({ channelName, onBack, isConnected, onSettings, participantCount, styles }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backIcon}>←</Text>
      </TouchableOpacity>

      <View style={styles.headerCenter}>
        <Text style={styles.channelName}>{channelName}</Text>
        <View style={styles.connectionStatus}>
          <View style={[styles.statusDot, isConnected ? styles.statusConnected : styles.statusDisconnected]} />
          <Text style={styles.statusText}>{isConnected ? 'CONNECTED' : 'CONNECTING...'}</Text>
        </View>
      </View>

      <View style={styles.headerRight}>
        <TouchableOpacity style={styles.headerIconBtn}>
          <Text style={styles.headerIcon}>👥</Text>
          <View style={styles.participantBadge}>
            <Text style={styles.participantCount}>{participantCount}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIconBtn} onPress={onSettings}>
          <Text style={styles.headerIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Info Bar showing active users
function InfoBar({ activeUsers, styles }) {
  return (
    <View style={styles.infoBar}>
      <View style={styles.activeIndicator}>
        <View style={styles.pulsingDot} />
        <Text style={styles.activeLabel}>LIVE</Text>
      </View>
      <Text style={styles.activeUsers}>
        {activeUsers.length} active • {activeUsers.slice(0, 3).join(', ')}
        {activeUsers.length > 3 && ` +${activeUsers.length - 3}`}
      </Text>
    </View>
  );
}

// Message Item Component
function MessageItem({ message, styles }) {
  const isSystem = message.type === 'system';
  const isOwn = message.isOwn;

  if (isSystem) {
    return (
      <View style={styles.systemMessage}>
        <View style={styles.systemLine} />
        <Text style={styles.systemText}>{message.text}</Text>
        <View style={styles.systemLine} />
      </View>
    );
  }

  return (
    <View style={[styles.messageContainer, isOwn && styles.messageOwn]}>
      <View style={[styles.messageBubble, isOwn && styles.messageBubbleOwn]}>
        <View style={styles.messageHeader}>
          <Text style={[styles.messageUser, isOwn && styles.messageUserOwn]}>{message.user}</Text>
          <Text style={styles.messageTime}>{message.time}</Text>
        </View>
        <Text style={styles.messageText}>{message.text}</Text>
      </View>
    </View>
  );
}

// Voice Transmission Item
function VoiceTransmission({ transmission, styles }) {
  return (
    <View style={styles.voiceTransmission}>
      <View style={styles.voiceIcon}>
        <Text style={styles.voiceEmoji}>🎙</Text>
      </View>
      <View style={styles.voiceInfo}>
        <Text style={styles.voiceUser}>{transmission.user}</Text>
        <Text style={styles.voiceDuration}>{transmission.duration}</Text>
      </View>
      <Text style={styles.voiceTime}>{transmission.time}</Text>
    </View>
  );
}

// Speaking Indicator Component
function SpeakingIndicator({ speaker, isActive, styles }) {
  if (!isActive) return null;

  return (
    <View style={styles.speakingIndicator}>
      <View style={styles.speakingGlow} />
      <View style={styles.speakingContent}>
        <Text style={styles.nowSpeakingLabel}>NOW SPEAKING</Text>
        <Text style={styles.speakerName}>{speaker}</Text>
        <AnimatedWaveform active={isActive} styles={styles} />
      </View>
    </View>
  );
}

// Bottom Control Panel - Large Circular PTT
function ControlPanel({ onPTTStart, onPTTEnd, isTransmitting, styles }) {
  return (
    <View style={styles.controlPanel}>
      <View style={styles.pttContainer}>
        {/* Outer glow rings */}
        <View style={[styles.pttGlowOuter, isTransmitting && styles.pttGlowOuterActive]} />
        <View style={[styles.pttGlowMiddle, isTransmitting && styles.pttGlowMiddleActive]} />
        <View style={[styles.pttGlowInner, isTransmitting && styles.pttGlowInnerActive]} />
        
        {/* Main PTT Button */}
        <Pressable
          onPressIn={onPTTStart}
          onPressOut={onPTTEnd}
          style={({ pressed }) => [
            styles.pttButton,
            isTransmitting && styles.pttButtonActive,
            pressed && styles.pttButtonPressed,
          ]}
        >
          <Text style={styles.pttIcon}>🎙️</Text>
          <Text style={[styles.pttLabel, isTransmitting && styles.pttLabelActive]}>
            {isTransmitting ? 'TRANSMITTING' : 'PUSH TO TALK'}
          </Text>
        </Pressable>
      </View>
      
      {/* Status text below button */}
      <Text style={styles.pttHint}>
        {isTransmitting ? 'Release to stop' : 'Press and hold to transmit'}
      </Text>
    </View>
  );
}

// Main VoiceChannelChatPage Component
export default function VoiceChannelChatPage({ navigation, route }) {
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );
  const channelName = route?.params?.channelName || 'TACTICAL-MAIN';
  const channelId = route?.params?.channelId || 'default';

  const [isConnected, setIsConnected] = useState(true);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const scrollViewRef = useRef(null);

  // Mock data for demonstration
  const [activeUsers] = useState(['ECHO-1', 'BRAVO-2', 'CHARLIE-3', 'DELTA-4']);
  const [messages, setMessages] = useState([
    { id: 1, type: 'system', text: 'Channel secured • AES-256 encryption active' },
    { id: 2, type: 'voice', user: 'ECHO-1', duration: '0:04', time: '14:32', isOwn: false },
    { id: 3, type: 'voice', user: 'BRAVO-2', duration: '0:12', time: '14:33', isOwn: false },
    { id: 4, type: 'voice', user: 'You', duration: '0:08', time: '14:35', isOwn: true },
    { id: 5, type: 'system', text: 'DELTA-4 joined the channel' },
    { id: 6, type: 'voice', user: 'CHARLIE-3', duration: '0:05', time: '14:36', isOwn: false },
  ]);

  // Simulate real-time speaker updates
  useEffect(() => {
    const speakerInterval = setInterval(() => {
      // Random speaker simulation
      if (!isTransmitting && Math.random() > 0.7) {
        const randomUser = activeUsers[Math.floor(Math.random() * activeUsers.length)];
        setCurrentSpeaker(randomUser);
        setTimeout(() => setCurrentSpeaker(null), 2000 + Math.random() * 3000);
      }
    }, 5000);

    return () => clearInterval(speakerInterval);
  }, [isTransmitting, activeUsers]);

  // Auto-scroll to new messages
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const handlePTTStart = useCallback(() => {
    setIsTransmitting(true);
    setCurrentSpeaker('You');
    // TODO: Start audio capture and transmission
  }, []);

  const handlePTTEnd = useCallback(() => {
    setIsTransmitting(false);
    setCurrentSpeaker(null);

    // Add voice transmission to messages
    const newTransmission = {
      id: Date.now(),
      type: 'voice',
      user: 'You',
      duration: '0:03',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      isOwn: true,
    };
    setMessages((prev) => [...prev, newTransmission]);
    // TODO: Stop audio capture and send final transmission
  }, []);

  const handleBack = useCallback(() => {
    navigation?.goBack?.() || navigation?.navigate?.('PTT');
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <Header
        channelName={channelName}
        onBack={handleBack}
        isConnected={isConnected}
        participantCount={activeUsers.length}
        onSettings={() => {}}
        styles={styles}
      />

      {/* Info Bar */}
      <InfoBar activeUsers={activeUsers} styles={styles} />

      {/* Messages List */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg) =>
          msg.type === 'voice' ? (
            <VoiceTransmission key={msg.id} transmission={msg} styles={styles} />
          ) : (
            <MessageItem key={msg.id} message={msg} styles={styles} />
          )
        )}
      </ScrollView>

      {/* Speaking Indicator */}
      <SpeakingIndicator speaker={currentSpeaker} isActive={!!currentSpeaker} styles={styles} />

      {/* Bottom Control Panel */}
      <ControlPanel
        onPTTStart={handlePTTStart}
        onPTTEnd={handlePTTEnd}
        isTransmitting={isTransmitting}
        styles={styles}
      />
    </View>
  );
}

function createStyles(colors, spacing, radius, typography) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },

  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  backIcon: {
    color: colors.text.primary,
    fontSize: 20,
  },
  headerCenter: {
    flex: 1,
    marginLeft: spacing.md,
  },
  channelName: {
    color: colors.accent.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  statusConnected: {
    backgroundColor: colors.status.active,
  },
  statusDisconnected: {
    backgroundColor: colors.status.warning,
  },
  statusText: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.wider,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  headerIcon: {
    fontSize: 18,
  },
  participantBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.accent.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantCount: {
    color: colors.text.inverse,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },

  // Info Bar styles
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.status.dangerGlow,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    marginRight: spacing.md,
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.status.danger,
    marginRight: spacing.xs,
  },
  activeLabel: {
    color: colors.status.danger,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wider,
  },
  activeUsers: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
  },

  // Messages List styles
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Message styles
  messageContainer: {
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  messageOwn: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    backgroundColor: colors.background.card,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
    padding: spacing.md,
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  messageBubbleOwn: {
    backgroundColor: colors.accent.primaryDark,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.sm,
    borderColor: colors.accent.primary,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  messageUser: {
    color: colors.accent.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  messageUserOwn: {
    color: colors.text.primary,
  },
  messageTime: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    marginLeft: spacing.md,
  },
  messageText: {
    color: colors.text.primary,
    fontSize: typography.size.md,
    lineHeight: 20,
  },

  // System message styles
  systemMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  systemLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.subtle,
  },
  systemText: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    marginHorizontal: spacing.md,
    textAlign: 'center',
    letterSpacing: typography.letterSpacing.wide,
  },

  // Voice Transmission styles
  voiceTransmission: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  voiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent.glow,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  voiceEmoji: {
    fontSize: 18,
  },
  voiceInfo: {
    flex: 1,
  },
  voiceUser: {
    color: colors.accent.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  voiceDuration: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    marginTop: 2,
  },
  voiceTime: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
  },

  // Speaking Indicator styles
  speakingIndicator: {
    backgroundColor: colors.status.active,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  speakingGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.status.activeGlow,
    opacity: 0.3,
  },
  speakingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  nowSpeakingLabel: {
    color: colors.text.inverse,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    letterSpacing: typography.letterSpacing.wider,
    marginRight: spacing.sm,
  },
  speakerName: {
    color: colors.text.inverse,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    marginRight: spacing.md,
  },
  waveformBars: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
  },
  waveBar: {
    width: 3,
    height: 16,
    backgroundColor: colors.text.inverse,
    borderRadius: 1.5,
    marginHorizontal: 1,
  },

  // Control Panel styles
  controlPanel: {
    backgroundColor: colors.background.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },

  // PTT Button styles
  pttContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    height: 220,
  },
  pttGlowOuter: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    opacity: 0.3,
  },
  pttGlowOuterActive: {
    borderColor: colors.status.danger,
    opacity: 0.8,
    shadowColor: colors.status.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  pttGlowMiddle: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: colors.border.medium,
    opacity: 0.4,
  },
  pttGlowMiddleActive: {
    borderColor: colors.status.danger,
    opacity: 0.9,
  },
  pttGlowInner: {
    position: 'absolute',
    width: 165,
    height: 165,
    borderRadius: 82.5,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    opacity: 0.3,
  },
  pttGlowInnerActive: {
    borderColor: colors.status.danger,
    opacity: 0.7,
  },
  pttButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: colors.accent.primary,
    borderWidth: 4,
    borderColor: colors.accent.primaryLight,
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  pttButtonActive: {
    backgroundColor: colors.status.danger,
    borderColor: colors.status.danger,
    shadowColor: colors.status.danger,
    shadowOpacity: 0.9,
    shadowRadius: 40,
  },
  pttButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  pttIcon: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  pttLabel: {
    color: colors.text.inverse,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wider,
    textAlign: 'center',
  },
  pttLabelActive: {
    color: colors.text.inverse,
  },
  pttHint: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    marginTop: spacing.md,
    letterSpacing: typography.letterSpacing.wide,
  },
  });
}
