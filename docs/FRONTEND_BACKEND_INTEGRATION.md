# Frontend ↔ Backend Integration Guide

> How every mobile screen hooks into the comms SDK, server API, and real-time relay.
> Written for Annie & Maisam — use this to wire new UI components to the existing backend.

**Last updated:** 4 March 2026

---

## Table of Contents

1. [Quick Start — "How do I make my screen talk to the backend?"](#quick-start)
2. [Architecture at a Glance](#architecture-at-a-glance)
3. [Import Map — What to Import and From Where](#import-map)
4. [Auth Flow (Login → JWT → Connect)](#auth-flow)
5. [Channel / Talkgroup Flow](#channel-flow)
6. [PTT Audio Flow (TX and RX)](#ptt-audio-flow)
7. [Floor Control (Walk-On Prevention)](#floor-control)
8. [Text Messaging](#text-messaging)
9. [Presence / Online Users](#presence)
10. [Signal & Satellite Status](#signal-satellite)
11. [GPS / Map](#gps-map)
12. [REST API Endpoints](#rest-api-endpoints)
13. [WebSocket Message Types](#websocket-message-types)
14. [Context Providers & State](#context-providers)
15. [Theme System](#theme-system)
16. [Native Modules (Android Only)](#native-modules)
17. [Environment Variables](#env-vars)
18. [File Map](#file-map)
19. [Common Patterns & Gotchas](#gotchas)

---

<a id="quick-start"></a>
## 1. Quick Start

Every screen follows the same pattern:

```jsx
// 1. Import what you need
import { comms, onFloorDenied, getFloorState } from "../utils/comms";
import { joinChannel, emitStartTalking, emitStopTalking, connectComms } from "../utils/socket";
import { startAudioStream, stopAudioStream } from "../utils/audio";
import { CONFIG } from "../config";

// 2. Use ChannelContext for the currently-selected talkgroup
const { current, setCurrent } = useContext(ChannelContext);

// 3. Join a channel when your screen mounts
useEffect(() => {
  if (current?.id) joinChannel(current.id);
}, [current?.id]);

// 4. Start PTT (checks floor control, returns false if channel busy)
const ok = emitStartTalking(CONFIG.DEVICE_ID, current.id);
if (ok) await startAudioStream();

// 5. Stop PTT
await stopAudioStream();
emitStopTalking(CONFIG.DEVICE_ID, current.id);
```

**That's it.** Audio capture, encoding, encryption, relay, decoding, and playback are all handled automatically by the layers below.

---

<a id="architecture-at-a-glance"></a>
## 2. Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│  YOUR NEW SCREEN  (React Native JSX)                                │
│  ├── imports from utils/socket.js     ← PTT signaling               │
│  ├── imports from utils/audio.js      ← mic capture start/stop      │
│  ├── imports from utils/comms.js      ← floor control, singleton    │
│  ├── uses ChannelContext              ← selected talkgroup           │
│  └── uses CONFIG from config.js       ← device ID, URLs             │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   utils/socket.js   │  ← Thin bridge: UI actions → SDK calls
        │   utils/comms.js    │  ← Singleton + RX audio pipeline
        │   utils/audio.js    │  ← TX audio pipeline (mic → Opus → encrypt)
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  @forbiddenlan/comms │  ← SDK: ForbiddenLANComms class
        │  (packages/comms/)   │     RelaySocket (WebSocket)
        │                      │     UdpSocket (UDP audio)
        │                      │     AudioPipeline, FloorControl
        │                      │     Encryption (AES-GCM-256)
        └──────────┬──────────┘
                   │
          ┌────────▼────────┐
          │  Relay Server    │  134.122.32.45:3000
          │  (Fastify + ws)  │  WebSocket: control messages
          │                  │  UDP: audio frames
          │  REST API: /auth │  POST /auth/login, /register
          │           /talkgroups, /devices, /users, /keys, /tle
          └──────────────────┘
```

### Key Principle

**Screens never talk to the server directly** (except `LoginScreen`'s `POST /auth/login` and `Channels`'s `GET /talkgroups`). Everything real-time goes through the singleton `comms` object, which wraps `ForbiddenLANComms` from the SDK.

---

<a id="import-map"></a>
## 3. Import Map — What to Import and From Where

| What you need | Import from | Function / Value |
|---|---|---|
| **Start PTT** | `../utils/socket` | `emitStartTalking(deviceId, channelId)` → returns `false` if floor busy |
| **Stop PTT** | `../utils/socket` | `emitStopTalking(deviceId, channelId)` |
| **Join a channel** | `../utils/socket` | `joinChannel(channelId)` |
| **Connect after login** | `../utils/socket` | `connectComms(jwt)` |
| **Start mic capture** | `../utils/audio` | `startAudioStream()` — async, requests mic permission |
| **Stop mic capture** | `../utils/audio` | `stopAudioStream()` — async |
| **Floor deny callback** | `../utils/comms` | `onFloorDenied((talkgroup, holder) => { ... })` |
| **Floor busy state** | `../utils/comms` | `getFloorState()` → `{ busy: bool, holder: string }` |
| **Comms singleton** | `../utils/comms` | `comms` — the `ForbiddenLANComms` instance |
| **Transport mode** | `../utils/comms` | `comms.setTransportMode('cellular' \| 'satcom')` |
| **Send text** | `../utils/comms` | `comms.sendText(talkgroupId, text)` |
| **Listen to messages** | `../utils/comms` | `comms.onMessage(handler)` — filtered (drops audio during TX) |
| **Listen to ALL messages** | `../utils/comms` | `comms.onRawMessage(handler)` — unfiltered |
| **Current channel** | `../context/ChannelContext` | `useContext(ChannelContext)` → `{ current, setCurrent }` |
| **Device ID, URLs** | `../config` | `CONFIG.DEVICE_ID`, `CONFIG.WS_URL`, `CONFIG.API_URL` |
| **JWT** | `../store` | `useStore().jwt`, `useStore().setJwt(token)` |
| **Satellite visibility** | `../utils/satellitePredictor` | `updateTLEs(deviceId)`, `getVisibleSatellites()` |
| **Theme tokens** | `../theme` | `colors`, `spacing`, `radius`, `typography`, `shadows` |

---

<a id="auth-flow"></a>
## 4. Auth Flow

```
┌─────────────┐     POST /auth/login       ┌─────────────┐
│ LoginScreen  │ ──────────────────────────▶│   Server     │
│              │     { username, password,   │   /auth      │
│              │       device_id }           │              │
│              │ ◀──────────────────────────│              │
│              │     { token: "jwt..." }     └─────────────┘
│              │
│  setJwt(jwt) │ ← store the JWT
│  connectComms│(jwt) ← opens WebSocket + UDP
│  navigate    │('Channels')
└─────────────┘
```

### How to wire login in a new screen:

```jsx
import { useStore } from "../store";
import { connectComms } from "../utils/socket";
import { CONFIG } from "../config";

async function handleLogin(username, password) {
  const res = await fetch(`${CONFIG.API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, device_id: CONFIG.DEVICE_ID }),
  });
  const { token } = await res.json();

  useStore.getState().setJwt(token);
  await connectComms(token);            // opens WebSocket + UDP socket
  navigation.navigate("Channels");      // or wherever your flow goes
}
```

**Important:** `connectComms(jwt)` is idempotent — calling it twice is safe. It connects the WebSocket to the relay server and starts the UDP socket for audio.

---

<a id="channel-flow"></a>
## 5. Channel / Talkgroup Flow

### Fetching channels (REST):

```jsx
const jwt = useStore().jwt;
const res = await fetch(`${CONFIG.API_URL}/talkgroups`, {
  headers: { Authorization: `Bearer ${jwt}` },
});
const channels = await res.json(); // [{ id, name, created_at, ... }]
```

### Selecting a channel (context + WebSocket):

```jsx
import { ChannelContext } from "../context/ChannelContext";
import { joinChannel } from "../utils/socket";

const { setCurrent } = useContext(ChannelContext);

function selectChannel(channel) {
  setCurrent(channel);                  // updates context for all screens
  joinChannel(channel.id);             // sends JOIN_TALKGROUP over WebSocket
  navigation.navigate("PTT");
}
```

### Re-joining on mount:

Always re-join when a PTT-capable screen mounts. The WebSocket might have reconnected since last join:

```jsx
useEffect(() => {
  if (current?.id) {
    joinChannel(current.id);
  }
}, [current?.id]);
```

---

<a id="ptt-audio-flow"></a>
## 6. PTT Audio Flow

### Starting a transmission (TX):

```jsx
import { emitStartTalking, emitStopTalking } from "../utils/socket";
import { startAudioStream, stopAudioStream } from "../utils/audio";
import { CONFIG } from "../config";

// Start transmitting
const accepted = emitStartTalking(CONFIG.DEVICE_ID, current.id);
if (accepted === false) {
  // Floor is taken — show "Channel Busy" UI
  return;
}
// Floor accepted (optimistic — server may still deny via FLOOR_DENY callback)
setIsTransmitting(true);
await startAudioStream();

// Stop transmitting
setIsTransmitting(false);
await stopAudioStream();               // MUST come before emitStopTalking
emitStopTalking(CONFIG.DEVICE_ID, current.id);
```

**CRITICAL ORDER:** `stopAudioStream()` must be called **before** `emitStopTalking()`. The SDK guards `sendAudioChunk()` on an internal `isTransmitting` flag — calling `emitStopTalking` first clears that flag and drops the final audio chunks.

### What happens under the hood:

```
TX (your press):
  startAudioStream()
    → mic permission check
    → LiveAudioStream.start() (16kHz mono, 60ms frames)
    → each 1920-byte PCM chunk:
        → native Opus encode (~120 bytes)
        → AES-GCM encrypt (+28 bytes)
        → comms.sendAudioChunk(base64)
        → AudioPipeline.enqueueChunk()
        → UdpSocket.send() → server → fan-out to peers

RX (automatic — handled by comms.js):
  UdpSocket receives PTT_AUDIO from server
    → comms.onRawMessage() handler
    → decrypt (AES-GCM)
    → native Opus decode → PCM
    → native AudioTrack.write() → speaker (real-time streaming)
    → fallback: accumulate PCM → WAV file → expo-av play (on PTT_END)
```

### You do NOT need to handle RX audio. It plays automatically.

The `comms.js` singleton sets up the RX pipeline in `initComms()`. When a peer transmits, their audio is decoded and played through the speaker without any UI code. You just see the logs.

---

<a id="floor-control"></a>
## 7. Floor Control (Walk-On Prevention)

Only one device can transmit on a talkgroup at a time. The server enforces this.

### Pre-check (instant, client-side):

```jsx
const accepted = emitStartTalking(CONFIG.DEVICE_ID, current.id);
if (!accepted) {
  // Show "Channel Busy" banner
}
```

### Server deny callback (async, if server disagrees):

```jsx
import { onFloorDenied } from "../utils/comms";

useEffect(() => {
  onFloorDenied((talkgroup, holder) => {
    setChannelBusy(true);
    setBusyHolder(holder);
    setIsTransmitting(false);
    // Clear after 3s
    setTimeout(() => setChannelBusy(false), 3000);
  });
}, []);
```

### Checking current floor state:

```jsx
import { getFloorState } from "../utils/comms";

const { busy, holder } = getFloorState();
// busy: true if another device is transmitting
// holder: device ID string of the current transmitter
```

### Message types involved:

| Message | Direction | Meaning |
|---------|-----------|---------|
| `PTT_START` | client → server | "I want to transmit" |
| `FLOOR_GRANT` | server → client | "You have the floor" / "Someone else has it" |
| `FLOOR_DENY` | server → client | "Denied — channel busy" |
| `FLOOR_RELEASED` | server → all | "Floor is now free" |

---

<a id="text-messaging"></a>
## 8. Text Messaging

```jsx
comms.sendText(talkgroupId, "Hello from Device A");
```

To receive:

```jsx
comms.onMessage((msg) => {
  if (msg.type === "TEXT_MSG") {
    console.log(`${msg.sender}: ${msg.text}`);
  }
});
```

---

<a id="presence"></a>
## 9. Presence / Online Users

The server broadcasts `PRESENCE` messages whenever someone joins or leaves a talkgroup.

```jsx
import { subscribeToUserActivity } from "../utils/socket";

useEffect(() => {
  subscribeToUserActivity((info) => {
    // info = { id: talkgroupId, name: talkgroupId, talking: false }
    // The raw PRESENCE message has: { type: "PRESENCE", talkgroup, online: ["userId1", "userId2"] }
  });
}, []);
```

For more control, use `comms.onMessage()` directly:

```jsx
comms.onMessage((msg) => {
  if (msg.type === "PRESENCE" && msg.talkgroup === currentChannel.id) {
    setOnlineUsers(msg.online); // string[] of userIds
  }
});
```

---

<a id="signal-satellite"></a>
## 10. Signal & Satellite Status

### DLS-140 Signal Polling (SATCOM hardware):

```jsx
comms.startSignalPolling(10000, (status) => {
  // status: { certusDataBars, cellularSignal, activeLink, certusDataUsedKB }
});
```

This polls the DLS-140 SATCOM router's local API. It silently fails if the router isn't reachable (e.g., on cellular).

### Iridium Satellite Visibility:

```jsx
import { updateTLEs, getVisibleSatellites } from "../utils/satellitePredictor";

// Once: fetch and cache TLE data
await updateTLEs(CONFIG.DEVICE_ID);

// Then poll:
const visible = getVisibleSatellites(); // [{ name, elevation, azimuth }]
// visible.length === 0 → no satellite in line of sight → disable PTT in SATCOM mode
```

---

<a id="gps-map"></a>
## 11. GPS / Map

```jsx
const gps = comms.getGPS(); // { lat, lng, alt, mode } or null
```

GPS is polled from the DLS-140 router and broadcast via `GPS_UPDATE` messages. To store a GPS update:

```
POST /devices/:id/gps   { lat, lng, alt }
GET  /devices/:id/gps   → last known position
```

---

<a id="rest-api-endpoints"></a>
## 12. REST API Endpoints

Base URL: `CONFIG.API_URL` (default: `http://134.122.32.45:3000`)

All requests except `/auth/*` require `Authorization: Bearer <jwt>` header.

### Auth

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `POST` | `/auth/register` | `{ username, password, device_id? }` | `{ token }` | Creates user + device |
| `POST` | `/auth/login` | `{ username, password, device_id? }` | `{ token }` | Returns JWT |
| `POST` | `/auth/changepassword` | `{ oldPassword, newPassword }` | `204` | JWT required |

### Talkgroups

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/talkgroups` | — | `[{ id, name, created_at }]` |
| `POST` | `/talkgroups` | `{ name, master_secret }` | `{ id, name }` |
| `POST` | `/talkgroups/:id/join` | — | `200` |
| `DELETE` | `/talkgroups/:id/leave` | — | `200` |
| `GET` | `/talkgroups/:id/members` | — | `[{ user_id, joined_at }]` |
| `DELETE` | `/talkgroups/:id` | — | `204` (admin only) |

### Devices

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/devices` | — | `[{ id, status, user_id }]` (admin) |
| `PATCH` | `/devices/:id/status` | `{ status }` | `200` (admin) |
| `GET` | `/devices/:id/gps` | — | `{ lat, lng, alt, created_at }` |
| `POST` | `/devices/:id/gps` | `{ lat, lng, alt }` | `201` |

### Other

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/users` | `[{ id, username, role }]` (admin) |
| `GET` | `/keys/rotation?talkgroupId=x` | `{ rotationCount }` |
| `POST` | `/keys/rotate` | `{ talkgroupId }` → increments counter (admin) |
| `GET` | `/tle/iridium` | Raw Iridium TLE text (Celestrak proxy) |
| `GET` | `/ping` | `{ pong: true }` |

---

<a id="websocket-message-types"></a>
## 13. WebSocket Message Types

All real-time messages go through the WebSocket at `CONFIG.WS_URL` (default: `ws://134.122.32.45:3000/ws`).

Audio frames (`PTT_AUDIO`) are also sent/received over UDP for lower latency.

| Type | Direction | Transport | Fields | Purpose |
|------|-----------|-----------|--------|---------|
| `JOIN_TALKGROUP` | client → server | WS | `talkgroup, sender` | Join a room |
| `LEAVE_TALKGROUP` | client → server | WS | `talkgroup` | Leave a room |
| `PTT_START` | client → server → peers | WS | `talkgroup, sender, sessionId, timestamp, seq` | Begin transmission |
| `PTT_AUDIO` | client → server → peers | **UDP** | `sessionId, chunk, data` | Encrypted Opus frame |
| `PTT_END` | client → server → peers | WS | `talkgroup, sender, sessionId, timestamp, seq` | End transmission |
| `FLOOR_GRANT` | server → client | WS | `talkgroup, winner, timestamp` | Floor given |
| `FLOOR_DENY` | server → client | WS | `talkgroup, holder` | Floor denied |
| `FLOOR_RELEASED` | server → all | WS | `talkgroup, previousHolder` | Floor freed |
| `TEXT_MSG` | client → server → peers | WS | `talkgroup, sender, text` | Chat message |
| `PRESENCE` | server → all in room | WS | `talkgroup, online[]` | Who's online |
| `GPS_UPDATE` | client → server → peers | WS | `lat, lng, alt` | Position update |
| `SYNC_TIME` | client ↔ server | WS | `clientTime, serverTime` | Clock drift correction |

---

<a id="context-providers"></a>
## 14. Context Providers & State

### ChannelContext

```jsx
// Provided by App.jsx wrapping the navigator
import { ChannelContext } from "../context/ChannelContext";

const { current, setCurrent } = useContext(ChannelContext);
// current: { id: string, name: string, users?: number } | null
// setCurrent: (channel) => void
```

Wrap any new navigator or screen tree in `<ChannelProvider>` if it needs channel state.

### Zustand Store (src/store.ts)

```jsx
import { useStore } from "../store";

const jwt = useStore((s) => s.jwt);
const setJwt = useStore((s) => s.setJwt);
```

The native app's store only holds `jwt`. If you need more global state (e.g., `activeTalkgroup`, `signalStatus`), extend `src/store.ts`.

### Global Singletons (on `global`)

These survive Metro Fast Refresh — never re-create them:

| Global Key | Value | Created in |
|---|---|---|
| `global.__COMMS_SINGLETON__` | `ForbiddenLANComms` instance | `comms.js` |
| `global.__ENCRYPTION_SINGLETON__` | `Encryption` instance | `comms.js` |
| `global.__COMMS_INITIALIZED__` | `boolean` | `comms.js` |
| `global.__DEVICE_ID__` | `string` (e.g., `dev-hxpk6qlo`) | `config.js` |
| `global.__AUDIO_IS_RECORDING__` | `boolean` | `audio.js` |

**Never instantiate `ForbiddenLANComms` or `Encryption` yourself.** Always import the singleton from `utils/comms.js`.

---

<a id="theme-system"></a>
## 15. Theme System

```jsx
import theme from "../theme";
const { colors, spacing, radius, typography, shadows, componentStyles } = theme;
```

### Key tokens:

| Token | Values |
|-------|--------|
| `colors.background.primary` | `#000000` (pure black) |
| `colors.background.secondary` | `#231f20` |
| `colors.background.tertiary` | `#1a1a2e` |
| `colors.accent.primary` | `#253746` (dark teal) |
| `colors.accent.primaryLight` | `#2d4a5e` |
| `colors.text.primary` | `#FFFFFF` |
| `colors.text.secondary` | `#8892b0` |
| `colors.text.muted` | `#4a5568` |
| `colors.status.active` | `#22C55E` (green) |
| `colors.status.danger` | `#EF4444` (red) |
| `colors.status.warning` | `#F59E0B` (amber) |
| `colors.status.activeGlow` | `rgba(34,197,94,0.15)` |
| `spacing.xs/sm/md/lg/xl` | `4/8/12/16/24` |
| `radius.sm/md/lg/xl/full` | `4/8/12/16/999` |
| `typography.size.xs→xxl` | `10→28` |
| `typography.weight.normal/medium/semibold/bold` | `'400'→'700'` |

### Pre-built component styles:

```jsx
componentStyles.card         // dark card with border + shadow
componentStyles.badge        // small pill shape
componentStyles.statusDot    // 8px circle
componentStyles.input        // text input field
componentStyles.primaryButton // accent bg, centered text
```

---

<a id="native-modules"></a>
## 16. Native Modules (Android Only)

These Kotlin modules are registered via `OpusEncoderPackage.kt` in `MainApplication`. You call them through JS wrapper files — **never call NativeModules directly** from screens.

| JS Wrapper | Native Module | Methods |
|---|---|---|
| `utils/opusEncoder.js` | `OpusFECEncoder` | `initialize(rate, channels, bitrate)`, `encode(base64PCM)`, `destroy()` |
| `utils/opusDecoder.js` | `OpusDecoder` | `initialize(rate, channels)`, `decode(base64Opus)`, `destroy()` |
| `utils/audioStreamPlayer.js` | `AudioStreamPlayer` | `start(rate, channels)`, `write(base64PCM)`, `stop()` |

The encoder/decoder are initialized and destroyed by `startAudioStream()`/`stopAudioStream()` (TX) and the RX pipeline in `comms.js`. You don't need to touch these unless you're changing audio settings.

---

<a id="env-vars"></a>
## 17. Environment Variables

Set in `packages/mobile/.env` or `.env.local`. Accessed via `process.env.EXPO_PUBLIC_*`.

| Variable | Default | Purpose |
|---|---|---|
| `EXPO_PUBLIC_WS_URL` | `ws://134.122.32.45:3000/ws` | WebSocket relay URL |
| `EXPO_PUBLIC_API_URL` | `http://134.122.32.45:3000` | REST API base URL |
| `EXPO_PUBLIC_DLS140_URL` | `http://192.168.111.1:3000` | DLS-140 SATCOM router API |
| `EXPO_PUBLIC_TALKGROUP` | `alpha` | Default talkgroup (channels screen overrides) |
| `EXPO_PUBLIC_LOOPBACK` | `false` | `true` = hear your own TX (single-device testing) |
| `EXPO_PUBLIC_MOCK_MODE` | `false` | `true` = channels screen uses hardcoded data |

---

<a id="file-map"></a>
## 18. File Map

### Screens (what Annie & Maisam edit)

| File | What it does |
|------|--------------|
| `src/screens/LoginScreen.tsx` | Auth form → JWT → connect → navigate |
| `src/screens/Channels.jsx` | Browse/search/filter talkgroups, select → PTT |
| `src/screens/PTTScreen.jsx` | Toggle-PTT, floor control UI, SATCOM toggle |
| `src/screens/VoiceChannelChatPage.jsx` | Chat + voice UI (⚠️ audio NOT wired yet) |

### Integration layer (do not rewrite — just import from)

| File | What it exports |
|------|-----------------|
| `src/utils/socket.js` | `connectComms`, `joinChannel`, `emitStartTalking`, `emitStopTalking`, `subscribeToUserActivity`, `disconnect` |
| `src/utils/comms.js` | `comms`, `encryption`, `initComms`, `onFloorDenied`, `getFloorState`, `notifyTxStart`, `notifyTxEnd`, `loopbackStash` |
| `src/utils/audio.js` | `startAudioStream`, `stopAudioStream` |
| `src/config.js` | `CONFIG` |

### Backend SDK (do not edit)

| File | Purpose |
|------|---------|
| `packages/comms/src/ForbiddenLANComms.ts` | Main class: connect, PTT, floor, text, signal |
| `packages/comms/src/RelaySocket.ts` | WebSocket client with auto-reconnect |
| `packages/comms/src/UdpSocket.ts` | UDP transport for audio frames |
| `packages/comms/src/AudioPipeline.ts` | TX: sequence Opus chunks over UDP |
| `packages/comms/src/FloorControl.ts` | Floor state tracking |
| `packages/comms/src/Encryption.ts` | AES-GCM-256 encrypt/decrypt |
| `packages/comms/src/types.ts` | All TypeScript interfaces |

### Context / State

| File | Exports |
|------|---------|
| `src/context/ChannelContext.jsx` | `ChannelContext`, `useChannel`, `ChannelProvider` |
| `src/store.ts` | `useStore` (Zustand — contains `jwt`, `setJwt`) |

### Theme

| File | Exports |
|------|---------|
| `src/theme/index.js` | `colors`, `spacing`, `radius`, `typography`, `shadows`, `componentStyles`, `animation` |

### Navigation (inline in App)

| File | Navigator |
|------|-----------|
| `src/App.jsx` | `@react-navigation/stack`: Login → Channels → PTT |

---

<a id="gotchas"></a>
## 19. Common Patterns & Gotchas

### 1. Stop audio BEFORE stop PTT

```jsx
// ✅ CORRECT
await stopAudioStream();
emitStopTalking(deviceId, channelId);

// ❌ WRONG — drops final audio chunks
emitStopTalking(deviceId, channelId);
await stopAudioStream();
```

### 2. Always re-join on screen mount

WebSocket may have reconnected (server restart, network change). Always call `joinChannel()` in `useEffect`:

```jsx
useEffect(() => {
  if (current?.id) joinChannel(current.id);
}, [current?.id]);
```

### 3. Floor deny is async

`emitStartTalking()` does a **client-side** pre-check (instant). But the server may still deny asynchronously via `FLOOR_DENY`. Always register the callback:

```jsx
useEffect(() => {
  onFloorDenied((tg, holder) => {
    setIsTransmitting(false);    // kill your TX UI
    // show banner...
  });
}, []);
```

### 4. Don't instantiate comms yourself

```jsx
// ✅ CORRECT
import { comms } from "../utils/comms";

// ❌ WRONG — creates a second disconnected instance
const myComms = new ForbiddenLANComms({...});
```

### 5. Fast Refresh safety

If your screen holds a ref to a WebSocket, timer, or native resource, guard against Metro Fast Refresh re-evaluation:

```jsx
if (!global.__MY_RESOURCE__) {
  global.__MY_RESOURCE__ = createExpensiveThing();
}
```

### 6. Audio mode on Android

After mic recording, Android routes audio to earpiece. The RX pipeline handles this automatically (`_ensurePlaybackMode()`), but if you manually play audio via expo-av outside the pipeline, call:

```jsx
import { Audio } from "expo-av";
await Audio.setAudioModeAsync({
  allowsRecordingIOS: false,
  playThroughEarpieceAndroid: false,
});
```

### 7. VoiceChannelChatPage is not wired

The `VoiceChannelChatPage.jsx` screen has `TODO` comments where audio should be wired. To complete it, follow the same pattern as `PTTScreen.jsx` — import from `socket.js` and `audio.js`.

### 8. Two App entry points

- `src/App.jsx` — **React Native** (Android production). Uses `@react-navigation/stack`.
- `src/App.tsx` / `src/App.web.jsx` — **Web** (Vite/browser dev). Uses `react-router-dom` or manual state.

New screens for the Android app go into `src/App.jsx`'s stack navigator.

### 9. Platform-specific components

| Component | Platform | Notes |
|---|---|---|
| `PTTButton.jsx` | RN | Press-and-hold style (vs PTTScreen which is toggle) |
| `SignalBar.tsx` | Web | HTML `<div>` — not React Native |
| `TalkgroupSelector.tsx` | Web | HTML `<select>` |
| `NetworkInfo.jsx` | RN | Uses `@react-native-community/netinfo` |
| `UserStatus.jsx` | RN | FlatList with PRESENCE data |

### 10. Building and running

```bash
# Kill lingering processes first
pkill -9 -f "node|expo|metro"
sleep 1
ulimit -n 65536

# Build + install on physical device
npx expo run:android --device

# Select your device from the picker
# Metro will start automatically
```

After changing **any file in `packages/comms/`**, Metro will hot-reload automatically (it's a workspace dependency). No native rebuild needed unless you changed Kotlin modules.

After changing **Kotlin/Java files** in `android/app/src/main/java/`, you need a full rebuild (`npx expo run:android`).
