import React from "react";
import { registerRootComponent } from "expo";
import { NavigationContainer } from "@react-navigation/native";
import RootNavigator from "./navigation/RootNavigator";
import { AuthProvider } from "./context/AuthContext";
import { ChannelProvider } from "./context/ChannelContext";
import SystemEventBridge from "./components/SystemEventBridge";

function Root() {
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

registerRootComponent(Root);
