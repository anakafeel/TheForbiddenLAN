import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DeviceTable } from '../src/components/DeviceTable';
import { Modal } from '../src/components/Modal';
import { useAppStore } from '../src/store';
import { sharedStyles, theme } from '../src/theme';

export default function DevicesPage() {
  const { devices, disableDevice, rebootDevice, reassignDeviceTalkgroup, refreshData, isSyncing } = useAppStore();
  const [query, setQuery] = useState('');
  const [logsDeviceId, setLogsDeviceId] = useState<string | null>(null);
  const [reassignDeviceId, setReassignDeviceId] = useState<string | null>(null);
  const [newTalkgroup, setNewTalkgroup] = useState('Operations');

  const visibleDevices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return devices;
    }

    return devices.filter((device) => {
      return (
        device.id.toLowerCase().includes(normalized) ||
        device.label.toLowerCase().includes(normalized) ||
        (device.serial ?? '').toLowerCase().includes(normalized) ||
        (device.site ?? '').toLowerCase().includes(normalized)
      );
    });
  }, [devices, query]);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === logsDeviceId || device.id === reassignDeviceId),
    [devices, logsDeviceId, reassignDeviceId],
  );

  return (
    <View style={sharedStyles.screen}>
      <View style={styles.headerRow}>
        <Text style={sharedStyles.pageTitle}>Devices</Text>
        <Pressable style={styles.refreshButton} onPress={() => void refreshData()}>
          <Text style={styles.refreshText}>{isSyncing ? 'Syncing...' : 'Refresh'}</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder="Search by id, serial, label, site"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
        />
        <Text style={styles.counterText}>{visibleDevices.length} devices</Text>
      </View>

      <DeviceTable
        rows={visibleDevices}
        onToggleActive={(deviceId) => void disableDevice(deviceId)}
        onReboot={rebootDevice}
        onReassign={setReassignDeviceId}
        onLogs={setLogsDeviceId}
      />

      <Modal visible={logsDeviceId !== null} title={`Device Logs ${logsDeviceId ?? ''}`} onClose={() => setLogsDeviceId(null)}>
        <Text style={styles.logLine}>[{new Date().toISOString().slice(11, 19)}] Session opened by admin console.</Text>
        <Text style={styles.logLine}>[{new Date().toISOString().slice(11, 19)}] Firmware check: {selectedDevice?.firmware ?? 'n/a'}.</Text>
        <Text style={styles.logLine}>[{new Date().toISOString().slice(11, 19)}] Radio power level nominal.</Text>
        <Text style={styles.logLine}>[{new Date().toISOString().slice(11, 19)}] GPS heartbeat stable.</Text>
      </Modal>

      <Modal visible={reassignDeviceId !== null} title="Reassign Talkgroup" onClose={() => setReassignDeviceId(null)}>
        <Text style={styles.label}>Device</Text>
        <Text style={styles.value}>{reassignDeviceId ?? 'None'}</Text>
        <Text style={styles.label}>New Talkgroup</Text>
        <TextInput
          value={newTalkgroup}
          onChangeText={setNewTalkgroup}
          style={styles.input}
          placeholder="Operations"
          placeholderTextColor={theme.colors.textMuted}
        />
        <Pressable
          style={styles.confirmBtn}
          onPress={() => {
            if (!reassignDeviceId || newTalkgroup.trim().length < 2) {
              return;
            }
            reassignDeviceTalkgroup(reassignDeviceId, newTalkgroup.trim());
            setReassignDeviceId(null);
          }}
        >
          <Text style={styles.confirmText}>Apply Reassignment</Text>
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
  refreshButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  refreshText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
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
  confirmBtn: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  confirmText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  logLine: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
});
