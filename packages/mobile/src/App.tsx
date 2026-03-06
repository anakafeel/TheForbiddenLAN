import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import RootNavigator from "./navigation/RootNavigator";
import { AuthProvider } from "./context/AuthContext";
import { ChannelProvider } from "./context/ChannelContext";
import { useStore } from "./store";
import { restoreSession } from "./hooks/useAuth";

export default function App() {
  const setJwt = useStore((s) => s.setJwt);

  // Restore JWT from SecureStore on app start so the user stays logged in
  useEffect(() => {
    restoreSession(setJwt);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
