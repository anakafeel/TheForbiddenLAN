import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import NetworkInfo from '../components/NetworkInfo.jsx';
import UserStatus from '../components/UserStatus.jsx';
import PTTButton from '../components/PTTButton.jsx';
import { ChannelContext } from '../context/ChannelContext';
import { CONFIG } from '../config';
import theme from '../theme';

const { colors, spacing, radius, shadows, typography } = theme;

// Stats Panel Component
function StatsPanel() {
  return (
    <View style={styles.statsContainer}>
      <View style={styles.statItem}>
        <Text style={styles.statLabel}>LATENCY</Text>
        <Text style={styles.statValue}>04:03</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={styles.statLabel}>UPLINK</Text>
        <Text style={styles.statValue}>UTR-Y02</Text>
      </View>
    </View>
  );
}

// Speaking Status Component
function SpeakingStatus({ userName }) {
  return (
    <View style={styles.speakingContainer}>
      <View style={styles.speakingDot} />
      <Text style={styles.speakingLabel}>Now Speaking: </Text>
      <Text style={styles.speakingName}>{userName || 'ECHO-1'}</Text>
    </View>
  );
}

// Channel Info Bar
function ChannelInfoBar({ channel, onSwitch }) {
  return (
    <View style={styles.channelBar}>
      <View style={styles.channelInfo}>
        <Text style={styles.channelBarLabel}>ACTIVE CHANNEL</Text>
        <Text style={styles.channelBarName}>{channel?.name || 'TACTICAL-MAIN'}</Text>
      </View>
      <View style={styles.channelFreq}>
        <Text style={styles.freqValue}>420.065 MHz</Text>
      </View>
    </View>
  );
}

// Control Buttons
function ControlButtons() {
  const buttons = [
    { icon: '📋', label: 'VOL-1' },
    { icon: '🎛️', label: 'HQ' },
    { icon: '⭐', label: '' },
  ];

  return (
    <View style={styles.controlsContainer}>
      {buttons.map((btn, idx) => (
        <TouchableOpacity key={idx} style={styles.controlBtn}>
          <View style={styles.controlBtnInner}>
            <Text style={styles.controlIcon}>{btn.icon}</Text>
          </View>
          {btn.label && <Text style={styles.controlLabel}>{btn.label}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function PTTScreen({ navigation }) {
  const { current } = useContext(ChannelContext);
  const [transmitting, setTransmitting] = useState(false);
  const [channelBusy, setChannelBusy] = useState(true);

  return (
    <View style={styles.container}>
      {/* Stats Header */}
      <StatsPanel />

      {/* Speaking Status */}
      <SpeakingStatus />

      {/* Main PTT Area */}
      <View style={styles.pttArea}>
        {/* Audio Waveform Visualization Placeholder */}
        <View style={styles.waveformContainer}>
          <View style={styles.waveform}>
            {[...Array(40)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.waveformBar,
                  { height: Math.random() * 30 + 5 }
                ]}
              />
            ))}
          </View>
          <Text style={styles.rxLabel}>RX: 334.4</Text>
        </View>

        {/* PTT Button */}
        <View style={styles.pttButtonContainer}>
          {current ? (
            <PTTButton 
              userId="user123" 
              onTransmitChange={setTransmitting}
            />
          ) : (
            <TouchableOpacity
              style={styles.selectChannelBtn}
              onPress={() => navigation.navigate('Channels')}
            >
              <Text style={styles.selectChannelText}>SELECT CHANNEL</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Control Buttons */}
        <ControlButtons />
      </View>

      {/* Channel Info Bar */}
      <ChannelInfoBar channel={current} />

      {/* Channel Busy Warning */}
      {channelBusy && (
        <View style={styles.busyBanner}>
          <Text style={styles.busyText}>⚠️ CHANNEL BUSY - WAIT FOR CLEARANCE</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  statItem: {
    alignItems: 'center',
    marginHorizontal: spacing.lg,
  },
  statLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom: spacing.xs,
  },
  statValue: {
    color: colors.text.primary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border.subtle,
  },
  speakingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.status.active,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text.inverse,
    marginRight: spacing.sm,
  },
  speakingLabel: {
    color: colors.text.inverse,
    fontSize: typography.size.sm,
  },
  speakingName: {
    color: colors.text.inverse,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  pttArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  waveformContainer: {
    width: '80%',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 40,
  },
  waveformBar: {
    width: 3,
    backgroundColor: colors.accent.primary,
    borderRadius: 1,
    opacity: 0.6,
    marginHorizontal: 1,
  },
  rxLabel: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    marginTop: spacing.sm,
  },
  pttButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xl,
  },
  selectChannelBtn: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.background.tertiary,
    borderWidth: 3,
    borderColor: colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectChannelText: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  controlBtn: {
    alignItems: 'center',
    marginHorizontal: spacing.lg,
  },
  controlBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlIcon: {
    fontSize: 24,
  },
  controlLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
  },
  channelBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  channelInfo: {},
  channelBarLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom: spacing.xs,
  },
  channelBarName: {
    color: colors.accent.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  channelFreq: {
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  freqValue: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  busyBanner: {
    backgroundColor: colors.status.warning,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  busyText: {
    color: colors.text.inverse,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
});
