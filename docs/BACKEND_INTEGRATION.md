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

## Frontend Integration Quick Reference

**For Annie/Maisam:** This section shows exactly what data you get from Shrikar's backend and what you need to do with it.

### What Shrikar Must Deliver to You

| #   | What                       | Status    | Notes                             |
| --- | -------------------------- | --------- | --------------------------------- |
| 1   | Server IP + Port           | ⏳ Needed | e.g., `192.168.1.100:3000`        |
| 2   | Working `POST /auth/login` | ✅ Done   | Returns `{ jwt: "..." }`          |
| 3   | Working `GET /talkgroups`  | ⏳ Bug C1 | After Prisma migration            |
| 4   | WebSocket URL format       | ✅ Done   | `ws://<ip>:<port>/ws?token=<jwt>` |
| 5   | PRESENCE broadcasts        | ⏳ Bug H3 | On connect/disconnect             |
| 6   | Fix self-echo              | ⏳ Bug H4 | Don't send audio back to sender   |

### REST API Data Structures

#### 1. Login (Already Works)

**Your code:**

```javascript
// In LoginScreen.tsx
import { connectComms } from "../utils/socket";
import { CONFIG } from "../config";
import useStore from "../store";

async function handleLogin() {
  const response = await fetch(`${CONFIG.API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }

  const { jwt } = await response.json();

  // Save JWT in Zustand store
  const setJwt = useStore.getState().setJwt;
  setJwt(jwt);

  // Connect WebSocket with JWT
  await connectComms(jwt);

  // Navigate to Channels
  navigation.navigate("Channels");
}
```

**What Shrikar returns:**

```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkIiwidXNlcm5hbWUiOiJhbm5pZSIsInJvbGUiOiJ1c2VyIn0..."
}
```

#### 2. Get Talkgroups/Channels (Once Bug C1 Fixed)

**Your code:**

```javascript
// In Channels.jsx, replace lines 99-103
import useStore from "../store";

useEffect(() => {
  if (!CONFIG.MOCK_MODE) {
    const jwt = useStore.getState().jwt;

    fetch(`${CONFIG.API_URL}/talkgroups`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    })
      .then((res) => res.json())
      .then((talkgroups) => {
        // Transform to match your UI format
        const channelData = talkgroups.map((tg) => ({
          id: tg.id,
          name: tg.name,
          status: "active",
          users: 0, // Will be updated by PRESENCE messages
          transmitting: false,
        }));
        setChannels(channelData);
      })
      .catch((err) => console.error("Failed to fetch talkgroups:", err));
  }
}, []);
```

**What Shrikar returns (after Prisma fix):**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Alpha Team",
    "master_secret": "<Buffer>",
    "rotation_counter": 0
  },
  {
    "id": "661f9511-f39c-52e5-b827-557766551111",
    "name": "Bravo Team",
    "master_secret": "<Buffer>",
    "rotation_counter": 0
  }
]
```

### WebSocket Message Data Structures

**All handled by `comms` layer — you just need to subscribe and update UI.**

#### PRESENCE — Who's online

**What Shrikar broadcasts (once Bug H3 fixed):**

```json
{
  "type": "PRESENCE",
  "talkgroup": "550e8400-e29b-41d4-a716-446655440000",
  "online": ["device-uuid-1", "device-uuid-2", "device-uuid-3"]
}
```

**Your code to handle it:**

```javascript
// In Channels.jsx or useEffect
import { comms } from "../utils/comms";

comms.onMessage((msg) => {
  if (msg.type === "PRESENCE") {
    // Update user count for this channel
    setChannels((prev) =>
      prev.map((ch) =>
        ch.id === msg.talkgroup ? { ...ch, users: msg.online.length } : ch,
      ),
    );

    // Update channel speakers map
    if (msg.online.length > 0) {
      setChannelSpeakers((prev) => ({
        ...prev,
        [msg.talkgroup]: msg.online[0], // Or track who's actually transmitting
      }));
    }
  }
});
```

#### PTT_START — Someone started talking

**What Shrikar broadcasts:**

```json
{
  "type": "PTT_START",
  "talkgroup": "550e8400-e29b-41d4-a716-446655440000",
  "sender": "device-uuid-1",
  "timestamp": 1709424000000,
  "seq": 1
}
```

**Your code:**

```javascript
comms.onMessage((msg) => {
  if (msg.type === "PTT_START") {
    // Show UI feedback - someone is talking
    setCurrentSpeaker(msg.sender);

    // Update channel to show transmission
    setChannels((prev) =>
      prev.map((ch) =>
        ch.id === msg.talkgroup ? { ...ch, transmitting: true } : ch,
      ),
    );
  }
});
```

#### PTT_AUDIO — Audio chunk

**What Shrikar broadcasts:**

```json
{
  "type": "PTT_AUDIO",
  "talkgroup": "550e8400-e29b-41d4-a716-446655440000",
  "sessionId": 12345,
  "seq": 1,
  "chunk": 1,
  "data": "base64-encoded-encrypted-audio-data..."
}
```

**Your code:** NOTHING! `comms.js` already handles decryption and playback automatically.

#### PTT_END — Transmission finished

**What Shrikar broadcasts:**

```json
{
  "type": "PTT_END",
  "talkgroup": "550e8400-e29b-41d4-a716-446655440000",
  "sender": "device-uuid-1",
  "seq": 5
}
```

**Your code:**

```javascript
comms.onMessage((msg) => {
  if (msg.type === "PTT_END") {
    // Clear UI feedback
    setCurrentSpeaker(null);

    // Update channel to show transmission stopped
    setChannels((prev) =>
      prev.map((ch) =>
        ch.id === msg.talkgroup ? { ...ch, transmitting: false } : ch,
      ),
    );
  }
});
```

### Complete Data Flow Example

```
┌─────────────────────────────────────────────────────┐
│ 1. User opens app → sees LoginScreen                │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 2. User enters username/password, taps Login        │
│    POST /auth/login                                 │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 3. Backend returns { jwt: "..." }                   │
│    Save to Zustand: setJwt(jwt)                     │
│    Call: await connectComms(jwt)                    │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 4. WebSocket connects to                            │
│    ws://192.168.1.100:3000/ws?token=<jwt>           │
│    Backend sends: { type: "SYNC_TIME", ... }        │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 5. Navigate to Channels screen                      │
│    GET /talkgroups (Authorization: Bearer <jwt>)    │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 6. Backend returns talkgroups array                 │
│    Transform to channel format, display in FlatList │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 7. Backend broadcasts PRESENCE messages             │
│    Update user counts in UI                         │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 8. User taps channel, navigates to PTT screen       │
│    User presses PTT button                          │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 9. emitStartTalking(deviceId)                       │
│    → comms.startPTT()                               │
│    → Records audio, encrypts, sends PTT_START        │
│    → Sends PTT_AUDIO chunks                         │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 10. Backend broadcasts to all users in talkgroup    │
│     Other devices: receive, decrypt, play audio     │
│     Your device: UI shows "YOU" as speaker          │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 11. User releases PTT button                        │
│     emitStopTalking()                               │
│     → comms.stopPTT()                               │
│     → Sends PTT_END                                 │
└─────────────────────────────────────────────────────┘
```

### Your Frontend Tasks Checklist

- [ ] **Task 1:** Add `LoginScreen.tsx` to navigator in `App.jsx` as initial screen
- [ ] **Task 2:** Wire login handler to call `connectComms(jwt)` and save JWT to Zustand
- [ ] **Task 3:** Fix `Channels.jsx` line 100 — replace `socket.emit('list-channels')` with REST call
- [ ] **Task 4:** Subscribe to PRESENCE messages and update channel user counts
- [ ] **Task 5:** Subscribe to PTT_START/PTT_END and show current speaker in UI
- [ ] **Task 6:** Test with Shrikar's server once Bug C1 (Prisma) is fixed

### What You DON'T Need to Do

- ❌ Handle WebSocket connection logic (comms layer does this)
- ❌ Audio encryption/decryption (comms layer does this)
- ❌ Audio recording/playback (utils/audio.js does this)
- ❌ Floor control logic (comms layer does this)
- ❌ Message routing (comms layer does this)

**You only handle:** UI state, REST API calls for channels, and showing/hiding visual feedback.

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
native. The app falls back to VITE\_ names for backwards compat but they have no effect at runtime
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
import { connectComms } from "../utils/socket";
import { CONFIG } from "../config";

// Inside login handler:
const res = await fetch(`${CONFIG.API_URL}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
});
if (!res.ok) throw new Error("Login failed");
const { jwt } = await res.json();

await connectComms(jwt);
// then navigate to Channels
```

`connectComms(jwt)` is idempotent — safe to call once, no-ops on repeat calls.
The `utils/socket.js` auto-connect (mock mode only) will NOT fire when `MOCK_MODE=false`.

---

## Step 4 — Audio Streaming (Opus + EAS Build Required)

**The audio pipeline has been upgraded to stream real live 60ms Opus chunks.**

In order to support the 22kbps satellite link with low latency, we have integrated `react-native-live-audio-stream` and `react-native-opus`. These libraries use native iOS/Android code to capture and compress audio down to the tiny bandwidth budget required by the architecture.

**Because of this, the mobile app can no longer be run in the standard Expo Go client.** 

To test the audio transmission now, you must run an **Expo Dev Build** (EAS Build) or compile locally using Android Studio. 

Because we are developing on Linux (Fedora), **we are dropping iOS support** for local compilation, as it requires macOS and Xcode. You must test using an Android Emulator or a physical Android device plugged in via USB.

### Setup for Fedora / Linux

1. Install Android Studio (e.g. via Flatpak or JetBrains Toolbox).
2. Open Android Studio → SDK Manager. Ensure you have the `Android SDK Build-Tools` and `Android Emulator` installed.
3. Open Virtual Device Manager (AVD) and create a new Pixel emulator.
4. Set up your environment variables in `~/.bashrc` or `~/.zshrc`:
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```
5. Run your project natively:

```bash
cd packages/mobile
npx expo prebuild --clean  # Generates the /android folder (ignores /ios)
npx expo run:android       # Boots the emulator and compiles the C++ Opus codecs
```

#### What happens today:

```
PTT press  → react-native-live-audio-stream starts capturing raw PCM audio
Every 60ms → Raw PCM buffer is encoded to Opus via react-native-opus
           → Opus frame is encrypted via AES-GCM
           → sent via comms.sendAudioChunk(encrypted)
```

**For the hackathon demo**: This is exactly what we need to prove the SATCOM architecture works on a low-bandwidth connection.

**For post-hackathon**: None! The architecture is now using the correct 60ms streaming chunks.

---

## Step 5 — Device ID Persistence

`CONFIG.DEVICE_ID` currently generates a random string (`dev-xxxxxxxx`) per app launch using
`Math.random()`. Every restart gets a new device ID, which causes the relay to see phantom
presence entries.

For a persistent, secure device ID, replace with `expo-secure-store`:

```js
import * as SecureStore from "expo-secure-store";

async function getOrCreateDeviceId() {
  let id = await SecureStore.getItemAsync("device_id");
  if (!id) {
    id = "dev-" + Math.random().toString(36).slice(2, 10);
    await SecureStore.setItemAsync("device_id", id);
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

| File                                        | Status     |
| ------------------------------------------- | ---------- |
| `packages/mobile/src/App.jsx`               | No changes |
| `packages/mobile/src/screens/PTTScreen.jsx` | No changes |
| `packages/mobile/src/utils/audio.js`        | No changes |
| `packages/mobile/src/utils/comms.js`        | No changes |
| `packages/mobile/src/utils/socket.js`       | No changes |
| `packages/mobile/metro.config.js`           | No changes |
| `packages/comms/src/AudioPipeline.ts`       | No changes |
| `packages/comms/src/MockRelaySocket.ts`     | No changes |
| `packages/comms/src/FloorControl.ts`        | No changes |
| `packages/comms/src/DLS140Client.ts`        | No changes |
| `packages/comms/src/Encryption.ts`          | No changes |

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

| Item           | Current (Mock/Demo)                    | Production Path                                |
| -------------- | -------------------------------------- | ---------------------------------------------- |
| Audio delivery | Live 60ms Opus chunks                    | Production ready (Requires Expo Dev Build)     |
| WebSocket      | MockRelaySocket loopback               | RelaySocket → fix `.on()` → browser WS shim    |
| Auth           | Auto-connect with fake JWT             | Login screen → real JWT → `connectComms(jwt)`  |
| Device ID      | `Math.random()` per launch             | `expo-secure-store` persistent ID              |
| Encryption key | Hardcoded `deadbeef...`                | KDF(masterSecret, talkgroup, rotation)         |
| Channel list   | Hardcoded `MOCK_CHANNELS`              | Live from relay `PRESENCE` events              |
| Floor control  | 50ms window (ineffective at 800ms RTT) | Acceptable for demo; redesign for sat link     |
| GPS            | DLS-140 HTTP poll                      | Add `expo-location` fallback for phone GPS     |
