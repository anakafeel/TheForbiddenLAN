import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ChannelProvider } from './context/ChannelContext';
import ChannelsScreen from './screens/Channels.jsx';
import PTTScreen from './screens/PTTScreen.jsx';

const Stack = createStackNavigator();

export default function App() {
  return (
    <ChannelProvider>
      <NavigationContainer>
        <Stack.Navigator
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
  );
}

