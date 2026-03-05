// Unified App — conditional rendering based on auth state:
//   user === null   → LoginScreen
//   role === admin  → Admin sidebar (web) or bottom tabs (native)
//   role === user   → User stack (Channels → PTT) — existing flow
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, Platform } from 'react-native';
import { ChannelProvider } from './context/ChannelContext';
import { useStore } from './store';
import { setJwtGetter } from './lib/api';
import { colors } from './theme';

// Screens
import { LoginScreen } from './screens/LoginScreen';
import ChannelsScreen from './screens/Channels.jsx';
import PTTScreen from './screens/PTTScreen.jsx';
import { AdminDashboard } from './screens/admin/AdminDashboard';
import { AdminDevices } from './screens/admin/AdminDevices';
import { AdminTalkgroups } from './screens/admin/AdminTalkgroups';
import { AdminUsers } from './screens/admin/AdminUsers';
import { AdminMap } from './screens/admin/AdminMap';
import { AdminSidebar } from './components/AdminSidebar';

const UserStack = createStackNavigator();
const AdminTabs = createBottomTabNavigator();

function UserNavigator() {
  return (
    <ChannelProvider>
      <UserStack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background.tertiary },
          headerTintColor: colors.text.primary,
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <UserStack.Screen name="Channels" component={ChannelsScreen} options={{ title: 'Voice Channels' }} />
        <UserStack.Screen name="PTT" component={PTTScreen} options={{ title: 'SkyTalk PTT' }} />
      </UserStack.Navigator>
    </ChannelProvider>
  );
}

/** Simple text-based tab icon (avoids vector-icons native linking issues). */
function TabIcon({ label, color }) {
  return <Text style={{ color, fontSize: 18 }}>{label}</Text>;
}

function AdminNavigator() {
  // On web: render custom sidebar layout (no react-navigation needed)
  if (Platform.OS === 'web') {
    return <AdminSidebar />;
  }

  // On native: keep bottom tabs
  const clearAuth = useStore(s => s.clearAuth);

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
      <AdminTabs.Screen name="Talkgroups" component={AdminTalkgroups} options={{ tabBarLabel: 'Talkgroups' }} />
      <AdminTabs.Screen name="Users" component={AdminUsers} options={{ tabBarLabel: 'Users' }} />
      <AdminTabs.Screen name="Map" component={AdminMap} options={{ tabBarLabel: 'Map' }} />
    </AdminTabs.Navigator>
  );
}

export default function App() {
  const user = useStore(s => s.user);

  // Wire the API helper's JWT getter to the store — runs once on mount.
  useEffect(() => {
    setJwtGetter(() => useStore.getState().jwt);
  }, []);

  // No user → login. Admin → admin tabs. User → PTT stack.
  if (!user) {
    return (
      <SafeAreaProvider>
        <LoginScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        {user.role === 'admin' ? <AdminNavigator /> : <UserNavigator />}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
