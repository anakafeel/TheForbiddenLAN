import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Modal } from '../src/components/Modal';
import { UserKeyManager } from '../src/components/UserKeyManager';
import { useAppStore } from '../src/store';
import { sharedStyles, theme } from '../src/theme';

export default function UsersPage() {
  const { users, keyGroups, devices, provisionUser, revokeUser, assignUserDevice, suspendUser } = useAppStore();
  const [assignUserId, setAssignUserId] = useState<string | null>(null);
  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const assignTarget = useMemo(() => users.find((user) => user.id === assignUserId), [users, assignUserId]);

  return (
    <View style={sharedStyles.screen}>
      <Text style={sharedStyles.pageTitle}>Users</Text>

      <UserKeyManager
        rows={users}
        keyGroups={keyGroups}
        onProvision={(userId) => {
          provisionUser(userId);
          setActionMessage(`Provisioning finalized for ${userId}.`);
        }}
        onRevoke={(userId) => {
          revokeUser(userId);
          setActionMessage(`Access revoked for ${userId}.`);
        }}
        onAssign={(userId) => {
          setAssignUserId(userId);
          setDeviceIdInput(users.find((user) => user.id === userId)?.assignedDeviceId ?? '');
        }}
        onSuspend={(userId) => {
          suspendUser(userId);
          setActionMessage(`Suspension state toggled for ${userId}.`);
        }}
      />

      <View style={styles.footerStrip}>
        <Text style={styles.footerText}>{actionMessage || 'Identity and key operations ready.'}</Text>
      </View>

      <Modal visible={assignUserId !== null} title="Assign Device" onClose={() => setAssignUserId(null)}>
        <Text style={styles.label}>User</Text>
        <Text style={styles.value}>{assignTarget?.displayName ?? assignUserId}</Text>
        <Text style={styles.label}>Device ID</Text>
        <TextInput
          value={deviceIdInput}
          onChangeText={setDeviceIdInput}
          style={styles.input}
          placeholder="dev-001"
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={styles.label}>Available Devices</Text>
        <Text style={styles.deviceList}>{devices.map((device) => device.id).join(', ')}</Text>

        <Pressable
          style={styles.confirmBtn}
          onPress={() => {
            if (!assignUserId || !deviceIdInput.trim()) {
              return;
            }
            assignUserDevice(assignUserId, deviceIdInput.trim());
            setActionMessage(`Assigned ${deviceIdInput.trim()} to ${assignUserId}.`);
            setAssignUserId(null);
          }}
        >
          <Text style={styles.confirmText}>Apply Assignment</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  footerStrip: {
    minHeight: 34,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  footerText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  value: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
    marginBottom: theme.spacing.xs,
  },
  input: {
    height: 38,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.sm,
    fontSize: theme.typography.body,
  },
  deviceList: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
  },
  confirmBtn: {
    minHeight: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2f8cff',
    backgroundColor: '#17467f',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  confirmText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
});
