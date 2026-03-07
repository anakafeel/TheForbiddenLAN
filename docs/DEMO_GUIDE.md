# SkyTalk — Demo Day Guide
**Team TheForbiddenLAN | Skytrac Hackathon 2026 | March 7, 2026**

---

## What Is It?

A push-to-talk walkie-talkie app for field teams whose only uplink is an **Iridium Certus satellite modem** — 22 kbps up, 800–1,500 ms latency. Every design decision was made around that constraint.

---

## The Problem

Standard PTT apps assume 4G. On satellite they fail because:

- **TCP retransmits freeze audio.** One dropped packet on a 1,000ms RTT link stalls everything for 2–3 seconds — sounds like voicemail, not a walkie-talkie.
- **Codecs waste bandwidth.** 64 kbps AAC blows the entire uplink in one shot.
- **No floor control = chaos.** Two people transmitting at once corrupt each other's audio.
- **Satellite NAT blocks inbound TCP.** You can't receive connections — everything must go outbound.

---

## The Solution

### Hardware
The **SKYTRAC DLS-140** is a satellite router. It creates a local Wi-Fi hotspot — phones connect like normal Wi-Fi, but traffic exits through Iridium. It also exposes a REST API for GPS, signal bars, and link status.

### Transport: UDP for audio, WebSocket for control
Audio goes over **UDP** — a dropped frame is a brief click, not a freeze. Control messages go over **WebSocket (TCP)** because they must arrive.

| Message | Transport |
|---|---|
| `PTT_AUDIO` frames | UDP |
| `PTT_START` / `PTT_END` | WebSocket |
| `JOIN_TALKGROUP`, `FLOOR_GRANT/DENY` | WebSocket |
| `GPS_UPDATE`, `TEXT_MSG` | WebSocket |
| `UDP_REGISTER` (keep-alive) | UDP every 25s |

### Codec: Opus at 6 kbps, 60ms frames
Full bandwidth stack per frame:

| Layer | Wire size | kbps |
|---|---|---|
| Opus audio | 42 B | 5.6 |
| + AES-GCM (12B IV + 16B tag) | 70 B | 9.3 |
| + Base64 | ~93 B | 12.4 |
| + JSON fields | **~159 B** | **21.2** |

21.2 kbps of a 22 kbps budget. **800 bps headroom** for GPS and control.

- **6 kbps** — Opus sounds fine at 6 kbps; 8 kbps would blow the budget
- **60ms frames** — max Opus frame size, 3× fewer packets than 20ms frames
- **CBR** — constant bitrate, no surprises on a metered satellite link

### Floor Control (no walk-ons)
1. Press PTT → `PTT_START` with synced timestamp over WebSocket
2. Server checks floor map → `FLOOR_GRANT` (you win) or `FLOOR_DENY` (busy)
3. Server validates every audio UDP packet against the current floor holder — others are dropped
4. Release PTT → `PTT_END` → `FLOOR_RELEASED` broadcast to talkgroup
5. **Collision window:** two presses within 50ms → lowest timestamp wins, UUID as tiebreaker
6. **Watchdog:** floor auto-releases after 65s (client stops at 60s). Hot mic on satellite costs money.
7. **SYNC_TIME:** NTP-style clock sync on connect so all timestamps are comparable

### Server
Fastify + WebSocket + UDP on DigitalOcean (`134.122.32.45:3000`). Deliberately dumb — authenticate once via JWT, then pure fan-out by talkgroup. No audio buffering. Missed audio during dropout is gone (walkie-talkie behavior).

Key server maps:
- `rooms` — talkgroup → set of WebSockets
- `udpClients` — userId → UDP address/port
- `talkgroupFloor` — talkgroup → who holds the floor
- `sessionTalkgroup` — 4-byte sessionId → talkgroup (saves 32 bytes per audio packet)

### Mobile App
React Native 0.81.5 + Expo SDK 54 (bare workflow, New Architecture). Android only — iOS requires macOS.

Screens: **Login** → **Channels** → **PTTScreen** (orbital animation, signal telemetry, PTT button) → **Dashboard**

### Admin Portal
Next.js. Manage talkgroups, devices, users. Live WebGL satellite globe with GPS positions.

---

## TX Path (you transmit)

```
Hold PTT
  → startPTT() — floor request over WebSocket
  → AudioRecord (16kHz mono 16-bit PCM, 960 samples = 60ms)
  → MediaCodec Opus encode (6 kbps CBR)
  → AES-GCM-256 encrypt (fresh 12-byte IV per chunk)
  → Buffer 4 chunks → XOR parity → send 5 packets (FEC group)
  → UDP → server:3000
```

**Half-duplex:** while transmitting, all incoming `PTT_AUDIO` is silently dropped (can't saturate 22 kbps with both directions).

**SATCOM gate:** in SATCOM mode, audio is held until `FLOOR_GRANT` arrives (~800ms). In cellular mode, sent immediately.

## RX Path (someone else transmits)

```
UDP datagram arrives
  → Server validates sender holds floor → fan-out (skips sender)
  → Your phone: UdpSocket receives packet
  → Half-duplex check (if you're transmitting, drop it)
  → Base64 decode → AES-GCM decrypt
  → MediaCodec Opus decode → 48kHz PCM
  → AudioTrack.write() → speaker
```

Server sends every audio packet **twice** — UDP + WebSocket. Client deduplicates by `sessionId + chunk`. WebSocket is the fallback if UDP is blocked.

---

## Bugs We Fixed

| Bug | Root Cause | Fix |
|---|---|---|
| "Voicemail" audio on satellite | TCP retransmit stalls on 1,000ms RTT | Moved `PTT_AUDIO` to UDP |
| Heard own audio during TX | Fan-out included sender | Added sender exclusion in hub.ts |
| Satellite link saturated | Receiving audio while transmitting | Half-duplex flag drops incoming `PTT_AUDIO` while mic is open |
| Chipmunk audio on some devices | Opus decoder outputs 48kHz; AudioTrack set to 16kHz | AudioTrack sample rate → 48kHz |
| Gradle C++ build crash | Stale `.cxx` CMake cache missing `react_codegen_rnsvg` | Delete `.cxx/`, added auto-detection to `run-android.sh` |
| Second phone connection refused | Android 9+ blocks cleartext HTTP | `android:usesCleartextTraffic="true"` in manifest |
| White screen on install | `cobe` (WebGL) bundled for Android | Created `SatelliteGlobe.native.tsx` stub; Metro picks `.native.tsx` on Android |
| Logged out on app restart | JWT in Zustand memory only | `expo-secure-store` → Android Keystore |
| No audio after reconnect | Reconnect didn't re-send `JOIN_TALKGROUP` | Auto-rejoin on WebSocket `connect` event |
| Login timeout on SATCOM | 60s fetch timeout too short | Increased to 90s |

---

## What's Not Done

- **FEC reconstruction** — parity packets sent but receiver doesn't reconstruct missing chunks
- **Real group key** — AES key is a hardcoded stub; KDF from talkgroup secret not wired
- **Transport auto-switch** — `AudioPipeline.useUdp` is always `true` regardless of link type

---

## Demo Script (~5 min)

1. **Login** — two phones, different credentials
2. **Join talkgroup** — both join "Alpha", orbital animation updates
3. **PTT** — Phone A transmits, Phone B hears it. B tries to interrupt → busy tone. A releases, B transmits.
4. **Signal telemetry** — satellite count, signal bars, active link (from DLS-140 REST API)
5. **Admin portal** — talkgroup management, globe map, device activation

**Key talking points:**
- "This ran over real Iridium Certus — not simulated"
- "800 bps headroom on a 22 kbps link — we calculated every byte"
- "We hit the voicemail problem in our first satellite test and redesigned the transport from scratch"
- "Floor control is server-authoritative — no client-side races"

---

## Stack

| | |
|---|---|
| Mobile | React Native 0.81.5 + Expo SDK 54 (bare) |
| Audio | Android MediaCodec Opus + C++ libopus FEC via JNI |
| Crypto | AES-GCM-256 (Web Crypto API) |
| Transport | WebSocket + UDP |
| Server | Fastify 5 + Prisma + PostgreSQL |
| Portal | Next.js |
| Build | Kotlin 2.1.20, NDK 27.1, CMake 3.22 |
| Monorepo | pnpm + Nx |
