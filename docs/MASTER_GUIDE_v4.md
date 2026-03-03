# SkyTalk Master Guide v4

**Hackathon:** SKYTRAC 2026 · Feb 28 – Mar 7
**Team:** QWERTY (Carleton) · Saim · Shri · Maisam · Annie
**Repo:** `TheForbiddenLAN`
**Last updated:** 2026-03-02
**Replaces:** v3 — that version had Shri's architecture wrong in several places and focused too heavily on code rather than design

---

## Table of Contents

1. [What We're Building](#1-what-were-building)
2. [Hardware Constraints — What Shapes Every Decision](#2-hardware-constraints)
3. [Architecture](#3-architecture)
4. [Component Overview](#4-component-overview)
5. [Team Roles & Ownership](#5-team-roles--ownership)
6. [Interface Contracts](#6-interface-contracts)
7. [Current State — Honest Snapshot](#7-current-state--honest-snapshot)
8. [Known Gaps & Tradeoffs for the Presentation](#8-known-gaps--tradeoffs)
9. [Quick Reference](#9-quick-reference)

---

## 1. What We're Building

SkyTalk is a push-to-talk satellite communication system for aircrew operating in remote areas. It must feel like a walkie-talkie while running over Iridium Certus — an expensive, slow, high-latency satellite link.

Every architectural decision in this document exists to answer one question: **how do we make that feel like a walkie-talkie given the constraints?**

---

## 2. Hardware Constraints

### The DLS-140

The SKYTRAC DLS-140 is a satellite router. Each aircraft has one. Phones on board connect to it over Wi-Fi on a private `192.168.111.0/24` LAN. The DLS-140 routes outbound traffic over Iridium Certus.

**Critical constraint for architecture:** the DLS-140 is outbound-only. It can open connections to the internet. It cannot accept inbound connections. The Iridium network itself assigns addresses via PPP and sits behind carrier-grade NAT. Even if the DLS-140 exposed a port-forwarding feature (it does not in the current firmware), Iridium's network-level NAT would prevent packets reaching it from the outside.

**This makes peer-to-peer DLS-140 communication impossible.** Unit A cannot dial Unit B directly. Both units can make outbound connections to a server. The server relays.

### Link budget

| Property | Value |
|---|---|
| Uplink | 22 kbps |
| Downlink | 88 kbps |
| One-way latency | 500–1500 ms |
| Satellite handoff | Every ~8 minutes (brief drop) |
| Cost model | Per-byte — overhead matters |

### Local Wi-Fi

Phones on the same aircraft connect to the DLS-140 over standard 802.11 Wi-Fi. This link is fast (tens of Mbps), free, and has <5 ms latency. We exploit this: same-aircraft communication does not need to cross the satellite. On the relay server, fan-out to devices that share a talkgroup means those devices get the audio forwarded — but two phones on the same aircraft both connected to the same relay session still receive audio faster than audio-only over satellite because the relay is on the internet side of the path.

---

## 3. Architecture

### 3.1 The Fundamental Split: Two Types of State

Not all state has equal requirements. Separating them correctly is the insight that makes the architecture work.

**Persistent / security-critical state** — who exists in the system, which users belong to which talkgroups, cryptographic key material, which devices are authorized. This changes rarely. Changes have security implications (new keys must be derived or distributed). This state lives in Postgres on the relay server and is owned by admin.

**Ephemeral / operational state** — who is currently connected, who holds the floor on a given talkgroup right now, in-progress PTT sessions. This changes every few seconds during active use. It has no persistence requirement. This state lives in memory on the relay server (Maps, Sets) and is authoritative only for the current session. It is thrown away on server restart; clients re-establish it on reconnect.

This separation means the hard problem of security-critical distributed consensus is handled by a single authority (the relay server + admin). Sites don't need to coordinate on membership or keys — they receive them from the server.

### 3.2 The Relay Server: What It Actually Does

Because the DLS-140 cannot accept inbound connections, the server is the switchboard. Every phone connects to it outbound via WebSocket. The server fans audio out.

The server has two distinct jobs:

**Job 1: Persistent state and admin API (REST)**
The server is the source of truth for auth, talkgroup membership, device registry, and key material. The web portal (packages/portal) is the admin interface for this data. A user with `role: "admin"` can provision devices, manage talkgroups, trigger key rotations, and enable/disable devices via the portal. This is what Shri's control plane design document calls "admin" — it is implemented as a JWT-authenticated role on the server, with the web portal as the UI.

**Job 2: Real-time relay (WebSocket)**
The server's WebSocket hub maintains a room map: `talkgroup → Set<WebSocket>`. Messages from any client are fanned out to all other clients in the same talkgroup. The server does not decode or transform audio data — it relays raw encrypted blobs. It does maintain in-memory state for presence and session tracking.

The server does not need to be aware of the Iridium network topology, the DLS-140 hardware API, or audio codec details. Those are Saim's concern (packages/comms).

### 3.3 Key Management

**Why keys at all:** Audio is encrypted end-to-end using AES-GCM-256. The relay server moves encrypted blobs only — it cannot decrypt them. This is important for satellite links where bandwidth is expensive and also provides confidentiality even if the relay is compromised.

**Key derivation:** Rather than distributing raw keys over satellite (expensive, insecure), we distribute small inputs to a Key Derivation Function:

```
group_key = KDF(master_secret, talkgroup_id, rotation_counter)
```

The `master_secret` and `rotation_counter` are stored in Postgres per talkgroup. After login, a client fetches them via the `/keys/rotation` REST endpoint over TLS and derives the key locally. Key material never travels as plaintext after the TLS session — and the KDF output (the actual AES key) never leaves the device.

**Routine rotation:** Admin increments `rotation_counter` via `POST /keys/rotate`. All active clients fetch the new counter on their next sync. They compute a new group key locally. No raw key material crosses any network boundary — just a small integer.

**Revocation:** If a device needs to be revoked (stolen, compromised), admin sets `active = false` on the device and rotates the key. The revoked device's JWT expires (short-lived), it cannot re-authenticate, and it cannot derive the new group key because it cannot fetch the new counter without a valid JWT. This is the mechanism v1 uses.

The full distributed tree key structure (root key, site keys, device keys, O(sites) revocation cost) from Shri's control plane design document represents the target architecture for a production system. For v1, we implement the simpler version above: JWT-gated key fetch + KDF. The design principles are the same; the distribution mechanism is simplified.

### 3.4 Floor Control

PTT is half-duplex: one speaker per talkgroup at a time. The architectural challenge is arbitration without adding round-trip latency.

**Why we cannot do server grant/deny:** At 500–1500 ms satellite latency, a server-grant round trip means 1–3 seconds before the user hears "you have the floor." Walkie-talkies don't work that way. Fleet radios don't work that way. We don't either.

**What we do instead — optimistic transmission:**

1. User presses PTT. The phone **immediately** begins capturing and transmitting audio.
2. The `PTT_START` message carries a GPS timestamp (from the DLS-140's GNSS receiver) and the device UUID.
3. The relay server fans out `PTT_START` to all talkgroup members.
4. Each receiver independently applies a deterministic algorithm to decide who has the floor:
   - If only one `PTT_START` arrived: that sender has the floor.
   - If two `PTT_START` messages arrive within a 50 ms window (collision): the one with the **lower GPS timestamp** wins. Tiebreaker: lexicographically smaller device UUID.
5. The losing device's UI shows "floor taken by [winner]". It stops transmitting.

This algorithm is **deterministic and stateless** — every receiver reaches the same conclusion independently, no coordination needed. The server relays but does not arbitrate.

**Why GPS timestamps:** The DLS-140 has GNSS built in. GPS time is nanosecond-accurate and globally synchronized. Clock skew between sites is negligible compared to satellite latency. There is no need for a separate `SYNC_TIME` mechanism at the hardware level, though a software offset correction is still useful for devices not yet connected to GPS.

**Accepted tradeoff:** We don't prevent collisions, we handle them. There is a brief window where two senders are transmitting simultaneously before the loser learns they lost. This wastes a small amount of satellite bandwidth. The benefit is instant PTT response. This matches how real radio systems (TETRA, DMR) handle walk-ons.

### 3.5 Physical Data Path

```
[Phone]
  │ 802.11 Wi-Fi (fast, free)
  ▼
[DLS-140 192.168.111.1]
  │ Iridium Certus PPP (22 kbps up / 88 kbps down, 500-1500ms)
  ▼
[Iridium Ground Station – Tempe, AZ]
  │ SKYTRAC Toronto DC
  ▼
[Internet]
  │
  ▼
[DigitalOcean Droplet — relay server]
  │ WebSocket fan-out
  ├──► [Internet] → [Iridium] → [DLS-140] → [Phone B, same talkgroup]
  └──► [Internet] → [Iridium] → [DLS-140] → [Phone C, same talkgroup]
```

There is no direct path between two DLS-140 units. All traffic transits the relay. This is not a design choice — it is a hardware and network constraint.

### 3.6 Transport Decision: WebSocket vs UDP

**For v1 (MVP):** All traffic — audio and control — goes over WebSocket. This is reliable, straightforward to implement, and gets us to a working demo.

**The known problem:** WebSocket is TCP-based. TCP provides guaranteed ordered delivery, but it does so by retransmitting lost packets and stalling the receiver until they arrive. At 1500 ms satellite latency, one lost voice packet causes ~3 seconds of frozen audio. This will happen on Iridium.

**Mitigation for v1:** A jitter buffer (50–200 ms) on the receive side queues incoming audio and plays it at a steady rate, decoupling playback from network jitter. This does not fix TCP head-of-line blocking but makes the experience more predictable.

**The correct long-term answer (Phase 2):** Move PTT audio to UDP. Control messages (PTT_START, FLOOR_GRANT, PRESENCE, TEXT_MSG) stay on WebSocket — they are small, infrequent, and must be reliable. Audio goes on a UDP socket with RTP framing. A lost voice packet causes a brief click, not a stall. This is how TETRA, ISSI, and every professional PTT system works.

| Layer | v1 (WebSocket MVP) | v2 roadmap (UDP hybrid) |
|---|---|---|
| Control messages | WebSocket | WebSocket |
| PTT audio chunks | WebSocket | UDP/RTP |

---

## 4. Component Overview

```
packages/
├── server/         (Shri)
│   Fastify + Prisma + Postgres
│   - REST API: auth, talkgroups, devices, keys
│   - WebSocket hub: relay, presence, session tracking
│   - Postgres: persistent auth/membership state
│   - Docker Compose: Postgres 16 + server
│   - DigitalOcean deployment + nginx
│
├── comms/          (Saim)   @forbiddenlan/comms
│   Shared library consumed by mobile
│   - ForbiddenLANComms: main public API
│   - RelaySocket: WebSocket client → Shri's server
│   - MockRelaySocket: local loopback for development
│   - AudioPipeline: stateful audio buffer
│   - Encryption: AES-GCM-256 using derived key
│   - FloorControl: client-side timestamp arbitration
│   - GPSPoller: polls DLS-140 local REST API for GPS
│   - DLS140Client: HTTP wrapper for DLS-140 endpoints
│
├── mobile/         (Maisam + Annie)
│   React Native + Expo SDK 54
│   Phone app: PTT button, talkgroup list, moving map,
│   signal display, text messages
│   Consumes: @forbiddenlan/comms, Shri's REST API
│
└── portal/         (Maisam + Annie)
    Vite + React — admin web portal
    Device management, talkgroup management, user management
    Consumes: Shri's REST API with role:admin JWT
```

**Dependency direction:** mobile and portal depend on server and comms. Comms depends on the server's WebSocket contract. Server depends on nothing else in the monorepo.

---

## 5. Team Roles & Ownership

### Shri — `packages/server`

Owns the relay server and all infrastructure on the DigitalOcean droplet.

**Delivers to the team:**
- A running server URL (HTTP + WS)
- Confirmed JWT shape: `{ sub: userId, username, role, iat, exp }`
- WebSocket endpoint: `ws://<host>/ws?token=<jwt>`
- All REST endpoints per the contract in §6

**What the server does:**
- Issues and validates JWTs (auth)
- Stores persistent state: users, devices, talkgroups, memberships, key rotation counters, GPS history
- WebSocket hub: maintains `talkgroup → Set<socket>` room map, fans out messages between connected clients
- Tracks ephemeral presence (in-memory, lost on restart)
- Stores GPS updates received over WebSocket to the `gps_updates` table

**What the server does NOT do:**
- Does not talk to the DLS-140 hardware. That is Saim's job.
- Does not decode or process audio. It moves encrypted blobs.
- Does not make floor control decisions. It fans out PTT_START and clients arbitrate.
- Does not generate or distribute actual AES key material. It stores `master_secret` + `rotation_counter`; clients derive keys via KDF.

---

### Saim — `packages/comms`

Owns the communication library: the invisible plumbing between phones and the relay.

**Delivers to the team:**
- A clean API for mobile to call (see below)
- Correct WebSocket message types matching §6
- Working DLS-140 hardware integration (GPS, signal status, routing preference)

**Public API delivered to Maisam & Annie:**

```typescript
connect(jwt: string): Promise<void>
startPTT(talkgroupId: string): void
stopPTT(): void
sendText(talkgroupId: string, text: string): void
onAudioReceived(cb: (audio: AudioBuffer) => void): void
onFloorStatus(cb: (status: FloorStatus) => void): void
getSignalStatus(): SignalStatus
getGPS(): GPS | null
```

**Key design note:** `FloorControl.ts` implements the client-side timestamp arbitration algorithm. This runs on every `PTT_START` received — the client decides locally who holds the floor. The relay server does not send FLOOR_GRANT or FLOOR_DENY in v1.

---

### Maisam & Annie — `packages/mobile` + `packages/portal`

Own everything users see.

**Mobile:** PTT button, channel list, signal bars, moving map, text panel. Calls into `@forbiddenlan/comms` for all communication.

**Portal:** Web admin UI. Manages devices (enable/disable), talkgroups (create/delete), users, and key rotation. Uses Shri's REST API with an admin JWT.

---

## 6. Interface Contracts

_These are the unchanging agreements between packages. Do not change these without coordinating with the relevant owners._

### 6.1 WebSocket Protocol

**Connect:** `ws://<host>/ws?token=<jwt>`

All messages are JSON. Clients join a session by connecting; talkgroup subscription is managed per-message.

```
Client → Server
{ "type": "JOIN_TALKGROUP",  "talkgroup": "tg-uuid" }
{ "type": "LEAVE_TALKGROUP", "talkgroup": "tg-uuid" }
{ "type": "PTT_START",  "talkgroup": "tg-uuid", "sender": "device-uuid", "timestamp": 1234567890123, "seq": 42 }
{ "type": "PTT_AUDIO",  "talkgroup": "tg-uuid", "sessionId": 12345, "seq": 42, "chunk": 1, "data": "<base64-opus>" }
{ "type": "PTT_END",    "talkgroup": "tg-uuid", "sender": "device-uuid", "seq": 42 }
{ "type": "TEXT_MSG",   "talkgroup": "tg-uuid", "sender": "device-uuid", "text": "Landing in 5" }
{ "type": "GPS_UPDATE", "device": "device-uuid", "lat": 49.28, "lng": -123.12, "alt": 200.0 }

Server → Client (fan-out)
Same message types, fanned out to all talkgroup members
+ { "type": "PRESENCE", "talkgroup": "tg-uuid", "online": ["uuid1", "uuid2"] }
  (broadcast on connect and disconnect)
```

**Notes on PTT_AUDIO:**
`sessionId` is a 4-byte integer, not the full device UUID. This saves ~30 bytes per chunk — significant at 22 kbps. The server maps session IDs to users internally when needed. A `sessionId` is generated fresh on each `PTT_START`.

**Floor control behavior:**
The server fans out `PTT_START` without modifying it. Each receiver runs `FloorControl.ts` locally — lower GPS timestamp wins, UUID tiebreaker within 50 ms collision window. `FLOOR_GRANT` / `FLOOR_DENY` are not sent by the server in v1. The server does not enforce floor state on `PTT_AUDIO` routing in v1 either.

### 6.2 REST API

All protected routes require `Authorization: Bearer <jwt>`. Admin routes additionally require `role === "admin"` in the JWT claims.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /ping | None | Health check |
| POST | /auth/register | None | Register user. Body: `{ username, password, deviceSerial?, site? }`. Returns `{ jwt, userId }` |
| POST | /auth/login | None | Login. Body: `{ username, password }`. Returns `{ jwt }` |
| POST | /auth/changepassword | JWT | Body: `{ oldPassword?, newPassword }` |
| GET | /talkgroups | JWT | List talkgroups the authenticated user belongs to |
| POST | /talkgroups | JWT+Admin | Create talkgroup. Body: `{ name }` |
| POST | /talkgroups/:id/join | JWT | Join a talkgroup |
| DELETE | /talkgroups/:id/leave | JWT | Leave a talkgroup |
| GET | /talkgroups/:id/members | JWT | List members of a talkgroup |
| DELETE | /talkgroups/:id | JWT+Admin | Delete talkgroup |
| GET | /devices | JWT+Admin | List all registered devices |
| PATCH | /devices/:id/status | JWT+Admin | Body: `{ active: bool }` |
| GET | /devices/:id/gps | JWT | Last known GPS for a device |
| POST | /devices/:id/gps | JWT | Store a GPS update |
| GET | /users | JWT+Admin | List users (no password hashes) |
| GET | /keys/rotation | JWT | Get `{ talkgroupId, counter }` for key derivation |
| POST | /keys/rotate | JWT+Admin | Increment rotation counter. Body: `{ talkgroupId }` |

### 6.3 DLS-140 Local REST (Saim → hardware)

These are calls to the DLS-140 on the local LAN at `http://192.168.111.1`. This is Saim's interface to the hardware; it is not the SkyTalk API.

```
POST /auth/login                    → { jwt }
GET  /device/status                 → { certusSignalStrength, certusDataBars, cellularSignalStrength }
GET  /device/data-usage?period=24h  → { bytesUsed }
GET  /location/gps                  → { lat, lng, alt, mode }
GET  /network/routing               → { preference: 'cellular' | 'satellite' }
PUT  /network/routing               → body: { preference }
PUT  /network/firewall              → body: { profile: 'unrestricted' }
POST /diagnostics/ping              → { latencyMs }
```

---

## 7. Current State — Honest Snapshot

> What the code actually does right now, not what the docs say should happen.

### What works in mock mode

- PTT button triggers audio recording via `expo-av` (m4a/AAC ~12 kbps — not Opus, acceptable for demo)
- Audio is encrypted with AES-GCM (hardcoded test key), sent via `MockRelaySocket`, echoed back after 50 ms — single-device loopback
- Server: `POST /auth/register`, `POST /auth/login`, `POST /auth/changepassword` work via Prisma
- Docker Compose spins up Postgres 16 + server correctly
- Prisma schema is correct — all 6 tables present

### What is broken in real mode

| # | Owner | Problem |
|---|---|---|
| C1 | Shri | Non-auth routes (`talkgroups.ts`, `devices.ts`, `keys.ts`, `ws/hub.ts`) import a stub `supabase = {} as any` and crash at runtime. Must be replaced with Prisma. |
| C2 | Saim | `RelaySocket.ts` uses Node.js `ws` API (`.on()`). React Native shims `ws` to browser `WebSocket` which uses `.addEventListener()`. Crashes on real connection. |
| C3 | Maisam/Annie | `Channels.jsx` calls `socket.emit('list-channels')` — `socket` is `null` in real mode. Replace with `GET /talkgroups` REST call. |
| C4 | Shri | Portal `GET /users` returns 404 — route not implemented. |
| H4 | Shri | WebSocket hub fan-out includes the sender socket. Self-echo. |
| H3 | Shri | No `PRESENCE` broadcast on connect/disconnect. |

### Component status summary

| Component | Status |
|---|---|
| Server auth routes | Working |
| Server talkgroup/device/key routes | Broken (C1) |
| Server WebSocket hub (fan-out) | Working with bugs (C1, H4, H3) |
| Server Prisma schema + Docker | Working |
| Comms MockRelaySocket | Working |
| Comms RelaySocket | Logic correct, crashes on RN (C2) |
| Comms AudioPipeline, Encryption, FloorControl | Working |
| Comms DLS140Client, GPSPoller | Working |
| Mobile mock PTT loop | Working |
| Mobile real mode | Blocked (C2, C3) |
| Portal pages render | Working |
| Portal data loads | Blocked (C1, C4) |

---

## 8. Known Gaps & Tradeoffs

Present these proactively. Judges expect realistic assessments.

### Architecture decisions

| Decision | Choice | Reason |
|---|---|---|
| Relay vs P2P | Central relay | DLS-140 is outbound-only; direct unit-to-unit impossible |
| Floor control | Optimistic client-side | Server round-trip at 500–1500ms latency would add 1–3s before you can speak |
| Audio transport | WebSocket (v1) → UDP (v2) | WebSocket ships faster; TCP head-of-line blocking is a known problem addressed in roadmap |
| Key distribution | KDF with server-stored counter | Key material never crosses the network as plaintext; cheap rotations |
| Auth | JWT (short-lived) | Standard, stateless, works over satellite |
| Database | Postgres + Prisma | Direct control, no vendor lock-in, runs in Docker on the same droplet |
| In-memory ephemeral state | Node Maps/Sets (no Redis) | Sufficient for v1; sessions are re-established on reconnect |
| Admin interface | Web portal + role:admin JWT | Practical for hackathon; maps onto the admin authority concept from the control plane design |

### Known gaps

| Gap | Impact | Mitigation |
|---|---|---|
| Audio is whole-file-per-press, not 200ms chunks | No audio heard until PTT release | Acceptable for demo; streaming needs native audio lib (EAS Build) |
| Hardcoded AES key | Keys not actually rotated | KDF infrastructure is built; wire it to `/keys/rotation` endpoint post-auth |
| No jitter buffer | Audio may stutter over satellite | Add 50–200ms buffer on receive side before real satellite test |
| WebSocket TCP blocking | Frozen audio on packet loss | Phase 2: UDP/RTP for audio |
| Timestamp spoofing (floor control) | Bad actor can always win floor | Operational mitigation: admin disables via portal. cryptographic fix is v2 |
| Admin single point of failure | Can't manage keys/memberships if relay is down | Local PTT still works; admin redundancy is v2 |
| storeForward.ts not wired | Audio lost during satellite handoff | Implemented, not wired into hub; 30-second buffer for v2 |
| floorControl.ts not wired in hub | Server doesn't enforce floor in v1 | Clients implement it correctly; v2 add server enforcement for PTT_AUDIO drops |

### Bandwidth budget

```
Opus at 8 kbps (20ms frames):
  Audio payload:       1000 B/s
  RTP/encryption:       495 B/s  (28B AES-GCM tag + 12B RTP header per 20ms frame)
  WebSocket framing:    100 B/s
  Total:              ~1595 B/s = ~12.8 kbps
  Uplink headroom:    22 - 12.8 = 9.2 kbps ✓

With UDP/RTP (Phase 2):
  Remove WebSocket+TCP overhead: ~400 B/s saved
  Total:              ~9.5 kbps = 7.6 kbps headroom — more margin for GPS and control ✓
```

---

## 9. Quick Reference

### Env vars (mobile)

| Var | Default | What it controls |
|---|---|---|
| `EXPO_PUBLIC_MOCK_MODE` | `true` | `true` = MockRelaySocket loopback; `false` = real server |
| `EXPO_PUBLIC_WS_URL` | `ws://localhost:9999` | Shri's WebSocket endpoint |
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000` | Shri's REST endpoint |
| `EXPO_PUBLIC_DLS140_URL` | `http://192.168.111.1:3000` | DLS-140 local REST |
| `EXPO_PUBLIC_TALKGROUP` | `alpha` | Default talkgroup at connect |
| `EXPO_PUBLIC_DEVICE_ID` | random per launch | Set explicitly for consistent floor arbitration |

### JWT shape

```json
{ "sub": "<userId>", "username": "<username>", "role": "admin|user", "iat": 0, "exp": 0 }
```

### Monorepo structure

```
TheForbiddenLAN/
├── packages/
│   ├── comms/     @forbiddenlan/comms   (Saim)
│   ├── mobile/    React Native Expo 54  (Maisam + Annie)
│   ├── portal/    Vite + React          (Maisam + Annie)
│   └── server/    Fastify + Prisma      (Shri)
├── docs/
└── gradle-dist/
```

### Priority fix order

These are the blockers. Nothing real-mode works until they are done:

1. **C1** (Shri) — Replace `supabase` stub with Prisma in all non-auth routes
2. **C2** (Saim) — Replace `.on()` with `.addEventListener()` in `RelaySocket.ts`
3. **C4** (Shri) — Add `GET /users` route
4. **H4** (Shri) — Skip sender socket in hub fan-out loop
5. **C3** (Maisam/Annie) — Replace `socket.emit('list-channels')` with `GET /talkgroups` REST call
6. **H3** (Shri) — Add PRESENCE broadcast on connect/disconnect
7. **M6** (Maisam/Annie) — Wire `LoginScreen.tsx` as initial route, call `connectComms(jwt)` on success
