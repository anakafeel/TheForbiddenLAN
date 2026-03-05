import React from "react";
import { createDrawerNavigator } from "@react-navigation/drawer";

import DashboardScreen from "../screens/DashboardScreen";
import Channels from "../screens/Channels";
import NotificationsScreen from "../screens/NotificationsScreen";
import PTTScreen from "../screens/PTTScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Drawer = createDrawerNavigator();

export default function AppDrawer() {
  return (
    <Drawer.Navigator initialRouteName="Dashboard" screenOptions={{ headerShown: false }}>
      <Drawer.Screen name="Dashboard" component={DashboardScreen} options={{ drawerLabel: "Dashboard" }} />
      <Drawer.Screen name="PTT" component={PTTScreen} options={{ drawerLabel: "PTT" }} />
      <Drawer.Screen name="Channels" component={Channels} options={{ drawerLabel: "Channels" }} />
      <Drawer.Screen name="Notifications" component={NotificationsScreen} options={{ drawerLabel: "Notifications" }} />
      <Drawer.Screen name="Profile" component={ProfileScreen} options={{ drawerLabel: "Profile" }} />
    </Drawer.Navigator>
  );
}
