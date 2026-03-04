export type OnlineState = 'online' | 'offline' | 'degraded';
export type UserRole = 'dispatcher' | 'operator' | 'field' | 'admin';
export type DataMode = 'mock' | 'live';

export interface Router {
  id: string;
  name: string;
  region: string;
  status: OnlineState;
  signalStrength: number;
  assignedChannels: string[];
  connectedDeviceIds: string[];
  lastHeartbeat: string;
  lat?: number;
  lng?: number;
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
  serial?: string;
  site?: string;
  active?: boolean;
  lat?: number;
  lng?: number;
  alt?: number;
  updatedAt?: string;
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
  rotationCounter?: number;
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
  createdAt?: string;
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
