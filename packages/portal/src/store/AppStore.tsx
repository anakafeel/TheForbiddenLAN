import React, { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import { activities as activitySeed, channels as channelSeed, devices as deviceSeed, keyGroups as keyGroupSeed, routers as routerSeed, transmissions as transmissionSeed, users as userSeed } from './data';
import { ActivityEvent, Channel, Device, KeyGroup, Router, Transmission, User } from './types';

interface AppStoreValue {
  routers: Router[];
  devices: Device[];
  channels: Channel[];
  users: User[];
  transmissions: Transmission[];
  keyGroups: KeyGroup[];
  activities: ActivityEvent[];
  selectedRouterId: string;
  setSelectedRouterId: (routerId: string) => void;
  createChannel: (name: string, encrypted: boolean) => void;
  toggleChannelLock: (channelId: string) => void;
  forceMuteChannel: (channelId: string) => void;
  moveUserToChannel: (userId: string, channelId: string) => void;
  disableDevice: (deviceId: string) => void;
  rebootDevice: (deviceId: string) => void;
  reassignDeviceTalkgroup: (deviceId: string, talkgroup: string) => void;
  provisionUser: (userId: string) => void;
  revokeUser: (userId: string) => void;
  assignUserDevice: (userId: string, deviceId: string) => void;
  suspendUser: (userId: string) => void;
  commsReady: boolean;
}

const AppStoreContext = createContext<AppStoreValue | undefined>(undefined);

const now = () => new Date().toISOString().slice(11, 19);

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [routers] = useState<Router[]>(routerSeed);
  const [devices, setDevices] = useState<Device[]>(deviceSeed);
  const [channels, setChannels] = useState<Channel[]>(channelSeed);
  const [users, setUsers] = useState<User[]>(userSeed);
  const [transmissions] = useState<Transmission[]>(transmissionSeed);
  const [keyGroups] = useState<KeyGroup[]>(keyGroupSeed);
  const [activities, setActivities] = useState<ActivityEvent[]>(activitySeed);
  const [selectedRouterId, setSelectedRouterId] = useState<string>(routerSeed[0]?.id ?? '');
  const commsReady = false;

  const appendActivity = (severity: ActivityEvent['severity'], message: string) => {
    setActivities((prev) => [
      { id: `act-${Date.now()}`, timestamp: now(), severity, message },
      ...prev.slice(0, 11),
    ]);
  };

  const createChannel = (name: string, encrypted: boolean) => {
    const channelId = `ch-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
    setChannels((prev) => [
      {
        id: channelId,
        name,
        activeTransmission: false,
        transmittingUserId: null,
        assignedRouterIds: [],
        encrypted,
        locked: false,
        muted: false,
      },
      ...prev,
    ]);
    appendActivity('info', `Channel ${name} created by control desk.`);
  };

  const toggleChannelLock = (channelId: string) => {
    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === channelId ? { ...channel, locked: !channel.locked } : channel,
      ),
    );
    const channelName = channels.find((channel) => channel.id === channelId)?.name ?? channelId;
    appendActivity('warning', `Channel ${channelName} lock state changed.`);
  };

  const forceMuteChannel = (channelId: string) => {
    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === channelId ? { ...channel, muted: !channel.muted } : channel,
      ),
    );
    const channelName = channels.find((channel) => channel.id === channelId)?.name ?? channelId;
    appendActivity('critical', `Force mute toggled on ${channelName}.`);
  };

  const moveUserToChannel = (userId: string, channelId: string) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, activeChannelId: channelId } : user)),
    );
    const channelName = channels.find((channel) => channel.id === channelId)?.name ?? channelId;
    const userName = users.find((user) => user.id === userId)?.displayName ?? userId;
    appendActivity('info', `${userName} moved to ${channelName}.`);
  };

  const disableDevice = (deviceId: string) => {
    setDevices((prev) =>
      prev.map((device) =>
        device.id === deviceId ? { ...device, status: 'offline', signalStrength: 0 } : device,
      ),
    );
    appendActivity('warning', `Device ${deviceId} disabled from control panel.`);
  };

  const rebootDevice = (deviceId: string) => {
    appendActivity('info', `Remote reboot command sent to ${deviceId}.`);
  };

  const reassignDeviceTalkgroup = (deviceId: string, talkgroup: string) => {
    setDevices((prev) =>
      prev.map((device) =>
        device.id === deviceId ? { ...device, assignedTalkgroup: talkgroup } : device,
      ),
    );
    appendActivity('info', `Device ${deviceId} reassigned to talkgroup ${talkgroup}.`);
  };

  const provisionUser = (userId: string) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, suspended: false, status: 'online' } : user)),
    );
    appendActivity('info', `Provisioning completed for ${userId}.`);
  };

  const revokeUser = (userId: string) => {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, status: 'offline', activeChannelId: null } : user,
      ),
    );
    appendActivity('critical', `Access revoked for ${userId}.`);
  };

  const assignUserDevice = (userId: string, deviceId: string) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, assignedDeviceId: deviceId } : user)),
    );
    appendActivity('info', `Assigned ${deviceId} to ${userId}.`);
  };

  const suspendUser = (userId: string) => {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId
          ? { ...user, suspended: !user.suspended, status: user.suspended ? 'online' : 'offline' }
          : user,
      ),
    );
    appendActivity('warning', `Suspension state updated for ${userId}.`);
  };

  const value = useMemo<AppStoreValue>(
    () => ({
      routers,
      devices,
      channels,
      users,
      transmissions,
      keyGroups,
      activities,
      selectedRouterId,
      setSelectedRouterId,
      createChannel,
      toggleChannelLock,
      forceMuteChannel,
      moveUserToChannel,
      disableDevice,
      rebootDevice,
      reassignDeviceTalkgroup,
      provisionUser,
      revokeUser,
      assignUserDevice,
      suspendUser,
      commsReady,
    }),
    [routers, devices, channels, users, transmissions, keyGroups, activities, selectedRouterId],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error('useAppStore must be used within AppStoreProvider');
  }
  return store;
}
