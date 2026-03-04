import React, { PropsWithChildren } from 'react';
import { Modal as RNModal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

interface ModalProps extends PropsWithChildren {
  visible: boolean;
  title: string;
  onClose: () => void;
  width?: number;
}

export function Modal({ visible, title, onClose, width = 520, children }: ModalProps) {
  const containerStyle = { ...styles.container, width };

  return (
    <RNModal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={containerStyle}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.body}>{children}</View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  container: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    overflow: 'hidden',
  },
  header: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading,
    fontWeight: '600',
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceMuted,
  },
  closeText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '600',
  },
  body: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
});
