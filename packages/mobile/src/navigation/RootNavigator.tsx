import React from "react";
import AuthStack from "./AuthStack";
import AppDrawer from "./AppDrawer";
import { useAuth } from "../context/AuthContext";

export default function RootNavigator() {
  const { isAuthed } = useAuth();
  return isAuthed ? <AppDrawer /> : <AuthStack />;
}