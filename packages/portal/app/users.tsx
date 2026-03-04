import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Modal } from '../src/components/Modal';
import { UserKeyManager } from '../src/components/UserKeyManager';
import { useAppStore } from '../src/store';
import { sharedStyles, theme } from '../src/theme';

export default function UsersPage() {
  const {
    users,
    keyGroups,
    devices,
    provisionUser,
    revokeUser,
    assignUserDevice,
    suspendUser,
    registerUser,
    refreshData,
    isSyncing,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [assignUserId, setAssignUserId] = useState<string | null>(null);
  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newSerial, setNewSerial] = useState('');
  const [newSite, setNewSite] = useState('');

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return users;
    }

    return users.filter((user) => {
      return (
        user.id.toLowerCase().includes(normalized) ||
        user.displayName.toLowerCase().includes(normalized) ||
        (user.assignedDeviceId ?? '').toLowerCase().includes(normalized) ||
        user.role.toLowerCase().includes(normalized)
      );
    });
  }, [users, query]);

  const assignTarget = useMemo(() => users.find((user) => user.id === assignUserId), [users, assignUserId]);

  return (
    <View style={sharedStyles.screen}>
      <View style={styles.headerRow}>
        <Text style={sharedStyles.pageTitle}>Users</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.secondaryButton} onPress={() => void refreshData()}>
            <Text style={styles.buttonText}>{isSyncing ? 'Syncing...' : 'Refresh'}</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => setShowCreateModal(true)}>
            <Text style={styles.buttonText}>Create User</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.filters}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder="Search by name, id, role, device"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
        />
        <Text style={styles.counterText}>{filteredUsers.length} users</Text>
      </View>

      <UserKeyManager
        rows={filteredUsers}
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
          style={styles.primaryButton}
          onPress={() => {
            if (!assignUserId || !deviceIdInput.trim()) {
              return;
            }
            assignUserDevice(assignUserId, deviceIdInput.trim());
            setActionMessage(`Assigned ${deviceIdInput.trim()} to ${assignUserId}.`);
            setAssignUserId(null);
          }}
        >
          <Text style={styles.buttonText}>Apply Assignment</Text>
        </Pressable>
      </Modal>

      <Modal visible={showCreateModal} title="Register New User" onClose={() => setShowCreateModal(false)}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          value={newUsername}
          onChangeText={setNewUsername}
          style={styles.input}
          placeholder="new_operator"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          style={styles.input}
          placeholder="temporary-password"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          secureTextEntry
        />

        <Text style={styles.label}>Device Serial (optional)</Text>
        <TextInput
          value={newSerial}
          onChangeText={setNewSerial}
          style={styles.input}
          placeholder="DLS-140-SERIAL"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Site (optional)</Text>
        <TextInput
          value={newSite}
          onChangeText={setNewSite}
          style={styles.input}
          placeholder="north"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
        />

        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            if (newUsername.trim().length < 3 || newPassword.trim().length < 3) {
              return;
            }
            void registerUser({
              username: newUsername.trim(),
              password: newPassword,
              deviceSerial: newSerial.trim() || undefined,
              site: newSite.trim() || undefined,
            }).then((ok) => {
              if (!ok) {
                return;
              }
              setActionMessage(`User ${newUsername.trim()} registered.`);
              setNewUsername('');
              setNewPassword('');
              setNewSerial('');
              setNewSite('');
              setShowCreateModal(false);
            });
          }}
        >
          <Text style={styles.buttonText}>Create User</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  filters: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  searchInput: {
    minWidth: 280,
    maxWidth: 460,
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.background.tertiary,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
    paddingHorizontal: theme.spacing.sm,
  },
  counterText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '600',
  },
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
    height: 36,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.background.tertiary,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.sm,
    fontSize: theme.typography.body,
  },
  deviceList: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
  },
  primaryButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  secondaryButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  buttonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
});
