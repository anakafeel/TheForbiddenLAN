// Unified App — conditional rendering based on auth state:
//   user === null   → LoginScreen
//   role === admin  → Admin sidebar (web) or bottom tabs (native)
//   role === user   → Annie's AppDrawer (Dashboard, Channels, PTT, Profile)
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, Platform } from 'react-native';
import { ChannelProvider } from './context/ChannelContext';
import { useStore } from './store';
import { setJwtGetter } from './lib/api';
import { useAppTheme } from './theme';

// Screens
import { LoginScreen } from './screens/LoginScreen';
import AppDrawer from './navigation/AppDrawer';
import { AdminDashboard } from './screens/admin/AdminDashboard';
import { AdminDevices } from './screens/admin/AdminDevices';
import { AdminTalkgroups } from './screens/admin/AdminTalkgroups';
import { AdminUsers } from './screens/admin/AdminUsers';
import { AdminMap } from './screens/admin/AdminMap';
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
      <AdminTabs.Screen name="Devices" component={AdminDevices} options={{ tabBarLabel: 'Devices' }} />
      <AdminTabs.Screen
        name="Talkgroups"
        component={AdminTalkgroups}
        options={{ tabBarLabel: 'Talk Groups', title: 'Talk Groups' }}
      />
      <AdminTabs.Screen name="Users" component={AdminUsers} options={{ tabBarLabel: 'Users' }} />
      <AdminTabs.Screen name="Map" component={AdminMap} options={{ tabBarLabel: 'Map' }} />
    </AdminTabs.Navigator>
  );
}

export default function App() {
  const user = useStore(s => s.user);
  const { themeMode } = useAppTheme();

  // Wire the API helper's JWT getter to the store — runs once on mount.
  useEffect(() => {
    setJwtGetter(() => useStore.getState().jwt);
  }, []);

  // No user → login. Admin → admin tabs. User → Annie's drawer (Dashboard, Channels, PTT, Profile).
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
