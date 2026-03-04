import { Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ControlBar } from '../src/components/ControlBar';
import Sidebar from '../src/components/Sidebar';
import { AppStoreProvider } from '../src/store';
import { theme } from '../src/theme';

export default function Layout() {
  return (
    <AppStoreProvider>
      <View style={styles.root}>
        <Sidebar />
        <View style={styles.mainViewport}>
          <View style={styles.mainFrame}>
            <ControlBar />
            <View style={styles.stackHost}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.bg },
              }}
            />
            </View>
          </View>
        </View>
      </View>
    </AppStoreProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.bg,
  },
  mainViewport: {
    flex: 1,
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  mainFrame: {
    flex: 1,
    minWidth: theme.layout.minMainWidth,
  },
  stackHost: {
    flex: 1,
  },
});
