import React from "react";
import { createDrawerNavigator } from "@react-navigation/drawer";

import Channels from "../screens/Channels";
import PTTScreen from "../screens/PTTScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Drawer = createDrawerNavigator();

export default function AppDrawer() {
  return (
    <Drawer.Navigator screenOptions={{ headerShown: false }}>
      <Drawer.Screen name="Channels" component={Channels} />
      <Drawer.Screen name="PTT" component={PTTScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
    </Drawer.Navigator>
  );
}