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
7. [Bandwidth Budget (22 kbps SATCOM)](#bandwidth-budget-22-kbps-satcom)
8. [Half-Duplex Enforcement](#half-duplex-enforcement)
9. [Loopback Testing Mode](#loopback-testing-mode)
10. [Encryption](#encryption)
11. [Deployment Topology](#deployment-topology)
12. [Known Limitations](#known-limitations)
13. [File Map (Key Files)](#file-map-key-files)

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
