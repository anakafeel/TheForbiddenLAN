import React, { useContext, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { ChannelContext } from '../context/ChannelContext';
import { startAudioStream, stopAudioStream } from '../utils/audio';
import { emitStartTalking, emitStopTalking, joinChannel } from '../utils/socket';
import { onFloorDenied, getFloorState } from '../utils/comms';
import { CONFIG } from '../config';
import theme from '../theme';

const { colors, spacing, radius, typography } = theme;

export default function PTTScreen({ navigation }) {
  const { current } = useContext(ChannelContext);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [channelBusy, setChannelBusy] = useState(false);
  const [busyHolder, setBusyHolder] = useState(null);

  // Register floor-deny callback — fires when server rejects PTT (walk-on prevention)
  useEffect(() => {
    onFloorDenied((talkgroup, holder) => {
      console.warn(`[PTTScreen] Floor denied on ${talkgroup} — held by ${holder}`);
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

  const handlePTTToggle = async () => {
    if (!current) return;
    
    if (isTransmitting) {
      // Stop transmitting: finish capture and send the chunk BEFORE clearing
      // the PTT state. ForbiddenLANComms.sendAudioChunk() guards on isTransmitting —
      // calling emitStopTalking first would set it to false and silently drop the audio.
      setIsTransmitting(false);
      await stopAudioStream();   // reads file → encrypts → sendAudioChunk() while still active
      emitStopTalking(CONFIG.DEVICE_ID, current.id);  // clears isTransmitting + sends PTT_END
    } else {
      // Walk-on check: emitStartTalking returns false if floor is taken
      const accepted = emitStartTalking(CONFIG.DEVICE_ID, current.id);
      if (accepted === false) {
        // Floor is taken — show "Channel Busy" feedback
        const floorState = getFloorState();
        setChannelBusy(true);
        setBusyHolder(floorState.holder);
        setTimeout(() => { setChannelBusy(false); setBusyHolder(null); }, 3000);
        return;
      }
      // Start transmitting (optimistic — server may still deny via FLOOR_DENY)
      setIsTransmitting(true);
      try {
        await startAudioStream();
      } catch (e) {
        console.warn('Audio start error:', e);
      }
    }
  };

  // No channel selected - show prompt to select
  if (!current) {
    return (
      <View style={styles.container}>
        <View style={styles.noChannelContainer}>
          <Text style={styles.noChannelIcon}>📡</Text>
          <Text style={styles.noChannelTitle}>No Channel Selected</Text>
          <Text style={styles.noChannelSubtitle}>Select a channel to start communicating</Text>
          <TouchableOpacity
            style={styles.selectChannelBtn}
            onPress={() => navigation.navigate('Channels')}
          >
            <Text style={styles.selectChannelText}>GO TO CHANNELS</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Channel Header */}
      <View style={styles.channelHeader}>
        <View style={styles.channelBadge}>
          <View style={[styles.liveDot, (currentSpeaker || isTransmitting) && styles.liveDotActive]} />
          <Text style={styles.channelLabel}>LIVE CHANNEL</Text>
        </View>
        <Text style={styles.channelName}>{current.name}</Text>
        <Text style={styles.channelUsers}>👤 {current.users || 0} Online</Text>
      </View>

      {/* Speaking Status */}
      <View style={[
        styles.speakingBar, 
        (currentSpeaker || isTransmitting) && styles.speakingBarActive,
        channelBusy && styles.speakingBarBusy,
      ]}>
        <Text style={styles.speakingText}>
          {channelBusy
            ? `🚫 CHANNEL BUSY — ${busyHolder || 'another device'} is transmitting`
            : isTransmitting 
              ? '📡 YOU ARE TRANSMITTING' 
              : currentSpeaker 
                ? `🎙️ NOW SPEAKING: ${currentSpeaker}` 
                : '— Channel idle —'}
        </Text>
      </View>

      {/* Main PTT Area */}
      <View style={styles.pttArea}>
        {/* Glow rings */}
        <View style={[styles.glowRing, styles.glowRing1, isTransmitting && styles.glowRingActive]} />
        <View style={[styles.glowRing, styles.glowRing2, isTransmitting && styles.glowRingActive]} />
        <View style={[styles.glowRing, styles.glowRing3, isTransmitting && styles.glowRingActive]} />
        
        {/* PTT Button */}
        <Pressable
          onPress={handlePTTToggle}
          style={({ pressed }) => [
            styles.pttButton,
            isTransmitting && styles.pttButtonActive,
            pressed && styles.pttButtonPressed,
          ]}
        >
          <Text style={styles.pttIcon}>{isTransmitting ? '🔴' : '🎙️'}</Text>
          <Text style={[styles.pttLabel, isTransmitting && styles.pttLabelActive]}>
            {isTransmitting ? 'TRANSMITTING' : 'PUSH TO TALK'}
          </Text>
        </Pressable>
      </View>

      {/* Hint */}
      <Text style={styles.hint}>
        {isTransmitting ? 'Tap to stop transmitting' : 'Tap to start transmitting'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  // No channel state
  noChannelContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    textAlign: 'center',
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
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  channelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
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
  // Speaking bar
  speakingBar: {
    backgroundColor: colors.background.tertiary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  speakingBarActive: {
    backgroundColor: colors.status.activeGlow,
  },
  speakingBarBusy: {
    backgroundColor: '#FF4444',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
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
    alignItems: 'center',
    justifyContent: 'center',
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
    borderColor: '#FF6B6B',
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
  // Hint
  hint: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    textAlign: 'center',
    paddingBottom: spacing.xl,
    letterSpacing: typography.letterSpacing.wide,
  },
});
