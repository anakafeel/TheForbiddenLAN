# TheForbiddenLAN / SkyTalk — Complete Engineering History

> **Audience**: Future maintainers, hackathon judges, teammates who weren't watching the terminal.
> **Written**: 4 March 2026
> **Scope**: Every fix, feature, tradeoff, failure, and command from the multi-session engineering effort.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Stack & Architecture](#2-stack--architecture)
3. [Phase 1 — Audio System Fixes (5 Root Causes)](#3-phase-1--audio-system-fixes-5-root-causes)
4. [Phase 2 — Opus VoIP Tuning](#4-phase-2--opus-voip-tuning)
5. [Phase 3 — 48kHz → 16kHz Downsample Bug](#5-phase-3--48khz--16khz-downsample-bug)
6. [Phase 4 — Walk-On Prevention (Floor Control)](#6-phase-4--walk-on-prevention-floor-control)
7. [Phase 5 — Mock Mode Removal](#7-phase-5--mock-mode-removal)
8. [Phase 6 — Real-Time Streaming Playback (AudioTrack)](#8-phase-6--real-time-streaming-playback-audiotrack)
9. [Phase 7 — Fast Refresh Red Screen Fix](#9-phase-7--fast-refresh-red-screen-fix)
10. [Phase 8 — C++ Opus FEC Module & White Screen Fix](#10-phase-8--c-opus-fec-module--white-screen-fix)
11. [Phase 9 — Cleartext HTTP & UDP Host Parsing Fix](#11-phase-9--cleartext-http--udp-host-parsing-fix)
12. [Phase 10 — Release APK Build](#12-phase-10--release-apk-build)
13. [Tradeoffs & Design Decisions](#13-tradeoffs--design-decisions)
14. [Known Issues & Future Work](#14-known-issues--future-work)
15. [Commands Reference](#15-commands-reference)
16. [Files Modified (Complete Index)](#16-files-modified-complete-index)
17. [Conventional Commits](#17-conventional-commits)

---

## 1. Project Overview

**TheForbiddenLAN (SkyTalk)** is a SATCOM walkie-talkie system built for the Skytrac Hackathon 2026. Two or more Android devices connect over cellular/SATCOM to a relay server and exchange push-to-talk (PTT) voice, encrypted, with floor control to prevent walk-on interference.

**Key achievement**: End-to-end voice working between two physical Android devices (Samsung Galaxy Z Fold 3 + Motorola One Fusion / Samsung SM-A225M) over the public internet, relayed through a DigitalOcean droplet, with Opus-encoded audio, floor control, and native C++ FEC encoding.

---

## 2. Stack & Architecture

| Layer | Technology | Version |
|-------|-----------|---------|
| **Mobile App** | Expo (bare workflow) + React Native | Expo 54 / RN 0.81.5 |
| **New Architecture** | Fabric + TurboModules (bridgeless) | Enabled |
| **Audio Codec** | Android MediaCodec Opus (`c2.android.opus.encoder/decoder`) | — |
| **FEC Codec** | Native C++ libopus via JNI (`libopusfec.so`) | libopus 1.5.x |
| **Crypto** | AES-GCM-256 (stub pass-through in MVP) | — |
| **Comms SDK** | `@forbiddenlan/comms` (TypeScript, in-repo) | 0.0.1 |
| **Server** | Fastify + @fastify/websocket + Prisma | Fastify 5.x |
| **Database** | PostgreSQL | 15+ |
| **Transport** | WebSocket (primary) + UDP (opportunistic) | — |
| **Build** | Kotlin 2.1.20, NDK 27.1.12297006, CMake 3.22.1 | — |
| **Devices** | Samsung Z Fold 3 (SM-F721B), Moto One Fusion, Samsung SM-A225M | Android 12+ |
| **Server Host** | DigitalOcean droplet `134.122.32.45:3000` | — |

### Monorepo Structure

```
TheForbiddenLAN/
├── packages/
│   ├── comms/          # SDK: ForbiddenLANComms, RelaySocket, UdpSocket, FloorControl
│   ├── server/         # Fastify relay server, Prisma, WebSocket hub
│   ├── mobile/         # Expo/RN app (bare workflow)
│   │   ├── src/        # JS: screens, utils (comms.js, audio.js, socket.js)
│   │   └── android/    # Native: Kotlin modules, C++ Opus FEC, Gradle config
│   ├── portal/         # Web admin portal (Next.js)
│   └── docs/           # Fumadocs documentation site
├── docs/               # Engineering documentation (this file)
└── scripts/            # Setup scripts
```

### Audio Pipeline (TX)

```
Mic → LiveAudioStream (16kHz mono PCM) → MediaCodec Opus Encoder → AES-GCM encrypt → WebSocket → Server fanOut → Other devices
```

### Audio Pipeline (RX)

```
WebSocket → AES-GCM decrypt → MediaCodec Opus Decoder → Native AudioTrack (MODE_STREAM, USAGE_VOICE_COMMUNICATION) → Speaker
```

### Audio Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Sample rate | 16,000 Hz | SATCOM bandwidth constraint |
| Channels | 1 (mono) | Voice only, saves bandwidth |
| Bitrate | 16,000 bps (CBR) | Consistent packet sizing for SATCOM |
| Frame size | 60 ms (960 samples) | Max Opus frame = min packet count over SATCOM |
| Rate control | CBR | VBR causes jitter over SATCOM links |
| Application | VOIP | Opus speech optimization |

---

## 3. Phase 1 — Audio System Fixes (5 Root Causes)

### Problem
Audio was garbled, static-y, or silent between devices. Five independent bugs were responsible.

### Root Cause 1: Server fanOut echoed audio back to sender

**File**: `packages/server/src/ws/hub.ts` — `fanOut()`

The `fanOut` function was sending audio back to the originating socket. The sender heard their own garbled audio mixed with the receiver's playback.

**Fix**: Added `if (peer !== sender)` check in `fanOut()`.

### Root Cause 2: Audio mode not set for playback

**File**: `packages/mobile/src/utils/comms.js`

`expo-av` requires `Audio.setAudioModeAsync()` with `{ playThroughEarpieceAndroid: false, staysActiveInBackground: true })` before playback. Without it, audio output was routed incorrectly or silenced.

**Fix**: Added `_ensureAudioMode()` call before every playback.

### Root Cause 3: PTT_END inactivity timeout too aggressive

**File**: `packages/mobile/src/utils/comms.js`

The RX inactivity timer was 2 seconds. Over cellular with jitter, gaps >2s between audio chunks were common, causing premature flush mid-sentence.

**Fix**: Increased `RX_INACTIVITY_TIMEOUT_MS` from 2000 to 8000.

### Root Cause 4: No half-duplex enforcement

**File**: `packages/mobile/src/utils/comms.js`

While transmitting, the device was still processing incoming audio chunks, creating feedback loops.

**Fix**: Added `_isLocalTx` flag. When set (PTT active), incoming `PTT_AUDIO` messages are dropped. `notifyTxStart()` / `notifyTxEnd()` toggle the flag from `socket.js`.

### Root Cause 5: Talkgroup not rejoined after reconnect

**File**: `packages/comms/src/ForbiddenLANComms.ts`

After WebSocket reconnect, the device didn't re-send `JOIN_TALKGROUP`. The server's `rooms` map had the old socket removed on disconnect, so no audio was routed. 

**Fix**: On `connect` event, re-join the active talkgroup.

### What Failed

- Initially suspected Opus encoding was wrong (it wasn't — the codec was fine)
- Tried swapping buffer sizes (didn't help — the issue was server-side echo)
- Tried base64 padding fixes (red herring)

---

## 4. Phase 2 — Opus VoIP Tuning

### Problem
Audio was understandable but choppy and bandwidth-inefficient.

### Changes

| Setting | Before | After | Why |
|---------|--------|-------|-----|
| Rate control | VBR | **CBR** | SATCOM links need predictable packet sizes |
| Frame size | 20ms | **60ms** | Max Opus frame = fewer packets over SATCOM |
| Bitrate | 24kbps | **16kbps** | Meets SATCOM bandwidth budget |
| Application mode | AUDIO | **VOIP** | Optimizes for speech, enables DTX |

**Files**: `packages/mobile/src/utils/audio.js`, `packages/mobile/src/utils/opusEncoder.js`

### Tradeoff
60ms frames add 40ms latency vs 20ms frames. Acceptable for walkie-talkie (PTT is inherently half-duplex — nobody expects real-time duplex).

---

## 5. Phase 3 — 48kHz → 16kHz Downsample Bug

### Problem
3x slowdown on playback — audio sounded like slow-motion.

### Root Cause
`LiveAudioStream` was recording at **48,000 Hz** (device default) but the Opus encoder was told the input was **16,000 Hz**. The encoder packed 48k samples into 16k-rate frames, tripling the duration.

### Fix
Configured `LiveAudioStream.init()` with explicit `sampleRate: 16000`. The native mic captures at the requested rate or downsamples internally.

**File**: `packages/mobile/src/utils/audio.js`

### What Failed
- Initially thought the slow-motion was an Opus decoder bug
- Tried adjusting playback speed (wrong direction)
- The real hint was the `1920B` PCM size: at 16kHz/60ms that's `960 samples × 2 bytes = 1920` — but the mic was delivering 48kHz data, so those 1920 bytes were only 20ms of audio, not 60ms

---

## 6. Phase 4 — Walk-On Prevention (Floor Control)

### Problem
Two devices transmitting simultaneously caused garbled overlapping audio.

### Design
Server-authoritative floor control. The server is the single source of truth for who holds the floor per talkgroup. Only ONE device may transmit at a time.

### Protocol

```
Device A → PTT_START → Server
  Server: floor free → FLOOR_GRANT → Device A (+ fanOut PTT_START to peers)
  Server: floor taken → FLOOR_DENY → Device A

Device A → PTT_AUDIO → Server
  Server: sender is floor holder → fanOut to peers
  Server: sender is NOT floor holder → DROP (silent)

Device A → PTT_END → Server
  Server: release floor → FLOOR_RELEASED → all peers
```

### Files Modified (7 files)

| File | Change |
|------|--------|
| `packages/server/src/ws/hub.ts` | `talkgroupFloor` map, `releaseFloor()`, FLOOR_GRANT/DENY/RELEASED, watchdog timer (65s auto-release), audio drop for non-holders |
| `packages/comms/src/ForbiddenLANComms.ts` | Handle FLOOR_GRANT/DENY/RELEASED, `floorGranted` flag, `remoteFloorHolder`, `setOnFloorDeny()` callback |
| `packages/comms/src/FloorControl.ts` | Client-side floor state tracking, `setFloor()`, `releaseFloor()`, `isFloorAvailable()` |
| `packages/comms/src/types.ts` | Added `FLOOR_GRANT`, `FLOOR_DENY`, `FLOOR_RELEASED` to `RelayMessage` union |
| `packages/mobile/src/utils/comms.js` | `_channelBusy`, `_floorHolder`, `onFloorDenied()`, `getFloorState()` |
| `packages/mobile/src/utils/socket.js` | Pre-TX floor check in `emitStartTalking()`, returns `false` if denied |
| `packages/mobile/src/screens/PTTScreen.jsx` | UI feedback for floor deny (red indicator) |

### Tradeoff
The server-authoritative model adds one round-trip of latency (PTT_START → server → FLOOR_GRANT → start encoding). On cellular (~50ms RTT) this is imperceptible. On SATCOM (~600ms) the user feels a delay before their mic activates. Alternative was optimistic PTT (start encoding immediately, server may reject) but that wastes bandwidth and complicates the audio pipeline.

---

## 7. Phase 5 — Mock Mode Removal

### Problem
The codebase had a mock mode with fake relay sockets, fake WebSocket responses, and test data baked in. This created confusion during testing — sometimes it was unclear whether audio was going through the real server or being mocked.

### Fix
Removed `MockRelaySocket` class and all `config.mock` conditional paths. The `ForbiddenLANComms` constructor now always creates a real `RelaySocket`.

**Files**: `packages/comms/src/ForbiddenLANComms.ts`, `packages/comms/src/MockRelaySocket.ts` (deleted)

---

## 8. Phase 6 — Real-Time Streaming Playback (AudioTrack)

### Problem
~400ms playback delay. The old pipeline buffered all Opus frames into memory, wrote a WAV file to disk, then played it with `expo-av`. This added: base64 decode + file I/O + expo-av load time ≈ 400ms.

### Solution
Native Android `AudioTrack` in `MODE_STREAM` with `USAGE_VOICE_COMMUNICATION`. Each decoded PCM frame (960 samples = 60ms) is written directly to the hardware buffer. Latency dropped from ~400ms to ~60ms (one frame).

### New Files

| File | Purpose |
|------|---------|
| `packages/mobile/android/app/src/main/java/com/forbiddenlan/skytalk/AudioStreamPlayerModule.kt` | Native Kotlin module: `AudioTrack` in `MODE_STREAM`, 16kHz mono, `USAGE_VOICE_COMMUNICATION`. Methods: `start()`, `writePcmBase64(data)`, `stop()` |
| `packages/mobile/src/utils/audioStreamPlayer.js` | JS bridge: `startStreamPlayer()`, `writeStreamPCM(base64)`, `stopStreamPlayer()` |

### Modified Files

| File | Change |
|------|--------|
| `packages/mobile/android/app/.../OpusEncoderPackage.kt` | Registered `AudioStreamPlayerModule` |
| `packages/mobile/src/utils/comms.js` | New streaming RX pipeline: on `PTT_AUDIO` → decrypt → Opus decode → `writeStreamPCM()`. Falls back to legacy WAV path if native module unavailable. |

### Tradeoff
The native module only works on Android. iOS would need an equivalent `AVAudioEngine` implementation. The legacy WAV fallback remains for compatibility.

### What Failed
- First attempt used `AudioTrack.write()` with `WRITE_BLOCKING` which caused ANR on the UI thread. Fixed by running writes on a background `HandlerThread`.
- Tried `Oboe` (Google's C++ audio library) but it added too much complexity for the hackathon timeline.

---

## 9. Phase 7 — Fast Refresh Red Screen Fix

### Problem
During development with Metro, disconnecting the USB cable or triggering Fast Refresh caused a red screen crash. Reconnecting the cable showed the error persisted until a full app restart.

### Root Cause
Metro Fast Refresh re-evaluates JS modules. Three modules created new instances on every re-evaluation:

1. **`comms.js`**: `new ForbiddenLANComms()` and `new Encryption()` at module scope — created new uninitialized instances, orphaning the existing WebSocket
2. **`config.js`**: `Math.random()` device ID regenerated on every refresh
3. **`audio.js`**: `LiveAudioStream` event handlers stacked up (multiple `.on('data', ...)` registrations)

### Fix
Persist all singletons on `global` so they survive module re-evaluation:

| Global Key | Purpose |
|------------|---------|
| `global.__COMMS_SINGLETON__` | `ForbiddenLANComms` instance |
| `global.__ENCRYPTION_SINGLETON__` | `Encryption` instance |
| `global.__COMMS_INITIALIZED__` | Guard: `initComms()` only runs once |
| `global.__DEVICE_ID__` | Stable random device ID |
| `global.__AUDIO_IS_RECORDING__` | Prevents stale `LiveAudioStream` listener stacking |

**Files**: `comms.js`, `config.js`, `audio.js`

### Tradeoff
Using `global` is not ideal for production (namespace pollution, no cleanup). For production, use a proper singleton registry or Expo's module system. For development-time stability, this is the right call.

---

## 10. Phase 8 — C++ Opus FEC Module & White Screen Fix

### Background
A native C++ Opus encoder with Forward Error Correction (FEC) was integrated to improve audio resilience over SATCOM. The module compiles libopus from source via CMake/NDK and exposes JNI methods to Kotlin.

### New Files

| File | Purpose |
|------|---------|
| `android/app/src/main/cpp/CMakeLists.txt` | CMake config: compiles all libopus sources + `OpusFECEncoder.cpp` into `libopusfec.so` |
| `android/app/src/main/cpp/OpusFECEncoder.cpp` | JNI bridge: `nativeInitEncoder`, `nativeEncode`, `nativeDestroyEncoder`. Configures Opus with `OPUS_SET_INBAND_FEC(1)`, `OPUS_SET_PACKET_LOSS_PERC(20)` |
| `android/app/src/main/cpp/libopus/` | Full libopus 1.5.x source tree (CELT + SILK + float) |
| `android/app/.../OpusFECEncoderModule.kt` | Kotlin RN module: calls `System.loadLibrary("opusfec")`, exposes `initEncoder`, `encode`, `destroyEncoder` to JS. Has try-catch around `loadLibrary` for graceful degradation. |
| `android/app/.../OpusFECEncoderPackage.kt` | Registers `OpusFECEncoderModule` as a React Native package |

### The White Screen Bug

**Symptom**: After integrating the C++ module, the app showed a permanent white screen. Metro reported a successful bundle load. Logcat showed:
- `libappmodules.so` MISSING from APK
- `PlatformConstants` TurboModule not found
- `AppRegistryBinding::startSurface failed. Global was not installed.`
- `libopusfec.so` loaded fine

**Root Cause**: Android Gradle Plugin (AGP) only supports **ONE `externalNativeBuild`** per module. The original approach added:

```gradle
// In defaultConfig:
externalNativeBuild {
    cmake { cppFlags "" }
}
// At top level:
externalNativeBuild {
    cmake { path "src/main/cpp/CMakeLists.txt" }
}
```

React Native 0.81 New Architecture uses AGP's `externalNativeBuild` **internally** (via `autolinkLibrariesWithApp()`) to compile its codegen-generated C++ (Fabric, TurboModules, JSI) into `libreactnative.so`. Our custom `externalNativeBuild` **overrode** RN's config, preventing `libreactnative.so` and `libappmodules.so` from being built.

**Fix**: Removed both `externalNativeBuild` blocks and built `libopusfec.so` independently via a custom Gradle task that invokes CMake through `exec{}`:

```gradle
task buildOpusFecLibrary {
    doLast {
        abis.each { abi ->
            exec { commandLine cmakeExe, "-DCMAKE_TOOLCHAIN_FILE=...", ... }
            exec { commandLine cmakeExe, "--build", ".", "-j${jobs}" }
            copy { from "${bld}/libopusfec.so" into "${outputDir}/${abi}" }
        }
    }
}
```

The .so files are deposited into `build/generated-jniLibs/` which AGP picks up via `sourceSets { main.jniLibs.srcDirs }`.

**File**: `packages/mobile/android/app/build.gradle`

### What Failed

- **First attempt**: Just removing `externalNativeBuild` — `libopusfec.so` disappeared from the APK
- **Second attempt**: Adding task dependency via `task.name.contains("NativeLibs")` — AGP 8.x task is actually `mergeDebugJniLibFolders`, not `NativeLibs`. Had to match both strings.
- **Stale CMake cache**: After removing `externalNativeBuild`, the `.cxx/` cache still referenced old codegen paths. Required `rm -rf app/.cxx app/build`.

### APK Verification (post-fix)

```
lib/arm64-v8a/libappmodules.so     ← was MISSING, now present
lib/arm64-v8a/libopusfec.so        ← Opus FEC encoder (425KB)
lib/arm64-v8a/libreactnative.so    ← RN codegen (18MB)
lib/arm64-v8a/libhermes.so         ← JS engine
lib/arm64-v8a/libjsi.so            ← JSI bridge
```

---

## 11. Phase 9 — Cleartext HTTP & UDP Host Parsing Fix

### Cleartext HTTP

**Symptom**: Second device (not connected via USB) showed "Cannot reach server: network request failed" on login.

**Root Cause**: Android 9+ blocks cleartext HTTP by default. The API URL is `http://134.122.32.45:3000` (no TLS). The debug manifest overlay already had `usesCleartextTraffic="true"`, but the main manifest was missing it.

**Fix**: Added `android:usesCleartextTraffic="true"` to the `<application>` tag in `AndroidManifest.xml`.

**File**: `packages/mobile/android/app/src/main/AndroidManifest.xml`

**Why the first device worked**: It was routed through `adb reverse tcp:8081 tcp:8081` which tunnels traffic through the USB connection, bypassing the cleartext restriction. The second device had no such tunnel.

### UDP Host Parsing Bug

**Symptom**: `[UdpSocket] TX error: Unable to resolve host "134.122.32.45:3000": No address associated with hostname`

**Root Cause**: The URL parsing regex in `UdpSocket.connect()` stripped components in the wrong order:

```typescript
// BEFORE (broken):
url.replace('ws://', '').replace('http://', '').replace(/:\d+$/, '').replace(/\/.*$/, '')
// Input: "ws://134.122.32.45:3000/ws"
// Step 1: "134.122.32.45:3000/ws"
// Step 2: no change
// Step 3: /:\d+$/ doesn't match (string ends with "/ws", not digits!)
// Step 4: "134.122.32.45:3000"  ← PORT STILL IN HOSTNAME
```

**Fix**: Strip path BEFORE port:

```typescript
// AFTER (fixed):
url.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
// Step 3: "134.122.32.45:3000"  (path stripped first)
// Step 4: "134.122.32.45"       ← correct!
```

**File**: `packages/comms/src/UdpSocket.ts`

---

## 12. Phase 10 — Release APK Build

### Why
Debug APKs require Metro (JS bundler) running on a laptop connected via USB. For field testing with two devices, you need a standalone APK with the JS bundle embedded.

### Build Command

```bash
cd packages/mobile/android
GRADLE_OPTS="-Xmx4g" ./gradlew app:assembleRelease --no-daemon
```

### Notes

- The `--no-daemon` flag and `GRADLE_OPTS="-Xmx4g"` were needed because the Gradle daemon crashed with OOM on the default 2GB heap. Release builds bundle JS + run R8 + compile C++ for 4 ABIs.
- Release is signed with the debug keystore (`signingConfigs.debug`). For production, generate a proper release keystore.
- Output: `packages/mobile/android/app/build/outputs/apk/release/app-release.apk` (106 MB)

### APK Contents Verified

| Component | Present |
|-----------|---------|
| `assets/index.android.bundle` | JS bundle embedded |
| `lib/*/libopusfec.so` | Opus FEC encoder (all 4 ABIs) |
| `lib/*/libappmodules.so` | RN native modules |
| `lib/*/libreactnative.so` | RN codegen |
| `lib/*/libhermes.so` | Hermes JS engine |

### Install on Device

```bash
adb install -r packages/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Or transfer the APK file and sideload (enable "Install from unknown sources").

---

## 13. Tradeoffs & Design Decisions

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| **Codec** | MediaCodec Opus (hardware) | Pure C++ libopus (software) | Hardware codec = zero CPU on encode/decode. C++ FEC encoder added separately for packet loss recovery. |
| **Frame size** | 60ms | 20ms | Fewer packets over SATCOM. Adds 40ms latency — acceptable for PTT. |
| **Rate control** | CBR 16kbps | VBR | SATCOM needs predictable packet sizes. VBR causes jitter. |
| **Transport** | WebSocket (primary) + UDP (opportunistic) | UDP only | WebSocket gives reliable delivery + server-side floor control. UDP added for lower latency audio when available. |
| **Floor control** | Server-authoritative | Optimistic client-side | Server is simpler and correct. Client-side would require conflict resolution. |
| **Playback** | Native AudioTrack stream | expo-av WAV file | 60ms vs 400ms latency. expo-av fallback kept for compatibility. |
| **Crypto** | AES-GCM-256 stub (pass-through) | Full E2E encryption | MVP timeline. Encryption module architecture exists, just needs real key exchange (DLS-140 KDF). |
| **CMake build** | Custom Gradle task + exec{} | AGP externalNativeBuild | AGP only allows ONE externalNativeBuild. RN New Arch owns it. Custom task avoids conflict. |
| **Fast Refresh** | Global singletons | Proper module registry | Pragmatic fix for dev-time stability. Production should use Expo module system. |
| **Signing** | Debug keystore for release | Proper release keystore | Hackathon timeline. Generate a real keystore before publishing. |
| **Cleartext HTTP** | `usesCleartextTraffic="true"` | TLS/HTTPS | Server doesn't have TLS configured. For production, add Let's Encrypt. |

---

## 14. Known Issues & Future Work

### Crypto Pass-Through
The encryption module logs `[crypto.subtle] encrypt called (MVP pass-through - NO REAL ENCRYPTION)`. Actual AES-GCM implementation needs the DLS-140 key derivation flow.

### Sequence Numbers
TX logs show `seq: undefined`. The `RelaySocket.send()` for `PTT_AUDIO` doesn't populate a sequence number. Not breaking (audio plays in order via TCP), but needed for UDP reordering and packet loss detection.

### APK Size (106 MB)
The release APK includes native libraries for all 4 ABIs. For production, use App Bundles (`.aab`) which Google Play splits per-device. Or filter ABIs:
```properties
# gradle.properties
reactNativeArchitectures=arm64-v8a
```

### iOS Support
The `AudioStreamPlayerModule` is Android-only. iOS needs an equivalent using `AVAudioEngine`. The legacy expo-av WAV fallback works on iOS but with ~400ms latency.

### UDP Transport
UDP socket works but is opportunistic. The server falls back to WebSocket for peers without a registered UDP address. NAT traversal is basic (keep-alive every 25s). STUN/TURN would improve reliability.

### Playwright E2E Tests
9 of 24 portal E2E tests are failing (deferred — not blocking mobile work).

---

## 15. Commands Reference

### Development (Debug Build)

```bash
# Start Metro bundler
cd packages/mobile
npx expo start

# Build & run on connected device (debug, requires Metro)
npx expo run:android --device

# Or manually via Gradle
cd packages/mobile/android
./gradlew app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081   # Route Metro through USB
adb shell am start -n com.forbiddenlan.skytalk/.MainActivity
```

### Release Build

```bash
cd packages/mobile/android

# Clean everything (important after native code changes)
rm -rf app/.cxx app/build build .gradle
./gradlew clean

# Build release APK (4GB heap to avoid OOM)
GRADLE_OPTS="-Xmx4g" ./gradlew app:assembleRelease --no-daemon

# Install
adb install -r app/build/outputs/apk/release/app-release.apk
```

### Server

```bash
cd packages/server

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed database (creates admin/admin, pilot1/test, Ground Ops talkgroup)
npx tsx prisma/seed.ts

# Start server
npm run dev       # development (watch mode)
npm run start     # production
```

### Test Users

| Username | Password | Role |
|----------|----------|------|
| admin | admin | admin |
| pilot1 | test | user |
| pilot2 | test | user (created by Shri) |

### Comms SDK Rebuild

```bash
cd packages/comms
npm run build     # tsc -p tsconfig.lib.json
```

### Debugging

```bash
# Check device connection
adb devices

# Route Metro port through USB
adb reverse tcp:8081 tcp:8081

# Watch app logs (filtered)
adb logcat --pid=$(adb shell pidof com.forbiddenlan.skytalk) | grep -iE "comms|audio|opus|relay|floor"

# Check native libs in APK
unzip -l app/build/outputs/apk/debug/app-debug.apk | grep "\.so$"

# Test server health
curl http://134.122.32.45:3000/ping

# Test login
curl -X POST http://134.122.32.45:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"pilot2","password":"test"}'
```

---

## 16. Files Modified (Complete Index)

### packages/mobile/android/

| File | Phase | Change |
|------|-------|--------|
| `app/build.gradle` | 8 | Removed `externalNativeBuild`, added custom `buildOpusFecLibrary` task, `sourceSets.jniLibs` |
| `app/src/main/AndroidManifest.xml` | 9 | Added `usesCleartextTraffic="true"` |
| `app/src/main/cpp/CMakeLists.txt` | 8 | New: compiles libopus + OpusFECEncoder.cpp → libopusfec.so |
| `app/src/main/cpp/OpusFECEncoder.cpp` | 8 | New: JNI bridge for Opus FEC encoder |
| `app/src/main/cpp/libopus/` | 8 | New: full libopus source tree |
| `app/.../AudioStreamPlayerModule.kt` | 6 | New: native AudioTrack streaming player |
| `app/.../MainApplication.kt` | 8 | Added `OpusFECEncoderPackage()` to packages |
| `app/.../OpusEncoderPackage.kt` | 6 | Added `AudioStreamPlayerModule` registration |
| `app/.../OpusFECEncoderModule.kt` | 8 | New: Kotlin wrapper for libopusfec JNI |
| `app/.../OpusFECEncoderPackage.kt` | 8 | New: registers FEC module as RN package |

### packages/mobile/src/

| File | Phase | Change |
|------|-------|--------|
| `config.js` | 7 | `global.__DEVICE_ID__` for Fast Refresh stability |
| `utils/comms.js` | 1,3,6,7 | Audio mode, half-duplex, streaming RX pipeline, global singletons, floor state |
| `utils/audio.js` | 2,5,7 | CBR/60ms/16kbps tuning, 16kHz sample rate fix, stale listener cleanup |
| `utils/socket.js` | 4 | Pre-TX floor check, `emitStartTalking` returns bool |
| `utils/opusEncoder.js` | 2 | Frame size, bitrate, CBR settings |
| `utils/audioStreamPlayer.js` | 6 | New: JS bridge for native AudioTrack |
| `screens/PTTScreen.jsx` | 4 | Floor deny UI feedback |

### packages/comms/src/

| File | Phase | Change |
|------|-------|--------|
| `ForbiddenLANComms.ts` | 1,4,5 | Floor control handlers, mock removal, talkgroup rejoin |
| `RelaySocket.ts` | — | WebSocket reconnect, addEventListener migration |
| `FloorControl.ts` | 4 | New: client-side floor state tracking |
| `UdpSocket.ts` | 9 | Fixed host parsing regex (stripped path before port) |
| `types.ts` | 4 | Added FLOOR_GRANT, FLOOR_DENY, FLOOR_RELEASED |

### packages/server/src/

| File | Phase | Change |
|------|-------|--------|
| `ws/hub.ts` | 1,4 | fanOut sender exclusion, floor control (GRANT/DENY/RELEASED), watchdog, audio drop |
| `routes/auth.ts` | — | login, register, changepassword (unchanged) |

---

## 17. Conventional Commits

Recommended commit sequence (chronological, squashable):

```
1.  fix(server): exclude sender from fanOut relay to prevent audio echo
2.  fix(mobile): set audio mode before playback to fix silent speaker
3.  fix(mobile): increase RX inactivity timeout from 2s to 8s
4.  fix(mobile): enforce half-duplex — drop RX audio during TX
5.  fix(comms): rejoin talkgroup after WebSocket reconnect
6.  feat(mobile): tune Opus for SATCOM — CBR 16kbps, 60ms frames, VOIP mode
7.  fix(mobile): set LiveAudioStream sample rate to 16kHz to fix 3x slowdown
8.  feat(server): add server-authoritative floor control (walk-on prevention)
9.  feat(comms): handle FLOOR_GRANT/DENY/RELEASED in SDK + client state
10. feat(mobile): show floor-deny feedback in PTT screen UI
11. refactor(comms): remove mock mode — always use real RelaySocket
12. feat(mobile): add native AudioTrack streaming playback module
13. feat(mobile): streaming RX pipeline — decrypt → decode → AudioTrack
14. fix(mobile): persist singletons on global to survive Fast Refresh
15. feat(mobile): integrate C++ Opus FEC encoder via CMake/NDK/JNI
16. fix(mobile): build libopusfec.so independently to avoid RN codegen conflict
17. fix(mobile): enable cleartext HTTP in AndroidManifest for non-USB devices
18. fix(comms): fix UDP host parsing — strip path before port in URL regex
19. chore(mobile): build release APK with embedded JS bundle
```

Or collapsed into fewer commits for a cleaner history:

```
feat(server): floor control + fanOut sender exclusion
feat(comms): floor control SDK + mock removal + UDP host fix
feat(mobile): full audio pipeline — Opus tuning, streaming AudioTrack, FEC, Fast Refresh
fix(mobile): white screen fix — build libopusfec.so outside AGP externalNativeBuild
fix(mobile): cleartext HTTP + release APK build
docs: complete engineering history
```

---

*Last updated: 4 March 2026. Generated from live terminal sessions.*
