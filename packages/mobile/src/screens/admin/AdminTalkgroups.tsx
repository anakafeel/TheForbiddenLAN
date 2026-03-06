// Admin Talkgroups — CRUD for talkgroups + expand to see members.
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import {
  listAdminTalkgroups,
  createAdminTalkgroup,
  joinAdminTalkgroup,
  deleteAdminTalkgroup,
  rotateAdminTalkgroupKey,
  listAdminTalkgroupMembers,
  addAdminTalkgroupMember,
  removeAdminTalkgroupMember,
  listAdminUsers,
  getAdminErrorMessage,
  type AdminTalkgroup,
  type AdminUser,
} from '../../lib/adminApi';
import { useAppTheme } from '../../theme';

export function AdminTalkgroups() {
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );
  const [talkgroups, setTalkgroups] = useState<AdminTalkgroup[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<AdminUser[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const talkgroupRows = await listAdminTalkgroups();
      setTalkgroups(talkgroupRows);
    } catch (e) {
      setError(getAdminErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!newName.trim()) return;
    try {
      const talkgroup = await createAdminTalkgroup(newName.trim());
      await joinAdminTalkgroup(talkgroup.id).catch(() => {});
      setNewName('');
      await load();
    } catch (e) {
      setError(getAdminErrorMessage(e));
    }
  };

  const remove = (tg: AdminTalkgroup) => {
    const doDelete = async () => {
      try {
        await deleteAdminTalkgroup(tg.id);
        setTalkgroups(prev => prev.filter(t => t.id !== tg.id));
      } catch (e) {
        setError(getAdminErrorMessage(e));
      }
    };
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Delete "${tg.name}"?`)) doDelete();
    } else {
      Alert.alert('Delete Talk Group', `Delete "${tg.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const rotateKey = async (tg: AdminTalkgroup) => {
    const doRotate = async () => {
      try {
        const nextCounter = await rotateAdminTalkgroupKey(tg.id);
        if (typeof nextCounter === 'number') {
          setTalkgroups(prev =>
            prev.map(t => t.id === tg.id ? { ...t, rotation_counter: nextCounter } : t)
          );
        }
      } catch (e) {
        setError(getAdminErrorMessage(e));
      }
    };
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Rotate encryption key for "${tg.name}"? All members will need to re-derive their Talk Group keys.`)) doRotate();
    } else {
      Alert.alert('Rotate Key', `Rotate key for "${tg.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rotate', onPress: doRotate },
      ]);
    }
  };

  const toggleExpand = async (tgId: string) => {
    if (expandedId === tgId) { setExpandedId(null); return; }
    setExpandedId(tgId);
    setMembersLoading(true);
    try {
      const [memberRows, userRows] = await Promise.all([
        listAdminTalkgroupMembers(tgId),
        listAdminUsers(),
      ]);
      setMembers(memberRows);
      setAllUsers(userRows);
    } catch (e) {
      setMembers([]);
      setAllUsers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const addMember = async (tgId: string, userId: string) => {
    try {
      await addAdminTalkgroupMember(tgId, userId);
      const memberRows = await listAdminTalkgroupMembers(tgId);
      setMembers(memberRows);
    } catch (e) {
      setError(getAdminErrorMessage(e));
    }
  };

  const removeMember = async (tgId: string, userId: string, username: string) => {
    const doRemove = async () => {
      try {
        await removeAdminTalkgroupMember(tgId, userId);
        setMembers(prev => prev.filter(m => m.id !== userId));
      } catch (e) {
        setError(getAdminErrorMessage(e));
      }
    };
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Remove "${username}" from this talk group?`)) doRemove();
    } else {
      Alert.alert('Remove Member', `Remove "${username}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]);
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
        <Text style={styles.countText}>
          {talkgroups.length} Talk Group{talkgroups.length !== 1 ? 's' : ''}
        </Text>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {/* Create form card */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Create Talk Group</Text>
        </View>
        <View style={styles.createBody}>
          <TextInput
            placeholder="Talk Group name"
            placeholderTextColor={colors.text.muted}
            value={newName}
            onChangeText={setNewName}
            style={styles.input}
          />
          <Pressable onPress={create} style={styles.createBtn}>
            <Text style={styles.createBtnText}>Create</Text>
          </Pressable>
        </View>
      </View>

      {/* Talk Group list */}
      {talkgroups.length === 0 ? (
        <Text style={styles.empty}>No Talk Groups</Text>
      ) : (
        talkgroups.map(item => (
          <View key={item.id} style={styles.card}>
            {/* Card top — name and rotation info */}
            <Pressable onPress={() => toggleExpand(item.id)} style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{'\u26BF'} Key rotation: {item.rotation_counter ?? 0}</Text>
              </View>
              <Text style={styles.expandIcon}>{expandedId === item.id ? '\u25B2' : '\u25BC'}</Text>
            </Pressable>

            {/* Card actions */}
            <View style={styles.cardActions}>
              <Pressable onPress={() => rotateKey(item)} style={styles.rotateBtn}>
                <Text style={styles.rotateText}>Rotate Key</Text>
              </Pressable>
              <Pressable onPress={() => remove(item)} style={styles.delBtn}>
                <Text style={styles.delText}>Delete</Text>
              </Pressable>
            </View>

            {/* Expanded members section */}
            {expandedId === item.id && (
              <View style={styles.cardBody}>
                <Text style={styles.membersTitle}>Members</Text>
                {membersLoading ? (
                  <ActivityIndicator size="small" color={colors.text.muted} style={{ paddingVertical: spacing.sm }} />
                ) : members.length === 0 ? (
                  <Text style={styles.emptyMembers}>No members</Text>
                ) : (
                  members.map((m, idx) => (
                    <View key={m.id} style={[styles.memberItem, idx === members.length - 1 && !allUsers.filter(u => !members.some(mm => mm.id === u.id)).length && { borderBottomWidth: 0 }]}>
                      <View style={styles.memberAvatar}>
                        <Text style={styles.memberAvatarText}>{m.username.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{m.username}</Text>
                      </View>
                      <View style={[
                        styles.memberBadge,
                        { backgroundColor: m.role === 'admin' ? colors.status.warningSubtle : colors.status.activeSubtle }
                      ]}>
                        <Text style={[
                          styles.memberBadgeText,
                          { color: m.role === 'admin' ? colors.status.warning : colors.status.active }
                        ]}>
                          {m.role.toUpperCase()}
                        </Text>
                      </View>
                      <Pressable onPress={() => removeMember(item.id, m.id, m.username)} style={styles.removeMemberBtn}>
                        <Text style={styles.removeMemberText}>Remove</Text>
                      </Pressable>
                    </View>
                  ))
                )}

                {/* Add Member section */}
                {!membersLoading && (() => {
                  const nonMembers = allUsers.filter(u => !members.some(m => m.id === u.id));
                  return nonMembers.length > 0 ? (
                    <View style={styles.addMemberSection}>
                      <Text style={styles.membersTitle}>Add Members</Text>
                      {nonMembers.map((u, idx) => (
                        <View key={u.id} style={[styles.addMemberRow, idx === nonMembers.length - 1 && { borderBottomWidth: 0 }]}>
                          <View style={styles.memberAvatar}>
                            <Text style={styles.memberAvatarText}>{u.username.charAt(0).toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.addMemberName}>{u.username}</Text>
                          </View>
                          <Pressable onPress={() => addMember(item.id, u.id)} style={styles.addMemberBtn}>
                            <Text style={styles.addMemberBtnText}>Add</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptyMembers}>All users are members</Text>
                  );
                })()}
              </View>
            )}
          </View>
        ))
      )}
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
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    sectionTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text.primary },

    createBody: {
      flexDirection: 'row',
      padding: spacing.lg,
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      backgroundColor: colors.background.primary,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.md,
      color: colors.text.primary,
      fontSize: typography.size.md,
    },
    createBtn: {
      backgroundColor: colors.status.active,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
      justifyContent: 'center',
    },
    createBtnText: { color: colors.text.primary, fontWeight: typography.weight.bold, fontSize: typography.size.md },

    card: {
      backgroundColor: colors.background.secondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginBottom: spacing.sm,
      overflow: 'hidden',
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    name: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
    sub: { color: colors.text.muted, fontSize: typography.size.sm, marginTop: 2 },
    expandIcon: { color: colors.text.muted, fontSize: typography.size.sm },

    cardActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    rotateBtn: {
      backgroundColor: colors.status.warningSubtle,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    rotateText: { color: colors.status.warning, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
    delBtn: {
      backgroundColor: colors.status.dangerSubtle,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    delText: { color: colors.status.danger, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },

    cardBody: { padding: spacing.lg },
    membersTitle: {
      color: colors.text.secondary,
      fontSize: typography.size.sm,
      fontWeight: typography.weight.semibold,
      marginBottom: spacing.sm,
      letterSpacing: typography.letterSpacing.wide,
      textTransform: 'uppercase',
    },
    emptyMembers: { color: colors.text.muted, fontSize: typography.size.sm, paddingVertical: spacing.xs },

    memberItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      gap: spacing.sm,
    },
    memberAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.accent.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    memberAvatarText: {
      color: colors.text.primary,
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
    },
    memberName: { color: colors.text.primary, fontSize: typography.size.md },
    memberBadge: {
      borderRadius: radius.full,
      paddingVertical: 2,
      paddingHorizontal: spacing.xs,
    },
    memberBadgeText: {
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
      letterSpacing: typography.letterSpacing.wide,
    },
    removeMemberBtn: {
      backgroundColor: colors.status.dangerSubtle,
      borderRadius: radius.sm,
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
    },
    removeMemberText: { color: colors.status.danger, fontSize: typography.size.xs, fontWeight: typography.weight.semibold },

    addMemberSection: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    addMemberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      gap: spacing.sm,
    },
    addMemberName: { color: colors.text.secondary, fontSize: typography.size.md },
    addMemberBtn: {
      backgroundColor: colors.status.activeSubtle,
      borderRadius: radius.sm,
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
    },
    addMemberBtnText: { color: colors.status.active, fontSize: typography.size.xs, fontWeight: typography.weight.semibold },

    empty: { color: colors.text.muted, textAlign: 'center', marginTop: spacing.xl },
  });
}
