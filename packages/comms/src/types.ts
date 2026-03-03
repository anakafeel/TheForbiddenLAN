// Shared types used across all packages. Define once, import from @forbiddenlan/comms.

export type MessageType =
  | 'PTT_START'
  | 'PTT_AUDIO'
  | 'PTT_END'
  | 'FLOOR_GRANT'
  | 'FLOOR_DENY'
  | 'PRESENCE'
  | 'TEXT_MSG'
  | 'GPS_UPDATE'
  | 'SYNC_TIME';

export interface PTTMessage {
  type: MessageType;
  talkgroup: string;
  sender: string;       // device UUID
  sessionId: number;    // 4-byte short ID to avoid sending full UUID per audio chunk
  timestamp: number;    // GPS epoch ms — used for floor control arbitration
  seq: number;
}

// AudioChunk strips talkgroup, timestamp, and seq from PTTMessage to minimise
// per-packet JSON size on the 22kbps satellite uplink.
// talkgroup routing is handled server-side via the sessionId→talkgroup map
// seeded by PTT_START. timestamp is only needed for floor control (PTT_START).
export interface AudioChunk extends Omit<PTTMessage, 'sender' | 'talkgroup' | 'timestamp' | 'seq'> {
  type: 'PTT_AUDIO';
  chunk: number;
  data: string;         // base64-encoded Opus frame (AES-GCM encrypted)
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

export interface SyncTimeMessage {
  type: 'SYNC_TIME';
  clientTime: number;
  serverTime?: number;
}

export type RelayMessage =
  | PTTMessage
  | AudioChunk
  | FloorGrant
  | FloorDeny
  | PresenceMessage
  | TextMessage
  | GPSUpdate
  | SyncTimeMessage;

export interface SignalStatus {
  certusDataBars: number;   // 0–5 from DLS-140 /device/status
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
