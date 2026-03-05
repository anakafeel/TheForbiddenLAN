import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Platform } from 'react-native';
import { subscribeToUserActivity } from '../utils/socket';
import { useAppTheme } from '../theme';

let Icon;
if (Platform.OS !== 'web') {
  Icon = require('react-native-vector-icons/FontAwesome').default;
}

// Avatar component
function UserAvatar({ name, talking, styles }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2);
  return (
    <View style={[styles.avatar, talking && styles.avatarTalking]}>
      <Text style={styles.avatarText}>{initials}</Text>
      {talking && <View style={styles.talkingIndicator} />}
    </View>
  );
}

export default function UserStatus() {
  const { colors, spacing, radius, typography } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, radius, typography),
    [colors, spacing, radius, typography],
  );
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const handler = activity => {
      setUsers(prev => {
        const others = prev.filter(u => u.id !== activity.id);
        return [...others, activity];
      });
    };
    subscribeToUserActivity(handler);
  }, []);

  const renderItem = ({ item }) => (
    <View style={[styles.userRow, item.talking && styles.userRowTalking]}>
      <UserAvatar name={item.name} talking={item.talking} styles={styles} />
      <View style={styles.userInfo}>
        <Text style={[styles.userName, item.talking && styles.userNameTalking]}>
          {item.name}
        </Text>
        <Text style={styles.userStatus}>
          {item.talking ? '● TRANSMITTING' : '○ Standby'}
        </Text>
      </View>
      {item.talking && (
        <View style={styles.txBadge}>
          <Text style={styles.txText}>TX</Text>
        </View>
      )}
    </View>
  );

  if (users.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No active users</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={users}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
    />
  );
}

function createStyles(colors, spacing, radius, typography) {
  return StyleSheet.create({
    listContent: {
      paddingVertical: spacing.xs,
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.card,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginBottom: spacing.sm,
    },
    userRowTalking: {
      borderColor: colors.status.danger,
      backgroundColor: colors.status.dangerSubtle,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.background.tertiary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.border.subtle,
    },
    avatarTalking: {
      borderColor: colors.status.danger,
    },
    avatarText: {
      color: colors.text.primary,
      fontSize: typography.size.sm,
      fontWeight: typography.weight.bold,
    },
    talkingIndicator: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.status.danger,
      borderWidth: 2,
      borderColor: colors.background.primary,
    },
    userInfo: {
      flex: 1,
      marginLeft: spacing.md,
    },
    userName: {
      color: colors.text.primary,
      fontSize: typography.size.md,
      fontWeight: typography.weight.medium,
    },
    userNameTalking: {
      color: colors.status.danger,
      fontWeight: typography.weight.bold,
    },
    userStatus: {
      color: colors.text.muted,
      fontSize: typography.size.xs,
      marginTop: 2,
    },
    txBadge: {
      backgroundColor: colors.status.danger,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
    },
    txText: {
      color: colors.text.primary,
      fontSize: typography.size.xs,
      fontWeight: typography.weight.bold,
    },
    emptyContainer: {
      padding: spacing.xl,
      alignItems: 'center',
    },
    emptyText: {
      color: colors.text.muted,
      fontSize: typography.size.sm,
    },
  });
}
