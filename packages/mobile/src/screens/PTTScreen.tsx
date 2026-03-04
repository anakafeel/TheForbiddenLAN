import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChannelContext } from '../context/ChannelContext';
import PTTButton from '../components/PTTButton';
import { CONFIG } from '../config';
import theme from '../theme';

const { colors, spacing, typography } = theme;

export default function PTTScreen({ navigation }) {
  const { current } = useContext(ChannelContext);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);

  useEffect(() => {
    if (!current || isTransmitting) {
      setCurrentSpeaker(null);
      return;
    }

    const speakers = ['ECHO-1', 'BRAVO-2', 'CHARLIE-3', 'DELTA-4'];

    const interval = setInterval(() => {
      if (Math.random() > 0.6) {
        const speaker = speakers[Math.floor(Math.random() * speakers.length)];

        setCurrentSpeaker(speaker);

        setTimeout(() => setCurrentSpeaker(null), 3000);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [current, isTransmitting]);

  if (!current) {
    return (
      <View style={styles.container}>
        <View style={styles.noChannelContainer}>

          <Text style={styles.noChannelIcon}>📡</Text>

          <Text style={styles.noChannelTitle}>
            No Channel Selected
          </Text>

          <Text style={styles.noChannelSubtitle}>
            Select a channel to start communicating
          </Text>

          <TouchableOpacity
            style={styles.selectChannelBtn}
            onPress={() => navigation.navigate('Channels')}
          >
            <Text style={styles.selectChannelText}>
              GO TO CHANNELS
            </Text>
          </TouchableOpacity>

        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Channel Header */}

      <View style={styles.channelHeader}>

        <Text style={styles.channelName}>
          {current.name}
        </Text>

        <Text style={styles.channelUsers}>
          👤 {current.users || 0} Online
        </Text>

      </View>

      {/* Speaking Status */}

      <View
        style={[
          styles.speakingBar,
          (currentSpeaker || isTransmitting) && styles.speakingBarActive
        ]}
      >

        <Text style={styles.speakingText}>
          {isTransmitting
            ? '📡 YOU ARE TRANSMITTING'
            : currentSpeaker
            ? `🎙️ NOW SPEAKING: ${currentSpeaker}`
            : '— Channel idle —'}
        </Text>

      </View>

      {/* PTT Button */}

      <View style={styles.pttArea}>

        <PTTButton
          userId={CONFIG.DEVICE_ID}
          onTransmitChange={setIsTransmitting}
        />

      </View>

      {/* Hint */}

      <Text style={styles.hint}>
        {isTransmitting
          ? 'Release to stop transmitting'
          : 'Hold the button to talk'}
      </Text>

    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },

  noChannelContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },

  noChannelIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },

  noChannelTitle: {
    color: colors.text.primary,
    fontSize: typography.size.xl,
    fontWeight: 'bold',
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
    borderRadius: 10,
  },

  selectChannelText: {
    color: colors.text.inverse,
    fontWeight: 'bold',
  },

  channelHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.background.secondary,
  },

  channelName: {
    color: colors.text.primary,
    fontSize: typography.size.xxl,
    fontWeight: 'bold',
  },

  channelUsers: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
  },

  speakingBar: {
    backgroundColor: colors.background.tertiary,
    padding: spacing.md,
    alignItems: 'center',
  },

  speakingBarActive: {
    backgroundColor: colors.status.activeGlow,
  },

  speakingText: {
    color: colors.text.secondary,
  },

  pttArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hint: {
    textAlign: 'center',
    color: colors.text.muted,
    paddingBottom: spacing.xl,
  },

});