// Unified App — conditional rendering based on auth state:
//   user === null   → LoginScreen
//   role === admin  → Admin sidebar (web) or bottom tabs (native)
//   role === user   → Annie's AppDrawer (Dashboard, Channels, PTT, Profile)
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, Platform, View, ActivityIndicator, StyleSheet } from 'react-native';
import { ChannelProvider } from './context/ChannelContext';
import { useStore } from './store';
import { setJwtGetter } from './lib/api';
import { loadUserPreferences, saveUserPreferences } from './lib/userPreferences';
import { useAppTheme } from './theme';
import SystemEventBridge from './components/SystemEventBridge';
import { CONFIG } from './config';

// Screens
import { LoginScreen } from './screens/LoginScreen';
import AppDrawer from './navigation/AppDrawer';
import { AdminDashboard } from './screens/admin/AdminDashboard';
import { AdminDevices } from './screens/admin/AdminDevices';
import { AdminTalkgroups } from './screens/admin/AdminTalkgroups';
import { AdminUsers } from './screens/admin/AdminUsers';
import { AdminMap } from './screens/admin/AdminMap';
import { AdminMonitoring } from './screens/admin/AdminMonitoring';
import { AdminSidebar } from './components/AdminSidebar';

const AdminTabs = createBottomTabNavigator();

function AdminNavigator() {
  // On web: render custom sidebar layout (no react-navigation needed)
  if (Platform.OS === 'web') {
    return <AdminSidebar />;
  }

  // On native: keep bottom tabs
  const clearAuth = useStore(s => s.clearAuth);
  const { colors } = useAppTheme();

  return (
    <AdminTabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background.tertiary },
        headerTintColor: colors.text.primary,
        tabBarStyle: { backgroundColor: colors.background.secondary },
        tabBarActiveTintColor: colors.status.active,
        tabBarInactiveTintColor: colors.text.muted,
        headerRight: () => (
          <Text onPress={clearAuth} style={{ color: colors.status.danger, marginRight: 16, fontSize: 14 }}>
            Logout
          </Text>
        ),
      }}
    >
      <AdminTabs.Screen name="Dashboard" component={AdminDashboard} options={{ tabBarLabel: 'Dashboard' }} />
      <AdminTabs.Screen
        name="Talkgroups"
        component={AdminTalkgroups}
        options={{ tabBarLabel: 'Talk Groups', title: 'Talk Groups' }}
      />
      <AdminTabs.Screen name="Users" component={AdminUsers} options={{ tabBarLabel: 'Users' }} />
      <AdminTabs.Screen name="Map" component={AdminMap} options={{ tabBarLabel: 'Map' }} />
      <AdminTabs.Screen name="Monitoring" component={AdminMonitoring} options={{ tabBarLabel: 'Monitoring' }} />
    </AdminTabs.Navigator>
  );
}

export default function App() {
  const jwt = useStore(s => s.jwt);
  const user = useStore(s => s.user);
  const hydrating = useStore(s => s.hydrating);
  const hydrateAuth = useStore(s => s.hydrateAuth);
  const setProfile = useStore((s) => s.setProfile);
  const preferredConnection = useStore((s) => s.preferredConnection);
  const setPreferredConnection = useStore((s) => s.setPreferredConnection);
  const { themeMode } = useAppTheme();
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [profileHydrated, setProfileHydrated] = useState(false);

  // Restore JWT from SecureStore on first launch — must run before anything else.
  useEffect(() => {
    hydrateAuth();
  }, []);

  // Wire the API helper's JWT getter to the store — runs once on mount.
  useEffect(() => {
    setJwtGetter(() => useStore.getState().jwt);
  }, []);

  // Load persisted user profile/preferences on app boot.
  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      const snapshot = await loadUserPreferences();
      if (!mounted) return;

      if (snapshot) {
        setPreferredConnection(snapshot.preferredConnection);
      }

      setPrefsHydrated(true);
    };

    hydrate();

    return () => {
      mounted = false;
    };
  }, [setPreferredConnection]);

  // Pull user-scoped profile from backend after authentication.
  useEffect(() => {
    if (!jwt || !user || user.role === 'admin') {
      setProfileHydrated(user?.role === 'admin');
      return;
    }

    let cancelled = false;
    setProfileHydrated(false);

    const hydrateRemoteProfile = async () => {
      try {
        const res = await fetch(`${CONFIG.API_URL}/users/me/profile`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });

        if (!res.ok) return;
        const data = await res.json();
        const remote = data?.profile;
        if (cancelled || !remote || typeof remote !== 'object') return;

        setProfile({
          displayName: typeof remote.display_name === 'string' ? remote.display_name : '',
          callsign: typeof remote.callsign === 'string' ? remote.callsign : '',
          photoUrl: typeof remote.photo_url === 'string' ? remote.photo_url : '',
          statusMessage: typeof remote.status_message === 'string' ? remote.status_message : '',
        });
      } catch {
        // Keep local defaults if backend profile hydration fails.
      } finally {
        if (!cancelled) setProfileHydrated(true);
      }
    };

    hydrateRemoteProfile();

    return () => {
      cancelled = true;
    };
  }, [jwt, user?.sub, user?.role, setProfile]);

  // Persist device preference (not profile) whenever it changes after hydration.
  useEffect(() => {
    if (!prefsHydrated) return;

    saveUserPreferences({
      preferredConnection,
    });
  }, [prefsHydrated, preferredConnection]);

  // No user → login. Admin → admin tabs. User → Annie's drawer (Dashboard, Channels, PTT, Profile).
  if (hydrating) {
    return (
      <SafeAreaProvider>
        <View style={styles.splash}>
          <ActivityIndicator size="large" color="#4FC3F7" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <LoginScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer key={themeMode}>
        <SystemEventBridge profileHydrated={profileHydrated} />
        {user.role === 'admin' ? (
          <AdminNavigator />
        ) : (
          <ChannelProvider>
            <AppDrawer />
          </ChannelProvider>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0D1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
});