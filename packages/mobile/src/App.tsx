import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import RootNavigator from "./navigation/RootNavigator";
import { AuthProvider } from "./context/AuthContext";
import { ChannelProvider } from "./context/ChannelContext";
import SystemEventBridge from "./components/SystemEventBridge";

export default function App() {
  return (
    <AuthProvider>
      <ChannelProvider>
        <SystemEventBridge />
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </ChannelProvider>
    </AuthProvider>
  );
}
