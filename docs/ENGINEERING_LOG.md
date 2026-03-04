# SkyTalk Engineering Log

> End-to-end PTT voice over SATCOM — from broken static to working walkie-talkie.  
> Last updated: 4 March 2026

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Why Expo over Capacitor](#why-expo-over-capacitor)
3. [Audio Pipeline Architecture](#audio-pipeline-architecture)
4. [Problems Encountered & Solutions](#problems-encountered--solutions)
5. [Walk-On Prevention (Floor Control)](#walk-on-prevention-floor-control)
6. [Opus Codec — Native Android Integration](#opus-codec--native-android-integration)
7. [Audio Library Decisions](#audio-library-decisions)
8. [Bandwidth Budget (22 kbps SATCOM)](#bandwidth-budget-22-kbps-satcom)
9. [Half-Duplex Enforcement](#half-duplex-enforcement)
10. [Loopback Testing Mode](#loopback-testing-mode)
11. [Encryption](#encryption)
12. [Deployment Topology](#deployment-topology)
13. [Known Limitations](#known-limitations)
14. [File Map (Key Files)](#file-map-key-files)

---

## System Overview

SkyTalk is a push-to-talk (PTT) voice communications app designed for SATCOM-constrained environments (Iridium Certus, 22 kbps uplink). The system consists of:

```
┌─────────────────┐         ┌────────────────────┐         ┌─────────────────┐
│   Android App   │◄──WS──►│   Relay Server     │◄──WS──►│   Android App   │
│ (React Native)  │         │ (Fastify + ws)     │         │ (React Native)  │
│                 │         │ DigitalOcean VPS   │         │                 │
│ Opus Encode ──► │         │ Floor Control      │         │ ◄── Opus Decode │
│ AES-GCM ─────► │         │ Fan-out routing    │         │ ◄── AES-GCM    │
│ LiveAudioStream │         │ JWT auth           │         │ expo-av playback│
└─────────────────┘         └────────────────────┘         └─────────────────┘
```

- **Mobile app**: Expo (bare workflow) + React Native, native Kotlin MediaCodec modules for Opus
- **Server**: Fastify + `@fastify/websocket` + Prisma + PostgreSQL on 134.122.32.45:3000
- **Comms SDK**: `@forbiddenlan/comms` — shared TypeScript package consumed by both mobile and server

---

## Why Expo over Capacitor

The mobile app was originally built on Capacitor + Vite. We migrated to Expo for these reasons:

| Factor | Capacitor | Expo | Winner |
|--------|-----------|------|--------|
| **Native module support** | Requires separate Cordova/Cap plugins or manual Android Studio projects | `expo prebuild` generates native project, direct Kotlin/Swift modules | Expo |
| **Monorepo compatibility** | Vite works but Metro is the RN standard; dual-bundler conflicts | Metro is native to RN; pnpm workspace resolution works with `metro.config.js` | Expo |
| **Live audio streaming** | No built-in; cordova-plugin-audioinput is abandoned | `react-native-live-audio-stream` works with Metro; native module bridge intact | Expo |
| **Opus codec** | Would need a Cordova plugin wrapper around native code | Direct `NativeModules` bridge from Kotlin → JS via `ReactContextBaseJavaModule` | Expo |
| **OTA updates** | None (full rebuild each time) | `expo-updates` for JS bundles; `expo run:android` for native changes | Expo |
| **Community** | Smaller for RN use cases | Largest RN ecosystem; better docs, more StackOverflow answers | Expo |
| **Build speed** | Fast (Vite HMR on web, but native builds are manual) | Metro HMR on native; `expo run:android` handles Gradle | Expo |

**Key tradeoff**: Expo's bare workflow requires managing native `android/` and `ios/` directories. We accepted this because we need native Kotlin modules for MediaCodec Opus. The managed workflow (Expo Go) cannot load custom native modules.

**What we lost**: Vite's fast web dev server. Metro is slower for web iterations. For native-only development (which is our production target), this doesn't matter.

See [expo-migration.md](expo-migration.md) for the full migration log.

---

## Audio Pipeline Architecture

### TX Path (Microphone → Network)

```
Mic (16kHz mono 16-bit)
  │
  ▼
LiveAudioStream (60ms frames, 1920 bytes)
  │
  ▼
OpusEncoderModule.kt (MediaCodec c2.android.opus.encoder)
  ├── 16kHz input, 16kbps CBR, 60ms frames
  ├── VBR disabled (Exynos 850 ignores VBR flag)
  └── Output: ~120 bytes/frame Opus
  │
  ▼
AES-GCM-256 Encryption (+28 bytes: 12 IV + 16 tag)
  │
  ▼
Base64 encode → JSON WebSocket message
  │
  ▼
WebSocket → Relay Server → Fan-out to talkgroup
```

### RX Path (Network → Speaker)

```
WebSocket PTT_AUDIO message
  │
  ▼
AES-GCM-256 Decryption
  │
  ▼
OpusDecoderModule.kt (MediaCodec Opus decoder)
  ├── Opus internally outputs 48kHz PCM (always!)
  ├── Downsample 48kHz → 16kHz (3-tap averaging filter)
  └── Output: 16kHz mono 16-bit PCM
  │
  ▼
Accumulate PCM frames in memory
  │
  ▼ (on PTT_END or 8s inactivity timeout)
  │
WAV header (44 bytes) + concatenated PCM
  │
  ▼
Write to FileSystem cache → expo-av Sound.createAsync() → Speaker
```

---

## Problems Encountered & Solutions

### Problem 1: Audio Static (Raw Opus as M4A)

**Symptom**: Garbled noise/static instead of voice.  
**Root Cause**: The original code saved raw Opus frames directly as `.m4a` files and played them with expo-av. expo-av interpreted the raw Opus bytes as AAC, producing noise.  
**Fix**: Built native Kotlin `OpusDecoderModule` using Android's MediaCodec framework. Opus frames are decoded to PCM, accumulated, wrapped in a WAV header, and played via expo-av.

### Problem 2: TX VBR Ignored on Exynos 850

**Symptom**: Encoded Opus frames were larger than expected, sometimes exceeding the satellite bandwidth budget.  
**Root Cause**: Samsung Galaxy A22 (Exynos 850, Android 11) silently ignores the `KEY_BITRATE_MODE = BITRATE_MODE_CBR` flag on c2.android.opus.encoder. The encoder outputs VBR regardless.  
**Fix**: Hardcoded bitrate to 16 kbps and frame duration to 60ms. At this configuration, even VBR output stays well within budget. Added PCM diagnostic logging to verify frame sizes.

### Problem 3: Can't Hear Audio (5 Sub-Causes)

After fixing static, audio transmitted successfully but receivers heard nothing. This had **five independent root causes**:

| # | Cause | Fix |
|---|-------|-----|
| 1 | Server `fanOut()` skips sender — single-device testing impossible | Added loopback mode (env-gated) |
| 2 | No `Audio.setAudioModeAsync()` after mic recording — playback routes to earpiece | Added `_ensurePlaybackMode()` call before every playback |
| 3 | No PTT_END timeout — if PTT_END packet is lost, audio buffer grows forever | Added 8-second inactivity timer that auto-flushes |
| 4 | Half-duplex filter blocked loopback audio | Switched to `onRawMessage` + local `_isLocalTx` flag |
| 5 | Talkgroup not re-joined on PTT screen mount | Added `useEffect` with `joinChannel` on mount/channel change |

### Problem 4: Audio Plays 3× Too Slow

**Symptom**: Received audio was intelligible but played at ~1/3 speed (deep, slow voice).  
**Root Cause**: Android's Opus decoder **always** outputs PCM at 48 kHz internally, regardless of the `KEY_SAMPLE_RATE` in MediaFormat. The WAV header said 16 kHz, so expo-av played 48 kHz data at 16 kHz speed → 3× slowdown.  
**Fix**: Added `downsample()` in `OpusDecoderModule.kt` — averages every 3 consecutive samples (48 kHz → 16 kHz) using a simple 3-tap filter. The downsampled PCM matches the WAV header.

### Problem 5: Walk-Ons (No Floor Control)

**Symptom**: Two devices could transmit simultaneously, producing garbled interleaved audio on receivers.  
**Root Cause**: `FloorControl.ts` existed as dead code — `arbitrate()` was never called. The server blindly relayed all PTT_AUDIO from all clients.  
**Fix**: Implemented server-authoritative floor control. See [Walk-On Prevention](#walk-on-prevention-floor-control) below.

---

## Walk-On Prevention (Floor Control)

Floor control is enforced **server-side** — the server is the single source of truth for who holds the floor on each talkgroup.

### Protocol

```
Device A presses PTT:
  → PTT_START (talkgroup, sender, sessionId)
  ← FLOOR_GRANT (winner: A)                    // A can transmit
  → PTT_AUDIO (relayed to all peers)

Device B presses PTT while A is transmitting:
  → PTT_START
  ← FLOOR_DENY (holder: A)                     // B is rejected
  B's SDK auto-stops recording (_forceStopPTT)
  B's UI shows "CHANNEL BUSY" banner (red, 3s)

Device A releases PTT:
  → PTT_END
  ← FLOOR_RELEASED (broadcast to all)          // Channel is free
  Device B can now PTT
```

### Enforcement Layers

1. **Server (`hub.ts`)**: `talkgroupFloor` map tracks the floor holder per talkgroup. `PTT_AUDIO` from non-holders is silently dropped. A 65-second watchdog auto-releases stuck floors.
2. **SDK (`ForbiddenLANComms.ts`)**: Client-side pre-check avoids wasting a round-trip. Handles `FLOOR_GRANT`, `FLOOR_DENY`, `FLOOR_RELEASED` messages. `_forceStopPTT()` stops recording without sending PTT_END.
3. **Mobile UI (`PTTScreen.jsx`)**: Red "CHANNEL BUSY" banner on FLOOR_DENY. PTT button is no-op when channel is busy.

### Edge Cases Handled

- **Socket disconnect**: Server auto-releases all floors held by the disconnecting socket.
- **PTT_END lost**: Server watchdog releases after 65s (client MAX_TX_MS is 60s + 5s margin).
- **Late joiner**: On `JOIN_TALKGROUP`, if someone is already transmitting, the server sends a `FLOOR_GRANT` to notify the joiner that the channel is busy.
- **Same device re-press**: Idempotent — updates session but doesn't deny.

---

## Opus Codec — Native Android Integration

We use Android's built-in MediaCodec Opus encoder/decoder via custom Kotlin native modules registered through React Native's bridge.

### Encoder (`OpusEncoderModule.kt`)

| Parameter | Value | Why |
|-----------|-------|-----|
| Sample Rate | 16 kHz | Wideband voice; good quality for comms |
| Channels | 1 (mono) | Single mic, half-duplex — stereo wastes bandwidth |
| Bitrate | 16 kbps CBR | Fits in 22 kbps satellite budget with headroom |
| Frame Duration | 60 ms | Reduces per-packet JSON/WS overhead (16.6 fps vs 50 fps at 20ms) |
| VBR | Disabled | Exynos 850 ignores it; CBR gives predictable bitrate |

### Decoder (`OpusDecoderModule.kt`)

- Uses `c2.android.opus.decoder` via MediaCodec
- OpusHead CSD-0/1/2 configuration for correct initialization
- **Critical**: Opus always decodes to 48 kHz internally. Downsampling 48→16 kHz is performed in native code before returning PCM to JS.
- 3-tap averaging filter avoids aliasing on voice frequencies

### Module Registration

`OpusEncoderPackage.kt` extends `ReactPackage`, creating both `OpusEncoderModule` and `OpusDecoderModule`. Registered in `MainApplication.kt` via `getPackages()`.

---

## Audio Library Decisions

Four libraries make up the audio pipeline. Each was chosen after evaluating (and rejecting) alternatives.

### 1. `react-native-live-audio-stream` (TX — mic capture)

**What it does**: Captures raw 16-bit PCM from the microphone in real-time via Android's `AudioRecord`, delivering base64-encoded buffers to JS on each callback.

**Why this library**:
- Delivers raw PCM frames at a configurable buffer size (we use 1920 bytes = 60ms at 16kHz mono)
- No codec applied at capture time — we need raw PCM to feed our own Opus encoder
- Lightweight: single native module, no external dependencies

**Alternatives rejected**:

| Library | Why rejected |
|---------|-------------|
| `expo-av` Recording API | Records to a file (`.m4a`, `.caf`). Cannot get raw PCM frames in real-time. You only get the file path after `stopAndUnloadAsync()`. Useless for streaming PTT. |
| `react-native-audio-api` | Web Audio API polyfill. Powerful but massive — pulls in AudioWorklet, AnalyserNode, etc. We only need mic → PCM. Overkill. |
| `react-native-audio-recorder-player` | Also file-based. Same problem as expo-av Recording. |
| `cordova-plugin-audioinput` | Capacitor/Cordova plugin. We migrated away from Capacitor. Also abandoned (last commit 2021). |

**Key gotcha**: `LiveAudioStream` holds the Android audio session in recording mode even after `stop()`. If you don't explicitly switch the audio session back to playback mode (`Audio.setAudioModeAsync`), subsequent `expo-av` playback routes to the earpiece or fails silently. This cost us 2 days of debugging.

### 2. `expo-av` (RX — audio playback)

**What it does**: Plays audio files (WAV, MP3, M4A) through the device speaker. We write decoded PCM + WAV header to the filesystem, then `Sound.createAsync()` plays it.

**Why this library**:
- Already bundled with Expo — zero extra native dependencies
- Handles audio focus, ducking, and routing (speaker vs earpiece) via `Audio.setAudioModeAsync`
- Works on both Android and iOS (future)

**Alternatives rejected**:

| Library | Why rejected |
|---------|-------------|
| `react-native-audio-api` (AudioBufferSourceNode) | Could play raw PCM from memory without writing a file. But requires a full native rebuild, adds a large AudioWorklet runtime, and is pre-1.0 with breaking API changes. |
| `expo-speech` | Text-to-speech only. Cannot play arbitrary audio. |
| Raw `android.media.AudioTrack` via native module | Would eliminate the WAV file write (play PCM directly from memory). Optimal for latency. But requires writing a custom native module for both platforms. Future optimization. |

**Key gotcha**: `expo-av` cannot play raw PCM buffers from memory — it requires a file URI. So the RX pipeline must: (1) accumulate PCM frames, (2) prepend a 44-byte WAV header, (3) write to `FileSystem.cacheDirectory`, (4) create a `Sound` from the file URI. This adds ~200ms latency between PTT_END and audio playback start. A native `AudioTrack` module would eliminate this.

**Key gotcha #2**: When expo-av plays a `.m4a` file, it uses Android's MediaCodec AAC decoder. If you write raw Opus bytes to a `.m4a` file and play it, the AAC decoder interprets the Opus as corrupted AAC and outputs static/noise. This was the root cause of our original "audio static" bug.

### 3. Native Opus via `MediaCodec` (encode + decode)

**What it does**: Android ships `c2.android.opus.encoder` and `c2.android.opus.decoder` as software codecs in AOSP since API 29 (Android 10). Our Kotlin native modules wrap these via React Native's bridge.

**Why native MediaCodec instead of JS libraries**:

| Approach | Why rejected |
|----------|-------------|
| `opusscript` (npm) | Uses WebAssembly (Emscripten-compiled libopus). **Hermes JS engine has no WASM support.** Completely non-functional on React Native. Still in `package.json` as a legacy dep — unused. |
| `@nickvduin/ogg-opus-decoder` | Also WASM-based. Same Hermes problem. |
| `libopus` compiled to JSI/TurboModule | Would work but requires maintaining a C build chain (CMake, NDK) and cross-compiling for ARM. MediaCodec is already on the device — zero binary size cost. |
| FFmpeg via `react-native-ffmpeg` | Adds a 15MB+ binary. CLI-based (spawn process per encode). Latency too high for 60ms real-time frames. |

**Why MediaCodec wins**:
- Zero binary size — already on every Android 10+ device
- Hardware-accelerated path available on some SoCs (not Exynos 850, but Snapdragon has HW Opus)
- Clean Java/Kotlin API via `MediaCodec.createByCodecName()`
- Synchronous `queueInputBuffer` / `dequeueOutputBuffer` — predictable latency

**Exynos 850 quirk**: Samsung's Exynos 850 (Galaxy A22) has `c2.android.opus.encoder` but its `BITRATE_MODE_CBR` flag is silently ignored — the encoder always produces VBR output. We work around this by setting the target bitrate low enough (16kbps) that VBR peaks still fit within the SATCOM budget.

**48kHz decode quirk**: The Opus spec mandates internal processing at 48kHz. Android's decoder outputs 48kHz PCM regardless of the `KEY_SAMPLE_RATE` you set in `MediaFormat`. Our `OpusDecoderModule.kt` downsamples 48→16kHz in native code using a 3-tap averaging filter (every 3 samples → 1 sample). Without this, the WAV header says 16kHz but the data is 48kHz, and expo-av plays it at 1/3 speed.

### 4. `opusscript` (DEAD — do not use)

Still listed in `packages/mobile/package.json` as a dependency from the original Capacitor-era code. **It does not work on React Native** because Hermes lacks WebAssembly support. It should be removed from `package.json` in a future cleanup. All Opus encoding/decoding is done via the native MediaCodec modules described above.

### Library Dependency Summary

```
TX Path:
  react-native-live-audio-stream  →  OpusEncoderModule.kt (MediaCodec)  →  WebSocket

RX Path:
  WebSocket  →  OpusDecoderModule.kt (MediaCodec)  →  WAV file  →  expo-av Sound
```

| Library | Role | Native rebuild required? | Platform |
|---------|------|------------------------|----------|
| `react-native-live-audio-stream` | Mic capture (raw PCM) | Yes (`expo prebuild`) | Android (iOS untested) |
| `expo-av` | Audio playback (WAV files) | No (bundled with Expo) | Android + iOS |
| `OpusEncoderModule.kt` | Opus encode (MediaCodec) | Yes (custom native module) | Android only |
| `OpusDecoderModule.kt` | Opus decode + downsample | Yes (custom native module) | Android only |
| `opusscript` | **UNUSED** — Hermes has no WASM | N/A | N/A |

---

## Bandwidth Budget (22 kbps SATCOM)

Iridium Certus uplink: **22,000 bps**. Every byte counts.

```
Per 60ms frame:
  Opus audio data:          ~120 bytes (16 kbps CBR)
  AES-GCM overhead:          28 bytes (12 IV + 16 tag)
  Base64 expansion:          ~198 bytes (148 raw × 4/3)
  JSON envelope:             ~250 bytes (type, sessionId, chunk, data)
  WebSocket framing:           6 bytes

  Total per frame:           ~256 bytes
  Frames per second:           16.67 (1000 / 60)
  Total bitrate:            ~34 kbps wire

  Actual audio bitrate:      ~16 kbps
```

**This exceeds 22 kbps** at the wire level due to Base64 + JSON overhead. However:

- WebSocket binary frames (planned) would eliminate Base64 expansion → ~24 kbps
- The current JSON/text-based protocol works over cellular and is debuggable
- For Iridium deployment, switching to binary WebSocket frames + MessagePack is the path
- GPS, presence, and control messages share the remaining headroom

### Optimization Knobs (Not Yet Applied)

| Optimization | Savings | Complexity |
|-------------|---------|------------|
| Binary WebSocket frames | ~30% (no Base64) | Low |
| MessagePack instead of JSON | ~20% (smaller envelope) | Medium |
| Lower bitrate (8 kbps) | ~50% audio | Low (quality tradeoff) |
| Codec2 instead of Opus | ~85% audio (700 bps) | High (no MediaCodec, need native lib) |
| Strip `type` field, use opcodes | ~15 bytes/frame | Medium |

---

## Half-Duplex Enforcement

Like a real walkie-talkie, only one direction of audio flows at a time on a device.

- **TX active**: All incoming `PTT_AUDIO` messages are dropped locally. The `_isLocalTx` flag in `comms.js` gates this.
- **TX ends**: Flag clears, audio mode switches from recording to playback (`Audio.setAudioModeAsync`), and any accumulated RX audio flushes.
- **Android audio routing**: After `LiveAudioStream` recording, the Android audio subsystem stays in recording mode. Without explicitly calling `Audio.setAudioModeAsync({ allowsRecordingIOS: false, playThroughEarpieceAndroid: false })`, playback either routes to earpiece (inaudible) or fails silently. This was a major debugging effort.

---

## Loopback Testing Mode

When testing with a single device, the server's `fanOut()` correctly skips the sender. This means you can't hear your own audio in normal operation.

**Loopback mode** (`EXPO_PUBLIC_LOOPBACK=true`) solves this by:

1. Stashing each encrypted TX chunk locally as it's sent
2. On PTT_END, decoding all stashed chunks through the full RX pipeline
3. Playing them back through the speaker

This verifies the complete encode → encrypt → decrypt → decode → playback chain on one device. Disable for multi-device testing (`EXPO_PUBLIC_LOOPBACK=false`).

---

## Encryption

- **Algorithm**: AES-GCM-256 (authenticated encryption)
- **Key**: Hardcoded test key in `Encryption.ts` (MVP — will be replaced by KDF from shared secret)
- **Per-frame overhead**: 28 bytes (12-byte random IV + 16-byte GCM authentication tag)
- **Polyfill**: `setup-crypto.js` provides `globalThis.crypto` for React Native (which lacks Web Crypto API natively). Currently a pass-through shim for MVP.

### Security Limitations

- No key rotation
- No forward secrecy
- Hardcoded key means all devices share the same key
- No certificate pinning on WebSocket connection
- JWT tokens are not refreshed

These are acceptable for hackathon/demo. Production deployment requires proper KDF, per-session keys, and certificate pinning.

---

## Deployment Topology

```
┌──────────────────────────────────────────┐
│  DigitalOcean VPS (134.122.32.45)       │
│                                          │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │ Fastify      │  │ PostgreSQL      │  │
│  │ :3000        │  │ (Prisma ORM)    │  │
│  │              │  │                 │  │
│  │ /auth/login  │  │ users           │  │
│  │ /ws (relay)  │  │ devices         │  │
│  │ /api/*       │  │ talkgroups      │  │
│  └──────────────┘  │ gps_updates     │  │
│                     └─────────────────┘  │
└──────────────────────────────────────────┘
          ▲                    ▲
          │ WebSocket          │ WebSocket
          │                    │
    ┌─────┴─────┐        ┌────┴──────┐
    │ Samsung   │        │ Samsung   │
    │ SM-A225M  │        │ SM-A225M  │
    │ Device A  │        │ Device B  │
    └───────────┘        └───────────┘
```

- Server managed by Shri (backend lead)
- Mobile builds via `npx expo run:android --device` (bare workflow, native Opus modules require full rebuild)
- No CI/CD pipeline yet — manual builds

---

## Known Limitations

| Area | Limitation | Priority |
|------|-----------|----------|
| **Audio quality** | WAV-based playback has ~200ms gap between PTT_END and audio start | Medium |
| **Streaming playback** | Audio only plays after entire transmission completes (no real-time streaming playback) | High for long messages |
| **Binary protocol** | JSON + Base64 over text WebSocket adds ~60% overhead vs binary | High for SATCOM deployment |
| **Encryption key** | Hardcoded AES key, no rotation, no forward secrecy | High for production |
| **iOS** | No iOS support yet (Kotlin modules are Android-only) | Medium |
| **Codec2** | Not implemented; would reduce audio to 700 bps but needs native C library | Future |
| **GPS** | DLS-140 integration exists but untested on real hardware | Low |
| **E2E tests** | 24 Playwright tests for portal; 9 still failing. No mobile tests. | Medium |
| **Device ID** | Random per app launch; not persisted | Low |
| **Reconnection** | WebSocket reconnects up to 5 times with exponential backoff, then gives up | Medium |

---

## File Map (Key Files)

### Mobile App (`packages/mobile/`)

| File | Purpose |
|------|---------|
| `src/config.js` | Environment-based configuration (relay URL, device ID) |
| `src/utils/comms.js` | Singleton comms + RX audio pipeline (decode → WAV → play) |
| `src/utils/socket.js` | PTT signaling bridge between UI and SDK |
| `src/utils/audio.js` | TX pipeline (mic → Opus encode → encrypt → relay) |
| `src/utils/opusDecoder.js` | JS wrapper around native OpusDecoderModule |
| `src/screens/PTTScreen.jsx` | PTT toggle UI with floor control feedback |
| `src/screens/LoginScreen.tsx` | Auth → JWT → connectComms() |
| `src/screens/Channels.jsx` | Channel selection, talkgroup fetch |
| `src/shims/setup-crypto.js` | Web Crypto polyfill for React Native |
| `.env` | Relay URL, DLS-140 URL, loopback toggle |

### Native Modules (`packages/mobile/android/app/src/main/java/com/forbiddenlan/skytalk/`)

| File | Purpose |
|------|---------|
| `OpusEncoderModule.kt` | MediaCodec Opus encoder (16kHz, 16kbps CBR, 60ms) |
| `OpusDecoderModule.kt` | MediaCodec Opus decoder + 48→16kHz downsampling |
| `OpusEncoderPackage.kt` | Registers both modules with React Native bridge |

### Comms SDK (`packages/comms/src/`)

| File | Purpose |
|------|---------|
| `ForbiddenLANComms.ts` | Main class: connect, PTT, floor control, half-duplex |
| `RelaySocket.ts` | WebSocket client with reconnection |
| `FloorControl.ts` | Floor state tracking (server is authority) |
| `AudioPipeline.ts` | TX: sequence Opus chunks over relay |
| `Encryption.ts` | AES-GCM-256 encrypt/decrypt |
| `types.ts` | Shared TypeScript interfaces for all message types |

### Server (`packages/server/src/`)

| File | Purpose |
|------|---------|
| `ws/hub.ts` | WebSocket relay: floor control, fan-out routing, session management |
| `routes/` | REST endpoints (auth, talkgroups, devices, users) |
| `db/client.ts` | Prisma client |
