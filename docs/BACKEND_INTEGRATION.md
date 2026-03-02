# Backend Integration Guide (Expo Native)

**Updated for Expo SDK 54 / React Native 0.76.**
Previous version documented Vite web setup — that has been replaced. All env vars, entry points,
and integration patterns below are for the native iOS/Android app running via Expo Go or EAS Build.

---

## Current State (Mock Mode)

The app ships with `EXPO_PUBLIC_MOCK_MODE=true` as default. In this state:

- `ForbiddenLANComms` uses `MockRelaySocket` — a local loopback that echoes messages back after 50ms
- No network connection is made
- `initComms(CONFIG.MOCK_JWT)` is called automatically on import by `utils/socket.js`
- PTT audio is captured, encrypted, sent to mock, decrypted back, and played locally (single-device loopback)
- All UI channels and user presence are simulated with `MOCK_CHANNELS` / `_simulatePresence()`

Everything below describes what must change for **real** relay integration.

---

## Step 1 — Environment Variables

Create `packages/mobile/.env.local` (gitignored):

```env
EXPO_PUBLIC_MOCK_MODE=false
EXPO_PUBLIC_WS_URL=ws://<relay-server-ip>:<port>
EXPO_PUBLIC_API_URL=http://<relay-server-ip>:<port>
EXPO_PUBLIC_DLS140_URL=http://192.168.111.1:3000
EXPO_PUBLIC_TALKGROUP=alpha
```

**Important:** Expo only injects `EXPO_PUBLIC_*` prefixed variables. `VITE_*` vars are ignored on
native. The app falls back to VITE_ names for backwards compat but they have no effect at runtime
on device — do not use them.

For phone-to-server connectivity on the same Wi-Fi: use the machine's LAN IP, not `localhost`.
`localhost` on an iOS device resolves to the phone itself, not the dev machine.

Restart Metro after editing `.env.local`:
```bash
cd packages/mobile && npx expo start --clear
```

---

## Step 2 — Fix RelaySocket.on() Before Connecting

**This is a blocking bug in real mode.** `RelaySocket.ts` calls `.on()` on the WebSocket instance,
which is the Node.js `ws` package API. In React Native, `ws` is shimmed to the browser WebSocket
global — which uses `addEventListener`, not `.on()`.

In mock mode this is never hit because `MockRelaySocket` overrides `connect()` and never calls
`establishConnection()`. In real mode (`EXPO_PUBLIC_MOCK_MODE=false`), `new RelaySocket()` is used
and `establishConnection()` calls `this.ws.on('message', ...)` → `TypeError: this.ws.on is not a function`.

**Required change in `packages/comms/src/RelaySocket.ts`:**

Replace all `.on(event, cb)` and `.on('open', cb)` / `.on('close', cb)` / `.on('error', cb)` calls
on the WebSocket instance with the browser WebSocket event API:

```ts
// BEFORE (Node.js ws package API):
this.ws.on('message', (data) => { ... });
this.ws.on('open', () => { ... });
this.ws.on('close', () => { ... });
this.ws.on('error', (err) => { ... });

// AFTER (browser WebSocket API — works in React Native via ws shim):
this.ws.addEventListener('message', (event) => {
  const data = event.data; // browser WebSocket wraps data in MessageEvent
  ...
});
this.ws.addEventListener('open', () => { ... });
this.ws.addEventListener('close', () => { ... });
this.ws.addEventListener('error', (event) => {
  console.warn('[RelaySocket] error', event);
  this.handleReconnect();
});
```

Also update the `readyState` check — `WebSocket.OPEN` is a static on the class, which the browser
WebSocket also has, so that line is fine.

After this fix, `RelaySocket` will work via the native browser WebSocket exposed by React Native.
The `ws` shim (`src/shims/ws.js`) already returns `global.WebSocket`, so no Metro config change
is needed.

---

## Step 3 — Add a Login Screen

Currently there is no authentication flow in the native app. `App.jsx` goes directly to
`ChannelsScreen`. When real mode is enabled, a login step is needed before the relay connection
is established.

**Minimal integration pattern:**

1. Add a `LoginScreen.tsx` (or reuse the existing `src/screens/LoginScreen.tsx`)
2. On successful login, call `connectComms(jwt)` from `utils/socket.js`:

```js
import { connectComms } from '../utils/socket';
import { CONFIG } from '../config';

// Inside login handler:
const res = await fetch(`${CONFIG.API_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
if (!res.ok) throw new Error('Login failed');
const { jwt } = await res.json();

await connectComms(jwt);
// then navigate to Channels
```

`connectComms(jwt)` is idempotent — safe to call once, no-ops on repeat calls.
The `utils/socket.js` auto-connect (mock mode only) will NOT fire when `MOCK_MODE=false`.

---

## Step 4 — Audio Streaming Limitation

**The current audio pipeline sends one full recording per PTT press, not live 200ms chunks.**

In mock mode this works fine (loopback). On a real relay over 22kbps satellite, it means no audio
arrives at the other device until you release PTT. The comms layer is designed for streaming
(`enqueueChunk` / `PTT_AUDIO` per chunk), but `expo-av` records to a file and cannot stream raw
PCM/Opus frames out of the box.

### What happens today

```
PTT press  → Audio.Recording.createAsync() starts recording to file
PTT release → stopAndUnloadAsync() → read file as base64 → sendAudioChunk(encrypted)
             → relay receives one PTT_AUDIO → other devices hear it all at once
```

### What needs to happen for real 200ms streaming

Option A — **Polling the recording URI during capture** (no native code):
```
Every 200ms while recording: read partial file → compute new bytes since last read
→ send incremental base64 chunk via comms.sendAudioChunk()
```
Expo does not have a stable API for this. The file is locked during recording on iOS.

Option B — **Switch to expo-dev-client + a streaming audio library** (requires native build):
Libraries like `react-native-audio-recorder-player` or `react-native-live-audio-stream` provide
raw PCM frame callbacks compatible with the `enqueueChunk` pipeline. This requires an EAS build
or custom dev client — Expo Go cannot load these.

**For the hackathon demo**: Option A (whole-file send at PTT_END) is functional and demonstrates
the full pipeline. The relay, floor control, and encryption all work correctly. Only latency
differs from the intended 200ms design.

**For post-hackathon**: Option B is the correct path. Switch to EAS Build, add a streaming audio
native module, and the `AudioPipeline.enqueueChunk()` API already handles the rest without
changes to the comms layer.

---

## Step 5 — Device ID Persistence

`CONFIG.DEVICE_ID` currently generates a random string (`dev-xxxxxxxx`) per app launch using
`Math.random()`. Every restart gets a new device ID, which causes the relay to see phantom
presence entries.

For a persistent, secure device ID, replace with `expo-secure-store`:

```js
import * as SecureStore from 'expo-secure-store';

async function getOrCreateDeviceId() {
  let id = await SecureStore.getItemAsync('device_id');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2, 10);
    await SecureStore.setItemAsync('device_id', id);
  }
  return id;
}
```

This requires `expo-secure-store` (`npx expo install expo-secure-store`). Supported in Expo Go.

---

## Step 6 — Encryption Key

`Encryption.ts` uses a hardcoded test key (`deadbeef...`). When the KDF is ready:

```js
// utils/comms.js — replace:
await encryption.init();

// With (once KDF is available):
const key = await deriveKey(masterSecret, CONFIG.TALKGROUP, rotationCounter);
await encryption.init(key);
```

`Encryption.init(hexKey?)` already accepts an optional key parameter — no other code changes.

The relay must distribute the `masterSecret` and `rotationCounter` via a secure channel
(TLS-protected REST endpoint post-login) before the WebSocket relay connection is established.

---

## Step 7 — Channel List from Relay

`Channels.jsx` uses `MOCK_CHANNELS` — a hardcoded static list. In real mode, talkgroups should
be fetched from the relay API or populated via `PRESENCE` messages.

The relay already sends `PRESENCE` messages when devices join talkgroups. `socket.js` already
calls `comms.onMessage()` for `PRESENCE` events. Wire this to update channel state in
`ChannelContext.jsx` instead of using `MOCK_CHANNELS`.

---

## Step 8 — Floor Control Behaviour in Multi-Device Scenarios

`FloorControl.ts` uses optimistic GPS timestamp arbitration. The floor winner is the device with
the **lowest timestamp** when multiple `PTT_START` messages arrive within a 50ms collision window.

This works correctly only if:
1. Device clocks are reasonably synchronised — the `SYNC_TIME` ping on connect corrects for
   offset but does not account for high-jitter satellite links
2. The relay server echoes `PTT_START` to all participants quickly enough for the 50ms window
   to be meaningful

On a 22kbps Iridium Certus link with ~800ms round-trip latency, two devices can easily be 400ms
apart in perceived timestamp. The floor control collision window (50ms) becomes effectively
irrelevant — whoever transmits first simply wins because the other device's `PTT_START` arrives
long after the window closes.

**No code change needed for the demo.** The current behaviour (first-come-first-served at relay)
is the practical outcome regardless of the floor control logic. Floor control becomes meaningful
only on low-latency cellular links.

---

## What Does NOT Change

| File | Status |
|---|---|
| `packages/mobile/src/App.jsx` | No changes |
| `packages/mobile/src/screens/PTTScreen.jsx` | No changes |
| `packages/mobile/src/utils/audio.js` | No changes |
| `packages/mobile/src/utils/comms.js` | No changes |
| `packages/mobile/src/utils/socket.js` | No changes |
| `packages/mobile/metro.config.js` | No changes |
| `packages/comms/src/AudioPipeline.ts` | No changes |
| `packages/comms/src/MockRelaySocket.ts` | No changes |
| `packages/comms/src/FloorControl.ts` | No changes |
| `packages/comms/src/DLS140Client.ts` | No changes |
| `packages/comms/src/Encryption.ts` | No changes |

The only file that **must** change before real mode works is `RelaySocket.ts` (Step 2).

---

## Integration Checklist

- [ ] Step 1: `.env.local` created with `EXPO_PUBLIC_MOCK_MODE=false` and real server URLs
- [ ] Step 2: `RelaySocket.ts` — replace `.on()` with `.addEventListener()` on WebSocket
- [ ] Step 3: Login screen wired to `connectComms(jwt)` after successful `/auth/login`
- [ ] Step 4: Decide on audio strategy (file-based for demo vs streaming for production)
- [ ] Step 5: Replace `Math.random()` device ID with `expo-secure-store` persistent ID
- [ ] Step 6: Replace hardcoded AES key with KDF once key distribution is ready
- [ ] Step 7: Replace `MOCK_CHANNELS` with live talkgroup list from relay `PRESENCE` events

### Sanity-check logs on successful connection (real mode)

```
[ForbiddenLANComms] Time offset synced: Xms      ← SYNC_TIME round-trip complete
[comms] initialized — LIVE mode | device: dev-xxxx | talkgroup: alpha | relay: ws://...
```

PTT press:
```
[comms] PTT start — device: dev-xxxx
[comms] mic capture started via expo-av
```

PTT release (current file-based mode):
```
[comms] PTT_AUDIO sending, encrypted bytes: XXXX
[comms] PTT_END received — flushing audio buffer   ← on receiving device
[comms] playing transmission
```

If you see `[MockRelaySocket] Connecting...` in real mode, `EXPO_PUBLIC_MOCK_MODE` is not being
read. Restart Metro with `--clear` flag.

---

## Tradeoff Summary

| Item | Current (Mock/Demo) | Production Path |
|---|---|---|
| Audio delivery | Full file at PTT_END | 200ms chunks (needs EAS Build + streaming lib) |
| WebSocket | MockRelaySocket loopback | RelaySocket → fix `.on()` → browser WS shim |
| Auth | Auto-connect with fake JWT | Login screen → real JWT → `connectComms(jwt)` |
| Device ID | `Math.random()` per launch | `expo-secure-store` persistent ID |
| Encryption key | Hardcoded `deadbeef...` | KDF(masterSecret, talkgroup, rotation) |
| Channel list | Hardcoded `MOCK_CHANNELS` | Live from relay `PRESENCE` events |
| Floor control | 50ms window (ineffective at 800ms RTT) | Acceptable for demo; redesign for sat link |
| GPS | DLS-140 HTTP poll | Add `expo-location` fallback for phone GPS |
