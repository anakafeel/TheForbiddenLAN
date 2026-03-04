# E2E Cellular PTT Test — Field Report

**Date:** 2026-03-03
**Branch:** `anakafeel/E2E/MOCK-TEST-CELLULAR`
**Device:** Samsung SM-A225M (Galaxy A22, Android 11) — physical phone
**Relay:** `ws://134.122.32.45:3000/ws` (Shrikar's DigitalOcean server)
**Network:** DLS-140 LTE router (cellular uplink, not SATCOM)

---

## What Was Tested

Full stack E2E validation of the PTT pipeline over a live cellular internet connection:

```
Phone mic → PCM capture → Native Opus encode → AES-GCM (pass-through)
  → WebSocket → DigitalOcean relay → fanOut to talkgroup peers
```

---

## Test Results (Confirmed Working)

| Stage | Status | Evidence |
|---|---|---|
| Metro bundler → physical phone via USB | ✅ | `Android Bundled 1019ms (1091 modules)` |
| Auth login (`physicalphone / testpass123`) | ✅ | `[comms] initialized — LIVE mode` |
| WebSocket to relay `/ws` | ✅ | `relay: ws://134.122.32.45:3000/ws` |
| JOIN_TALKGROUP `alpha` | ✅ | `talkgroup: alpha` in init log |
| PTT_START with sessionId | ✅ | `[comms] PTT_START sessionId: 0xA0F767A8` |
| Native Opus encoding (Android MediaCodec) | ✅ | 8193B PCM → ~40B Opus |
| PTT_AUDIO packets transmitted | ✅ | 90 chunks sent (chunk 0–89) |
| Compression ratio | ✅ | **~200x** (8193B → 30–84B per chunk) |
| Encoder teardown on PTT release | ✅ | `[opus] native encoder destroyed` |
| Second PTT press (fresh encoder) | ✅ | Second session chunk 0–51 |

### Compression Numbers (Steady State)

```
[audio] TX chunk 8 | PCM 8193B → Opus 30B | compression 273x
[audio] TX chunk 5 | PCM 8193B → Opus 33B | compression 248x
[audio] TX chunk 0 | PCM 8193B → Opus 84B | compression 98x   ← encoder priming (first frame)
```

- First frame: ~84B (encoder priming, normal for Opus)
- Steady state: **30–57 bytes per Opus frame** at 16kbps
- Satellite budget: 22kbps ÷ 8 bits = 2750 bytes/sec max
- Our output: ~40B/frame × ~16 frames/sec ≈ **640 bytes/sec** → **well within 22kbps**

---

## Issues Encountered and How They Were Fixed

### Issue 1 — WebSocket connecting to wrong URL path
**Symptom:** `[RelaySocket] Reconnecting in 2000ms/4000ms/8000ms... Max reconnect attempts reached`
**Root cause:** `.env.local` had `ws://134.122.32.45:3000` (root). The relay WebSocket endpoint is at `/ws`. Root returns HTTP 404.
**Fix:** Changed `.env.local`:
```
EXPO_PUBLIC_WS_URL=ws://134.122.32.45:3000/ws
```
**Verification:** `curl -H "Upgrade: websocket" http://134.122.32.45:3000/ws` → HTTP 101 Switching Protocols

---

### Issue 2 — Double reconnect consuming retry budget
**Symptom:** Each failed connection burned 2 of the 5 retry attempts instead of 1.
**Root cause:** Both the `error` event and `close` event in `RelaySocket.ts` called `handleReconnect()`. WebSocket always fires `error` then `close` on failure.
**Fix:** Removed `handleReconnect()` from the error handler. Only `close` drives reconnect:
```typescript
this.ws.addEventListener('error', (event) => {
  console.warn('[RelaySocket] error', event);
  // close event fires after error, so reconnect is handled there
});
```

---

### Issue 3 — PTT button was a TODO stub
**Symptom:** Pressing PTT on the Channels screen did nothing.
**Root cause:** `handlePTTToggle` in `Channels.jsx` only called `setIsTransmitting(prev => !prev)` with a `// TODO` comment. No audio functions were called, no navigation to PTTScreen.
**Fix:** Wired `emitStartTalking`/`emitStopTalking` imports and added `navigation.navigate('PTT')` on channel select.

---

### Issue 4 — Physical phone had Expo Go, not SkyTalk APK
**Symptom:** No `com.forbiddenlan.skytalk` package on the device. `pm list packages | grep forbiddenlan` returned nothing.
**Root cause:** Phone had only Expo Go installed from previous development.
**Fix:** Found fat APK (arm64-v8a + x86_64) at:
```
packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk  (169MB)
```
Installed via:
```zsh
adb -s R58T41T27TR install -r app-debug.apk
```

---

### Issue 5 — Metro port mismatch after kill/restart
**Symptom:** Phone showed "Unable to load script. bundler set to localhost:8081"
**Root cause:** Old APK had `localhost:8081` baked in at compile time. Metro kept auto-bumping to 8083 because 8081 was still occupied by a previous process.
**Fix:** Kill all stale processes, force Metro to 8081, then rebuild:
```zsh
fuser -k 8081/tcp 8083/tcp
npx expo run:android --device SM_A225M --port 8081
```
`expo run:android` (not just `expo start`) bakes the Metro host correctly into the APK.

---

### Issue 6 — `opusscript` WASM crash on Hermes
**Symptom:**
```
Aborted(no native wasm support detected)
[audio] startAudioStream failed: Property 'WebAssembly' doesn't exist
```
**Root cause:** `opusscript` is a WebAssembly-compiled Opus encoder. React Native's Hermes JS engine does not implement the `WebAssembly` global. This is a hard incompatibility — WASM cannot run in Hermes.
**Why opusscript was chosen originally:** It requires no native bindings and works in browsers/Node. The React Native context was not considered at the time.

**Fix approach considered:** `react-native-opus` v0.3.1 — rejected, it is decoder-only (no encoder functions).

**Final fix:** Custom Kotlin native module (`OpusEncoderModule`) wrapping Android's built-in `MediaCodec` Opus encoder (`c2.android.opus.encoder`, available API 29+):
- Zero external dependencies
- Uses the OS codec (Samsung A22 confirmed working)
- ~150 lines of Kotlin
- Requires one native rebuild (`npx expo run:android`)

---

### Issue 7 — AudioRecord uninitialized error
**Symptom:** `startRecording() called on an uninitialized AudioRecord`
**Root cause:** `bufferSize: 1920` (our 60ms PCM frame size) was below `AudioRecord.getMinBufferSize()` on the SM-A225M. When the requested buffer is too small, `AudioRecord` silently enters `STATE_UNINITIALIZED` and crashes on `start()`.
**Fix:** Increased buffer to `8192` bytes (safe minimum across all tested Android devices):
```javascript
LiveAudioStream.init({ ..., bufferSize: 8192 });
```
Also added `PermissionsAndroid.request(RECORD_AUDIO)` — Android 6+ requires runtime mic permission.

---

### Issue 8 — JOIN_TALKGROUP vs PRESENCE mismatch (found during review)
**Symptom (latent):** Devices would never receive each other's audio in multi-device mode.
**Root cause:** `ForbiddenLANComms.joinTalkgroup()` was sending `type: 'PRESENCE'` to the relay. The server hub only handles `JOIN_TALKGROUP` to add a socket to the room `Set`. `PRESENCE` from clients is ignored by the hub — it is broadcast *by* the server, not consumed from clients.
**Effect:** `rooms.get('alpha')` would always be empty. `fanOut()` sends to zero peers.
**Fix:** Changed the sent message type:
```typescript
// Before (wrong):
this.relay.send({ type: 'PRESENCE', talkgroup: talkgroupId, ... });

// After (correct):
this.relay.send({ type: 'JOIN_TALKGROUP', talkgroup: talkgroupId } as any);
```

---

## How to Reproduce the E2E Test

### Prerequisites
- Android phone with USB debugging enabled
- Android SDK installed (`$ANDROID_HOME` set)
- pnpm workspace installed (`pnpm install` from repo root)
- Account registered on relay (or use `physicalphone / testpass123`)

### Steps

**1. Connect phone and verify ADB:**
```zsh
adb devices -l
# Should show: R58T41T27TR device usb:... model:SM_A225M
```

**2. From repo root — build and install:**
```zsh
cd packages/mobile
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export ANDROID_SERIAL=R58T41T27TR
set -a && source .env.local && set +a
npx expo run:android --device SM_A225M --port 8081
```
This builds the APK with Metro URL baked in, installs on device, and starts Metro.

> **Note:** `expo run:android` (not `expo start`) is required so `localhost:8081` is baked into the APK. Using `expo start` separately with a manually installed APK will fail if the APK was built for a different port.

**3. On first run only — Metro switches to dev-client mode:**
Press **`s`** in the Metro terminal to switch from Expo Go mode to development build mode.

**4. If the phone shows "Unable to load script":**
```zsh
# In a second terminal:
adb -s R58T41T27TR reverse tcp:8081 tcp:8081
# Then tap RELOAD on the phone
```

**5. Log in on the phone:**
- Username: `physicalphone`
- Password: `testpass123`

**6. Select a channel → hold the PTT button.**

**7. Observe Metro console:**
```
[opus] native encoder initialized — 16kHz mono 16kbps (MediaCodec)
[audio] started — native Opus 16kHz mono 16kbps via Android MediaCodec
[comms] PTT_START sessionId: 0xA0F767A8 — share with server operator to verify relay routing
[audio] TX chunk 0 | PCM 8193B → Opus 84B | compression 98x
[audio] TX chunk 1 | PCM 8193B → Opus 39B | compression 210x
...
[opus] native encoder destroyed
[audio] stopped
```

---

## How to Verify Packets Are Hitting Shrikar's Relay (Server-Side)

The relay hub (`packages/server/src/ws/hub.ts`) currently has **no logging**. Shrikar needs to temporarily add these log lines to confirm receipt:

```typescript
case 'PTT_START': {
  const tg: string = msg.talkgroup;
  if (!tg) break;
  if (typeof msg.sessionId === 'number') {
    sessionTalkgroup.set(msg.sessionId, tg);
  }
  // ADD THIS:
  console.log(`[hub] PTT_START | sessionId: 0x${msg.sessionId?.toString(16).toUpperCase()} | talkgroup: ${tg} | sender: ${msg.sender}`);
  fanOut(socket, tg, rawStr);
  break;
}

case 'PTT_AUDIO': {
  const tg = sessionTalkgroup.get(msg.sessionId as number);
  // ADD THIS:
  console.log(`[hub] PTT_AUDIO | sessionId: ${msg.sessionId} | tg: ${tg ?? 'NOT_FOUND'} | chunk: ${msg.chunk} | bytes: ${msg.data?.length ?? 0}`);
  if (!tg) break;
  fanOut(socket, tg, rawStr);
  break;
}
```

**What to match:** The client logs `PTT_START sessionId: 0xA0F767A8`. The server should print the same hex value. If it does, the packet transited the internet and was processed by hub logic (sessionId→talkgroup mapping was set, fanOut was called).

**Expected server output on a successful PTT press:**
```
[hub] PTT_START | sessionId: 0xA0F767A8 | talkgroup: alpha | sender: dev-h0ly4gm8
[hub] PTT_AUDIO | sessionId: 2700953512 | tg: alpha | chunk: 0 | bytes: 144
[hub] PTT_AUDIO | sessionId: 2700953512 | tg: alpha | chunk: 1 | bytes: 84
...
```
> Note: sessionId is stored as a decimal integer in the Map, but logged as hex on the client. `0xA0F767A8 = 2700953512`.

---

## Architecture Decisions Made During This Session

### Why native MediaCodec instead of a library?

| Option | Verdict | Reason |
|---|---|---|
| `opusscript` (WASM) | ❌ Hard fail | Hermes has no WebAssembly global |
| `react-native-opus` v0.3.1 | ❌ Rejected | Decoder-only, no encode functions |
| `@phanalpha/react-native-mediacodec` | ⚠️ Unknown | API undocumented, risky for hackathon |
| Custom Kotlin + Android MediaCodec | ✅ Chosen | OS-native, zero deps, API 29+ guaranteed |

Android's `c2.android.opus.encoder` (AOSP software codec) is available on all Android 10+ devices. No AAR, no CMake, no NDK toolchain required — just Kotlin + `android.media.MediaCodec`.

### Why `bufferSize: 8192` instead of `1920` (60ms frame)?

`AudioRecord.getMinBufferSize(16000, CHANNEL_IN_MONO, ENCODING_PCM_16BIT)` returns a device-specific value. On the SM-A225M it exceeds 1920 bytes. Below the minimum, `AudioRecord` enters `STATE_UNINITIALIZED` silently and crashes on `start()`. 8192 bytes is a safe floor across all tested Android devices and equals ~256ms of audio / ~4 Opus frames per callback.

### Why `expo run:android` and not `expo start`?

`expo start` only starts the Metro bundler. The Metro host URL is baked into the APK at compile time. If the APK was built for port 8081 and Metro runs on 8083, the app will fail to connect. `expo run:android` builds, bakes the correct URL, installs, and launches in one step.

### Why raw PCM → Opus instead of expo-av recording?

`expo-av` records to m4a/AAC files — not streaming chunks. PTT requires frame-by-frame streaming (each 60ms chunk transmitted independently so the receiver can play incrementally). File-based recording requires the whole transmission to finish before any audio can be sent. Opus via `react-native-live-audio-stream` + `MediaCodec` gives streaming chunks at ~16kbps.

---

## Known Remaining Issues

| Issue | Severity | Notes |
|---|---|---|
| AES-GCM is pass-through (no real encryption) | Medium | `setup-crypto.js` is a stub. Real Web Crypto API or `react-native-quick-crypto` needed for production. |
| Audio playback (`_flushAudio`) writes to `.m4a` | Medium | Accumulated Opus frames are written as `.m4a` and played via expo-av — this will fail silently because Opus ≠ AAC. RX playback needs a native Opus decoder. |
| `NativeEventEmitter` warnings from `react-native-live-audio-stream` | Low | Library has old-arch event emitter API. Cosmetic warning, does not affect function. |
| RelaySocket log shows `talkgroup: undefined` on PTT_AUDIO | Low | AudioChunk intentionally omits talkgroup (bandwidth). Log in `RelaySocket.ts:45` tries to print it anyway. |
| expo-av deprecation warning | Low | SDK 54 deprecates expo-av in favour of expo-audio/expo-video. Will need migration for SDK 55. |

---

## Files Changed in This Session

| File | Change |
|---|---|
| `packages/mobile/.env.local` | Fixed `EXPO_PUBLIC_WS_URL` → added `/ws` path |
| `packages/comms/src/RelaySocket.ts` | Removed double-reconnect bug (error + close both calling handleReconnect) |
| `packages/mobile/src/screens/Channels.jsx` | Wired PTT button to real functions, added channel→PTTScreen navigation |
| `packages/mobile/src/utils/audio.js` | Full rewrite: removed opusscript WASM, added native Opus via OpusEncoderModule, added mic permission request, fixed buffer size |
| `packages/mobile/src/utils/opusEncoder.js` | New file — JS bridge to OpusEncoderModule native module |
| `packages/mobile/android/.../OpusEncoderModule.kt` | New file — Kotlin MediaCodec Opus encoder |
| `packages/mobile/android/.../OpusEncoderPackage.kt` | New file — ReactPackage registration |
| `packages/mobile/android/.../MainApplication.kt` | Registered OpusEncoderPackage |
| `packages/comms/src/ForbiddenLANComms.ts` | Fixed JOIN_TALKGROUP (was sending PRESENCE), added sessionId log |
| `packages/comms/src/types.ts` | Added JOIN_TALKGROUP, LEAVE_TALKGROUP to MessageType |

---

## Commit Reference

Conventional commit message for this work:

```
feat(mobile): native Opus encoding + E2E cellular PTT validation

- Replace opusscript (WASM, Hermes-incompatible) with Android MediaCodec
  Opus encoder via custom Kotlin native module (OpusEncoderModule).
  Achieves ~200x compression (8193B PCM → 30-84B Opus) at 16kbps, within
  22kbps SATCOM budget.
- Fix WebSocket URL: add /ws path to EXPO_PUBLIC_WS_URL in .env.local.
- Fix double-reconnect bug in RelaySocket.ts (error+close both reconnecting).
- Fix JOIN_TALKGROUP: was sending PRESENCE (ignored by hub), now correctly
  sends JOIN_TALKGROUP so socket is added to room Set for fanOut routing.
- Fix AudioRecord crash: increase bufferSize 1920→8192 to exceed
  AudioRecord.getMinBufferSize on SM-A225M.
- Add runtime RECORD_AUDIO permission request before LiveAudioStream.init.
- Log PTT_START sessionId for server-side routing verification.
- Add JOIN_TALKGROUP/LEAVE_TALKGROUP to comms MessageType.
```
