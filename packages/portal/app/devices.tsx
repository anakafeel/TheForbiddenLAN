import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DeviceTable } from '../src/components/DeviceTable';
import { Modal } from '../src/components/Modal';
import { useAppStore } from '../src/store';
import { sharedStyles, theme } from '../src/theme';

export default function DevicesPage() {
  const { devices, disableDevice, rebootDevice, reassignDeviceTalkgroup } = useAppStore();
  const [logsDeviceId, setLogsDeviceId] = useState<string | null>(null);
  const [reassignDeviceId, setReassignDeviceId] = useState<string | null>(null);
  const [newTalkgroup, setNewTalkgroup] = useState('Operations');

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === logsDeviceId || device.id === reassignDeviceId),
    [devices, logsDeviceId, reassignDeviceId],
  );

  return (
    <View style={sharedStyles.screen}>
      <Text style={sharedStyles.pageTitle}>Devices</Text>

      <DeviceTable
        rows={devices}
        onDisable={disableDevice}
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
  logLine: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
});
