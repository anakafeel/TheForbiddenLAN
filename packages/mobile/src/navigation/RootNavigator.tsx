import React, { useState } from "react";
import AuthStack from "./AuthStack";
import AppDrawer from "./AppDrawer";

export default function RootNavigator() {
  const [loggedIn, setLoggedIn] = useState(true); // change later with real auth

  return loggedIn ? <AppDrawer /> : <AuthStack />;
}