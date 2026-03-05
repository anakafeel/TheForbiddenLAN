// Admin Users — list users + register new user form.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { api } from '../../lib/api';
import { colors, spacing, radius, typography } from '../../theme';

export function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
                { backgroundColor: item.role === 'admin' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)' }
              ]}>
                <Text style={[
                  styles.roleText,
                  { color: item.role === 'admin' ? colors.status.warning : colors.status.active }
                ]}>
                  {item.role.toUpperCase()}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(37, 55, 70, 0.6)',
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
  registerText: { color: '#fff', fontWeight: typography.weight.bold, fontSize: typography.size.md },

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
  },
  roleText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  empty: { color: colors.text.muted, textAlign: 'center', paddingVertical: spacing.xl },
});
