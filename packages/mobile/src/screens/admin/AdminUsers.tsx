// Admin Users — list users + register new user form.
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, StyleSheet, Alert, Platform } from 'react-native';
import { api } from '../../lib/api';
import { useAppTheme } from '../../theme';
import { useStore } from '../../store';
import { CONFIG } from '../../config';

export function AdminUsers() {
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const authUser = useStore((s) => s.user);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/users');
      setUsers(res.users ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      setError('Enter both username and password');
      return;
    }
    try {
      await api.post('/auth/register', { username: newUsername.trim(), password: newPassword.trim() });
      setNewUsername('');
      setNewPassword('');
      setError('');
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const confirmDelete = useCallback((username: string) => {
    const message = `Delete user "${username}" from the server? This cannot be undone.`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        return Promise.resolve(window.confirm(message));
      }
      // If confirm is unavailable in this runtime, do not silently block deletes.
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      Alert.alert(
        'Delete User',
        message,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  }, []);

  const removeUser = useCallback(async (item: any) => {
    if (!item?.id || !item?.username) return;
    if (item.id === authUser?.sub) {
      setError('You cannot remove the currently logged-in admin.');
      return;
    }

    const confirmed = await confirmDelete(item.username);
    if (!confirmed) return;

    setDeletingUserId(item.id);
    setError('');
    try {
      let triedDeleteMethod = false;
      try {
        // Prefer POST fallback endpoint (more proxy/CORS-friendly than DELETE).
        await api.post(`/users/${item.id}/remove`);
      } catch (postErr: any) {
        const status = Number(postErr?.status || 0);
        // Backward compatibility for servers that only support DELETE /users/:id.
        if ([404, 405, 501].includes(status)) {
          triedDeleteMethod = true;
          await api.delete(`/users/${item.id}`);
        } else {
          throw postErr;
        }
      }

      let listRes = await api.get('/users');
      let nextUsers = Array.isArray(listRes?.users) ? listRes.users : [];
      let stillExists = nextUsers.some((u: any) => u?.id === item.id);

      // If POST succeeded but server still reports the user, force a DELETE retry once.
      if (stillExists && !triedDeleteMethod) {
        triedDeleteMethod = true;
        await api.delete(`/users/${item.id}`).catch(() => {});
        listRes = await api.get('/users');
        nextUsers = Array.isArray(listRes?.users) ? listRes.users : [];
        stillExists = nextUsers.some((u: any) => u?.id === item.id);
      }

      if (stillExists) {
        throw new Error(
          `User still exists after remove request on API target ${CONFIG.API_URL}.`,
        );
      }

      setUsers(nextUsers);
    } catch (e: any) {
      const apiMessage = e?.body?.error;
      setError(
        typeof apiMessage === 'string' ? apiMessage : (e?.message ?? 'Failed to delete user'),
      );
    } finally {
      setDeletingUserId(null);
    }
  }, [authUser?.sub, confirmDelete, load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.status.info} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {!!error && <Text style={styles.error}>{error}</Text>}

      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.countText}>{users.length} user{users.length !== 1 ? 's' : ''}</Text>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {/* Register form card */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Register New User</Text>
        </View>
        <View style={styles.formBody}>
          <TextInput
            placeholder="Username"
            placeholderTextColor={colors.text.muted}
            value={newUsername}
            onChangeText={setNewUsername}
            style={styles.input}
            autoCapitalize="none"
          />
          <TextInput
            placeholder="Password"
            placeholderTextColor={colors.text.muted}
            value={newPassword}
            onChangeText={setNewPassword}
            style={styles.input}
            secureTextEntry
          />
          <Pressable onPress={register} style={styles.registerBtn}>
            <Text style={styles.registerText}>Register User</Text>
          </Pressable>
        </View>
      </View>

      {/* User list card */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All Users</Text>
          <Text style={styles.sectionCount}>{users.length}</Text>
        </View>
        {users.length === 0 ? (
          <Text style={styles.empty}>No users registered</Text>
        ) : (
          users.map((item, index) => (
            <View key={item.id} style={[styles.row, index === users.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.username.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.username}</Text>
                <Text style={styles.sub}>
                  {item.device_id ? `Device: ${item.device_id.slice(0, 8)}...` : 'No device'}
                  {' \u00B7 '}
                  {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                </Text>
              </View>
              <View style={[
                styles.roleBadge,
                { backgroundColor: item.role === 'admin' ? colors.status.warningSubtle : colors.status.activeSubtle }
              ]}>
                <Text style={[
                  styles.roleText,
                  { color: item.role === 'admin' ? colors.status.warning : colors.status.active }
                ]}>
                  {item.role.toUpperCase()}
                </Text>
              </View>

              <Pressable
                onPress={() => removeUser(item)}
                disabled={item.id === authUser?.sub || deletingUserId === item.id}
                style={[
                  styles.deleteBtn,
                  (item.id === authUser?.sub || deletingUserId === item.id) && styles.deleteBtnDisabled,
                ]}
              >
                <Text style={styles.deleteBtnText}>
                  {item.id === authUser?.sub
                    ? 'CURRENT'
                    : deletingUserId === item.id
                      ? 'REMOVING...'
                      : 'REMOVE'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: any, spacing: any, radius: any, typography: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background.primary },
    scrollContent: { padding: spacing.xl },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary },
    error: { color: colors.status.danger, marginBottom: spacing.md, textAlign: 'center', fontSize: typography.size.sm },

    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    countText: { color: colors.text.muted, fontSize: typography.size.sm },
    refreshBtn: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.accent.glow,
      borderRadius: radius.sm,
    },
    refreshText: { color: colors.text.secondary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },

    sectionCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    sectionTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text.primary },
    sectionCount: { color: colors.text.muted, fontSize: typography.size.sm },

    formBody: { padding: spacing.lg },
    input: {
      backgroundColor: colors.background.primary,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.md,
      color: colors.text.primary,
      fontSize: typography.size.md,
      marginBottom: spacing.sm,
    },
    registerBtn: {
      backgroundColor: colors.status.active,
      borderRadius: radius.sm,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    registerText: { color: colors.text.primary, fontWeight: typography.weight.bold, fontSize: typography.size.md },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.accent.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.sm,
    },
    avatarText: {
      color: colors.text.primary,
      fontSize: typography.size.md,
      fontWeight: typography.weight.bold,
    },
    name: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
    sub: { color: colors.text.muted, fontSize: typography.size.sm, marginTop: 2 },
    roleBadge: {
      borderRadius: radius.full,
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
      marginRight: spacing.sm,
    },
    roleText: {
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.wide,
    },
    deleteBtn: {
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.status.danger,
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      minWidth: 72,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteBtnDisabled: {
      borderColor: colors.border.subtle,
      opacity: 0.55,
    },
    deleteBtnText: {
      color: colors.status.danger,
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.wider,
    },
    empty: { color: colors.text.muted, textAlign: 'center', paddingVertical: spacing.xl },
  });
}
