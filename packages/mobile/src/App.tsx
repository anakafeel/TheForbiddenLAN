import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import RootNavigator from "./navigation/RootNavigator";
import { AuthProvider } from "./context/AuthContext";
import { ChannelProvider } from "./context/ChannelContext";

export default function App() {
  return (
    <AuthProvider>
      <ChannelProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </ChannelProvider>
    </AuthProvider>
  );
}
