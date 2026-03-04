import React, { useState } from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { startAudioStream, stopAudioStream } from '../utils/audio';
import { emitStartTalking, emitStopTalking } from '../utils/socket';
import theme from '../theme';

const { colors, spacing, typography } = theme;

export default function PTTButton({ userId, onTransmitChange }) {
  const [transmitting, setTransmitting] = useState(false);

  const onPressIn = async () => {
    if (transmitting) return;

    setTransmitting(true);
    onTransmitChange?.(true);

    emitStartTalking(userId);

    try {
      await startAudioStream();
    } catch (e) {
      console.warn('Audio start error:', e);
    }
  };

  const onPressOut = async () => {
    if (!transmitting) return;

    setTransmitting(false);
    onTransmitChange?.(false);

    try {
      await stopAudioStream();
    } catch (e) {
      console.warn('Audio stop error:', e);
    }

    emitStopTalking(userId);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.outerRing, transmitting && styles.outerRingActive]} />
      <View style={[styles.middleRing, transmitting && styles.middleRingActive]} />

      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.button,
          transmitting && styles.transmitting,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.buttonInner}>
          <Text style={styles.icon}>🎙️</Text>

          <Text style={[styles.text, transmitting && styles.textActive]}>
            {transmitting ? 'TRANSMITTING' : 'PUSH TO TALK'}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },

  outerRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    opacity: 0.3,
  },

  outerRingActive: {
    borderColor: colors.status.danger,
    opacity: 0.6,
  },

  middleRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: colors.border.medium,
    opacity: 0.5,
  },

  middleRingActive: {
    borderColor: colors.status.danger,
    opacity: 0.8,
  },

  button: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: colors.accent.primaryLight,
  },

  transmitting: {
    backgroundColor: colors.status.danger,
    borderColor: '#FF6B6B',
  },

  pressed: {
    transform: [{ scale: 0.95 }],
  },

  buttonInner: {
    alignItems: 'center',
  },

  icon: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },

  text: {
    color: colors.text.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },

  textActive: {
    color: colors.text.primary,
  },
});
