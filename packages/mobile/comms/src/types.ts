// Shared types used across all packages. Define once, import from @skytalk/comms.

export type MessageType =
  | 'PTT_START'
  | 'PTT_AUDIO'
  | 'PTT_END'
  | 'FLOOR_GRANT'
  | 'FLOOR_DENY'
  | 'PRESENCE'
  | 'TEXT_MSG'
  | 'GPS_UPDATE';

export interface PTTMessage {
  type: MessageType;
  talkgroup: string;
  sender: string;       // device UUID
  timestamp: number;    // GPS epoch ms — used for floor control arbitration
  seq: number;
}

export interface AudioChunk extends PTTMessage {
  type: 'PTT_AUDIO';
  chunk: number;
  data: string;         // base64-encoded Opus frame
}

export interface FloorGrant {
  type: 'FLOOR_GRANT';
  talkgroup: string;
  winner: string;
  timestamp: number;
}

export interface FloorDeny {
  type: 'FLOOR_DENY';
  talkgroup: string;
  loser: string;
}

export interface PresenceMessage {
  type: 'PRESENCE';
  talkgroup: string;
  online: string[];     // device UUIDs currently connected
}

export interface TextMessage {
  type: 'TEXT_MSG';
  talkgroup: string;
  sender: string;
  text: string;
}

export interface GPSUpdate {
  type: 'GPS_UPDATE';
  device: string;
  lat: number;
  lng: number;
  alt: number;
}

export type RelayMessage =
  | PTTMessage
  | AudioChunk
  | FloorGrant
  | FloorDeny
  | PresenceMessage
  | TextMessage
  | GPSUpdate;

export interface SignalStatus {
  certusSignalBars: number;   // 0–5 from DLS-140 /device/status
  cellularSignal: number;     // 0–100
  activeLink: 'cellular' | 'satellite' | 'none';
  certusDataUsedKB: number;
}

export interface GPS {
  lat: number;
  lng: number;
  alt: number;
  mode: number;         // 0=no fix, 2=2D, 3=3D
}

export interface FloorStatus {
  holder: string | null;   // device UUID currently holding floor, null if free
  talkgroup: string;
  timestamp: number;
}

export interface DLS140Status {
  certusIMEI: string;
  certusSignalStrength: number;
  certusDataBars: number;
  cellularIMEI: string;
  cellularSignalStrength: number;
}

export interface DLS140GPS {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  mode: number;
}
