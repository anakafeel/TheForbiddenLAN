export type OnlineState = 'online' | 'offline' | 'degraded';
export type UserRole = 'dispatcher' | 'operator' | 'field' | 'admin';

export interface Router {
  id: string;
  name: string;
  region: string;
  status: OnlineState;
  signalStrength: number;
  assignedChannels: string[];
  connectedDeviceIds: string[];
  lastHeartbeat: string;
}

export interface Device {
  id: string;
  label: string;
  routerId: string;
  status: OnlineState;
  signalStrength: number;
  battery: number;
  assignedTalkgroup: string;
  lastGps: string;
  firmware: string;
}

export interface Channel {
  id: string;
  name: string;
  activeTransmission: boolean;
  transmittingUserId: string | null;
  assignedRouterIds: string[];
  encrypted: boolean;
  locked: boolean;
  muted: boolean;
}

export interface User {
  id: string;
  displayName: string;
  assignedDeviceId: string | null;
  activeChannelId: string | null;
  role: UserRole;
  keyGroupId: string;
  status: OnlineState;
  suspended: boolean;
}

export interface Transmission {
  id: string;
  channelId: string;
  userId: string;
  startedAt: string;
  durationSec: number;
  sourceRouterId: string;
}

export interface KeyGroup {
  id: string;
  name: string;
  algorithm: string;
  rotationDays: number;
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}
