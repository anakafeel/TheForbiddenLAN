import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChannelProvider } from './context/ChannelContext';
import ChannelsScreen from './screens/Channels.jsx';
import PTTScreen from './screens/PTTScreen.jsx';
import { LoginScreen } from './screens/LoginScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <ChannelProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Login"
            screenOptions={{
              headerStyle: {
                backgroundColor: '#1E3A5F',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          >
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ title: 'Login', headerShown: false }}
            />
            <Stack.Screen
              name="Channels"
              component={ChannelsScreen}
              options={{ title: 'Voice Channels' }}
            />
            <Stack.Screen
              name="PTT"
              component={PTTScreen}
              options={{ title: 'SkyTalk PTT' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ChannelProvider>
    </SafeAreaProvider>
  );
}
