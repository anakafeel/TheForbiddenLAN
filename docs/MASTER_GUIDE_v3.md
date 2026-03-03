# SkyTalk Master Guide v3

**Hackathon:** SKYTRAC 2026 · Feb 28 – Mar 7  
**Team:** QWERTY (Carleton) · Saim · Shri · Maisam · Annie  
**Repo:** `TheForbiddenLAN` · branch `anakafeel/chore/expo-migration`  
**Last updated:** 2026-03-02  
**Status:** MVP WebSocket prototype in progress → UDP hybrid planned

---

## Table of Contents

1. [What We're Building](#1-what-were-building)
2. [Current State — Honest Snapshot](#2-current-state--honest-snapshot)
3. [The Transport Decision: WebSocket vs UDP](#3-the-transport-decision-websocket-vs-udp)
4. [Architecture](#4-architecture)
5. [Team Roles & Contracts](#5-team-roles--contracts)
6. [Critical Bugs — Fix These First](#6-critical-bugs--fix-these-first)
7. [What's Actually Done](#7-whats-actually-done)
8. [What Each Person Needs From the Others](#8-what-each-person-needs-from-the-others)
9. [Interface Contracts](#9-interface-contracts)
10. [Fix Order & Sprint Plan](#10-fix-order--sprint-plan)
11. [Fumadocs Docs Site Plan](#11-fumadocs-docs-site-plan)
12. [Known Gaps & Tradeoffs for Presentation](#12-known-gaps--tradeoffs-for-presentation)

---

## 1. What We're Building

SkyTalk is a Push-to-Talk satellite communication system for aircrew in remote areas. It must feel like a walkie-talkie while running over an Iridium Certus satellite link.

**Hardware constraints that drive every decision:**
- 22 kbps uplink / 88 kbps downlink
- 500–1500 ms one-way latency
- New satellite handoff every ~8 minutes (brief drops)
- Two DLS-140 routers on separate LANs that cannot reach each other directly (NAT)

**Scoring:**

| Category | Weight |
|---|---|
| Technical Functionality | 40% |
| User Experience | 30% |
| Architecture & Scalability | 15% |
| Presentation & Documentation | 15% |
| Innovation Bonus | +15% |

---

## 2. Current State — Honest Snapshot

> This is what the code actually does right now, not what the docs say.

### What works today (mock mode only)

- PTT button in PTTScreen triggers audio recording via `expo-av` (m4a/AAC ~12 kbps)
- Audio is encrypted with AES-GCM (hardcoded test key), sent as a single chunk via `MockRelaySocket`
- `MockRelaySocket` echoes the chunk back after 50ms — single device loopback
- `ForbiddenLANComms` package builds and exports correctly
- Server: `POST /auth/register`, `POST /auth/login`, `POST /auth/changepassword` all work via Prisma
- Docker Compose spins up Postgres + server correctly

### What is broken in real mode

| # | Severity | Where | What breaks |
|---|---|---|---|
| C1 | **CRITICAL** | `server/src/db/supabase.ts` | `supabase = {} as any` — every route except auth throws `TypeError: supabase.from is not a function` at runtime |
| C2 | **CRITICAL** | `comms/src/RelaySocket.ts` | Uses `.on('message', ...)` — Node.js `ws` API. React Native shims `ws` to browser `WebSocket` which only has `.addEventListener()`. Crashes on real connection. |
| C3 | **CRITICAL** | `mobile/src/screens/Channels.jsx:100` | `socket.emit('list-channels')` — `socket` export is `null` in real mode. Crash. |
| C4 | **CRITICAL** | `packages/portal` | Portal `GET /users` returns 404 — route not implemented on server |

---

## 3. The Transport Decision: WebSocket vs UDP

This is an active architectural decision. Here's what you need to know to make the call and explain it to judges.

### How they differ

**WebSocket (TCP-based):**  
Creates a persistent, reliable pipe. Every packet is guaranteed to arrive in order. If one packet is lost, TCP stops everything and waits 1–3 RTTs before continuing.

**UDP:**  
Fire-and-forget. No handshake, no retransmit. 8-byte header vs 20–60 bytes for TCP. Packets can be lost or arrive out of order — the application handles it.

### Why this matters on our link

At 1500ms satellite latency with 22 kbps uplink:

- **WebSocket problem:** One lost voice packet causes a 1.5s stall (waiting for retransmit request) + 1.5s to receive the retransmit = **3 seconds of frozen audio** from a single dropped packet. Over Iridium this will happen constantly.
- **WebSocket header waste:** For 60ms Opus frames, TCP+WebSocket framing adds 40–74 bytes of overhead per packet. On 22 kbps that's ~30% of your entire uplink spent on packaging, not voice.
- **UDP on a lost packet:** Receiver hears a brief click or millisecond of silence, audio keeps playing. This is how Discord, Zoom, and real PTT radios work.

### The recommended hybrid approach

This is the architecture that wins judges' "Technical Architecture" marks:

```
Control Layer  →  WebSocket / HTTPS
  Login, join talkgroup, presence, floor control signals
  Reason: small, infrequent, must be 100% reliable

Audio Layer  →  UDP (RTP)
  Raw Opus/Codec2 voice chunks
  Reason: real-time, latency-critical, loss-tolerant
```

### Plan for this hackathon

**Phase 1 (MVP — get it working):** Full WebSocket. All PTT audio over WebSocket. This is what the codebase is right now. Ship this as the demo baseline.

**Phase 2 (UDP upgrade — if time allows):** Replace audio fan-out in `hub.ts` + `RelaySocket.ts` with a UDP socket. Use RTP packet format. Mobile uses `react-native-udp` for sending/receiving voice chunks. WebSocket stays for all control messages.

**If you only have time for Phase 1:** Add a jitter buffer (50–200ms) on the receive side. Without it, WebSocket at 1500ms latency will stutter badly on satellite. A jitter buffer queues incoming chunks and plays them at a steady rate, hiding the network variance.

### What to tell judges

> "We built the control layer on WebSocket because reliability is non-negotiable for talkgroup management. For the audio layer, we identified that TCP's head-of-line blocking is catastrophic at 1500ms satellite latency — a single dropped packet causes 3 seconds of frozen audio. Our roadmap moves voice packets to UDP/RTP, matching how professional PTT systems like TETRA and ISSI handle this exact problem. For the hackathon demo we include a jitter buffer to compensate for the WebSocket transport."

---

## 4. Architecture

### Physical data path

```
Phone → WiFi → DLS-140 → Iridium → Ground Station (Tempe AZ)
      → SKYTRAC Toronto DC → Internet → DigitalOcean

DigitalOcean → Internet → SKYTRAC Toronto DC
             → Ground Station → Satellite → DLS-140 → WiFi → Phone
```

### Three-layer model

| Layer | What it does | Owner |
|---|---|---|
| Device (DLS-140) | Local REST API: GPS, signal strength, data usage, routing preference | Saim reads it |
| Transport (DigitalOcean) | WebSocket relay hub, fan-out by talkgroup, auth validation | Shri |
| Application (Mobile + Portal) | PTT UI, floor control, key management, auth | Maisam + Annie |

### Why there must be a relay server

The Iridium NAT prevents direct DLS-140 to DLS-140 communication. Each unit can only make outbound connections. DigitalOcean is the switchboard both units connect to.

### Current actual architecture (what the code does)

```
packages/mobile (Expo SDK 54, React Native)
│
├── App.jsx
│   ├── ChannelContext (current channel — simple state)
│   ├── Channels.jsx  (hardcoded MOCK_CHANNELS, inline PTT TODO)
│   └── PTTScreen.jsx (PTT button → audio.js → comms.js → ForbiddenLANComms)
│
├── utils/comms.js    → ForbiddenLANComms (MockRelaySocket loopback)
├── utils/audio.js    → expo-av m4a/AAC recording → base64
├── config.js         → EXPO_PUBLIC_* env vars, MOCK_MODE=true default
└── store/index.ts    → Zustand store (defined but unused by any component)
          │
          │ WebSocket (real mode — BROKEN: .on() bug C2)
          ▼
packages/server (Fastify, Prisma + Postgres)
│
├── POST /auth/*                  ← Prisma ✅ works
├── GET|POST /talkgroups          ← supabase stub ❌ broken
├── GET|PATCH /devices            ← supabase stub ❌ broken
├── GET|POST /keys                ← supabase stub ❌ broken
├── GET /users                    ← MISSING ❌ 404
│
├── ws/hub.ts
│   ├── JWT auth via ?token=      ✅
│   ├── Fan-out by talkgroup      ✅ (but sends to sender too — bug H4)
│   ├── GPS_UPDATE → supabase     ❌ silently broken
│   ├── storeForward.ts           ✅ implemented, NOT wired
│   └── floorControl.ts           ✅ implemented, NOT wired
│
└── Postgres (docker-compose, Prisma schema ✅)
          │
          │ REST fetch + Bearer JWT
          ▼
packages/portal (Vite + React, admin UI)
│
├── Dashboard → GET /devices
├── Devices   → GET /devices, PATCH /devices/:id/status
├── Talkgroups→ GET /talkgroups
└── Users     → GET /users ❌ 404 — route doesn't exist

packages/comms (@forbiddenlan/comms) — shared library
  ForbiddenLANComms, RelaySocket, MockRelaySocket, AudioPipeline,
  Encryption, FloorControl, GPSPoller, DLS140Client, types
```

### Floor control (optimistic GPS arbitration)

No permission round-trip. At 500–1500ms satellite latency a round-trip adds 1–3 seconds before you can speak.

1. User presses PTT → immediately transmit with GPS timestamp + UUID
2. All receivers see PTT_START. If two arrive within 50ms: collision
3. Collision resolution: lowest GPS timestamp wins (deterministic, no server needed)
4. Tiebreaker: lexicographically smaller device UUID
5. FLOOR_DENY sent to loser

**Clock sync:** `SYNC_TIME` ping on connect calculates `serverTimeOffset`. All devices use server-relative time for arbitration, not raw device clock.

**Watchdog:** 60-second `pttWatchdog` auto-stops recording if PTT_END never fires. Prevents hot mics burning satellite airtime.

---

## 5. Team Roles & Contracts

### Saim — `@forbiddenlan/comms` + docs

**You own:** The invisible plumbing. Your package talks directly to DLS-140 hardware, manages WebSocket connection to Shri's server, handles audio pipeline state, enforces floor control, and exposes a clean API that the mobile app calls.

**Status of your deliverables:**

| Module | Status | Notes |
|---|---|---|
| `ForbiddenLANComms.ts` | ✅ built | main export |
| `RelaySocket.ts` | ⚠️ bug C2 | `.on()` → `.addEventListener()` fix needed |
| `MockRelaySocket.ts` | ✅ works | single-device loopback only |
| `AudioPipeline.ts` | ✅ platform-agnostic | `enqueueChunk(base64)` API |
| `Encryption.ts` | ✅ works | AES-GCM-256, hardcoded test key |
| `FloorControl.ts` | ✅ built | `isTimestampValid()` — not wired in server |
| `GPSPoller.ts` | ✅ built | polls DLS-140, emits GPS_UPDATE |
| `DLS140Client.ts` | ✅ built | HTTP wrapper for DLS-140 endpoints |
| `types.ts` | ✅ built | shared message types |

**Public API you deliver to Maisam & Annie:**

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

**Immediate action items:**
- Fix C2: `RelaySocket.ts` — replace all `.on()` with `.addEventListener()`
- Docs site: migrate `docs/` to Fumadocs (see §11)

---

### Shri — `packages/server`

**You own:** The relay switchboard on DigitalOcean. Auth, talkgroup management, WebSocket fan-out, Postgres via Prisma.

**Status of your deliverables:**

| Area | Status | Notes |
|---|---|---|
| Auth routes (`/auth/*`) | ✅ works | Prisma, JWT HS256 |
| Talkgroup routes | ❌ broken | supabase stub — fix C1 |
| Device routes | ❌ broken | supabase stub — fix C1 |
| Keys routes | ❌ broken | supabase stub — fix C1 |
| `GET /users` | ❌ missing | 404 — fix C4 |
| WebSocket hub fan-out | ✅ mostly works | sends to sender too (bug H4) |
| PRESENCE broadcast | ❌ missing | never sent on connect/disconnect |
| GPS write | ❌ broken | writes to supabase stub |
| storeForward.ts | ✅ implemented | NOT wired into hub |
| floorControl.ts | ✅ implemented | NOT wired into hub |
| Docker Compose | ✅ works | Postgres 16 + server |
| Prisma schema | ✅ correct | all tables present |

**Immediate action items (in priority order):**
1. Fix C1: replace `supabase` import with Prisma in `routes/talkgroups.ts`, `routes/devices.ts`, `routes/keys.ts`, `ws/hub.ts`. Fix `Membership` upsert to include `site` field.
2. Fix H4: self-echo in `hub.ts` fan-out — skip sender socket
3. Add C4: `GET /users` route
4. Add PRESENCE broadcast on WS connect/disconnect

**What Shri delivers to the team:**
- Running server URL + port
- Confirmed JWT shape (claims: `{ sub: userId, username, role, iat, exp }`)
- WebSocket URL format: `ws://<ip>:<port>/ws?token=<jwt>`

---

### Maisam & Annie — `packages/mobile` + `packages/portal`

**You own:** Everything the user sees and touches. PTT button, signal bars, talkgroup list, moving map, web portal.

**Status of mobile deliverables:**

| Screen/Component | Status | Notes |
|---|---|---|
| PTTScreen.jsx | ✅ mostly works | hardcoded `'user123'` as device ID (bug H6) |
| Channels.jsx | ⚠️ partial | PTT inline is `// TODO`; `socket.emit` crash in real mode (bug C3) |
| LoginScreen.tsx | ❌ dead code | file exists, not in navigator (bug M6) |
| SignalBar.tsx | ✅ built | — |
| MovingMap.tsx | ✅ built | needs real GPS data from Saim |
| TextPanel.tsx | ✅ built | — |
| Zustand store | ⚠️ defined | never connected to any component (medium gap) |

**Status of portal deliverables:**

| Page | Status | Notes |
|---|---|---|
| Dashboard | ⚠️ partial | works once Shri fixes device route |
| Devices | ⚠️ partial | works once Shri fixes device route |
| Talkgroups | ⚠️ partial | shape mismatch when Prisma replaces supabase (bug H7) |
| Users | ❌ broken | `GET /users` doesn't exist yet |
| Login page | ❌ missing | JWT must be manually set in localStorage |

**Immediate action items:**
1. Add LoginScreen to `App.jsx` navigator as initial route
2. On login success: call `connectComms(jwt)`, set Zustand `jwt`, navigate to Channels
3. Fix Channels.jsx `socket.emit('list-channels')` → replace with `GET /talkgroups` REST call
4. Fix hardcoded `'user123'` → `CONFIG.DEVICE_ID` in PTTScreen
5. Add portal login page (`Login.tsx`) → `POST /auth/login` → `localStorage.setItem('jwt', ...)`

---

## 6. Critical Bugs — Fix These First

These four issues will prevent the app from working at all in real mode. Fix in this order.

### C1 — Supabase stub (Shri)

**File:** `server/src/db/supabase.ts`  
**Problem:** `export const supabase = {} as any` — every route except auth throws `TypeError: supabase.from is not a function`  
**Fix:** In `routes/talkgroups.ts`, `routes/devices.ts`, `routes/keys.ts`, `ws/hub.ts`:
```typescript
// Remove:
import { supabase } from '../db/supabase.js';

// Replace with:
import prisma from '../db/client.js';

// Then rewrite all supabase.from(...).select(...) in Prisma syntax.
// Also: Membership upsert MUST include site field:
await prisma.membership.upsert({
  where: { user_id_talkgroup_id: { user_id, talkgroup_id } },
  update: {},
  create: { user_id, talkgroup_id, site: user.device?.site ?? 'unknown' }
});
```

### C2 — RelaySocket `.on()` crash (Saim)

**File:** `comms/src/RelaySocket.ts`  
**Problem:** Uses Node.js `ws` API (`.on('message', ...)`). On React Native, `ws` is shimmed to browser `WebSocket` which only has `.addEventListener()`. Crashes when attempting a real connection.  
**Fix:** Replace all event bindings:
```typescript
// Remove:
this.ws.on('message', handler);
this.ws.on('open', handler);
this.ws.on('close', handler);
this.ws.on('error', handler);

// Replace with:
this.ws.addEventListener('message', (event) => handler(event.data));
this.ws.addEventListener('open', handler);
this.ws.addEventListener('close', handler);
this.ws.addEventListener('error', handler);
```

### C3 — `socket.emit` null crash (Maisam/Annie)

**File:** `mobile/src/screens/Channels.jsx:100`  
**Problem:** `socket.emit('list-channels')` — `socket` default export from `socket.js` is `null` in real mode when `MOCK_MODE=false`.  
**Fix:** Replace with a direct REST call:
```javascript
// Remove:
socket?.emit('list-channels');

// Replace with:
const res = await fetch(`${CONFIG.API_URL}/talkgroups`, {
  headers: { Authorization: `Bearer ${jwt}` }
});
const { talkgroups } = await res.json();
setChannels(talkgroups);
```

### C4 — Missing `/users` route (Shri)

**File:** `server/src/routes/` (new file or add to auth.ts)  
**Problem:** Portal `Users` page fetches `GET /users` → 404  
**Fix:**
```typescript
app.get('/users', { onRequest: [app.authenticate] }, async (req, reply) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true }
    // Never return password_hash
  });
  reply.send({ users });
});
```

---

## 7. What's Actually Done

A clear-eyed list of what's real, what's mocked, and what's a stub.

### `@forbiddenlan/comms`
- ✅ Full package builds and exports (`pnpm build:comms`)
- ✅ AES-GCM-256 encryption working (hardcoded test key)
- ✅ MockRelaySocket: single-device loopback, 50ms echo
- ✅ AudioPipeline: platform-agnostic state machine (`enqueueChunk` API)
- ✅ FloorControl: `isTimestampValid()` — client-side only
- ✅ DLS140Client: typed HTTP wrapper for DLS-140 endpoints
- ✅ GPSPoller: polls DLS-140, emits GPS_UPDATE
- ⚠️ RelaySocket: correct logic, crashes on RN due to `.on()` bug (fix: 15 mins)

### Mobile app
- ✅ PTT audio recording via expo-av (m4a/AAC — **not Opus**)
- ✅ Audio encrypt → send → receive → decrypt → play (mock loopback)
- ✅ ChannelContext: current channel state
- ✅ PTTScreen: full PTT flow (hardcoded device ID, needs fix)
- ✅ SignalBar, MovingMap, TextPanel components built
- ⚠️ Channels.jsx: channel list is hardcoded MOCK_CHANNELS
- ❌ LoginScreen: exists but not in navigator
- ❌ Zustand store: defined, never used
- ❌ Real talkgroup fetching from server

### Server
- ✅ Auth: register, login, changepassword
- ✅ WebSocket hub: JWT auth, room map, fan-out
- ✅ Prisma schema: all 6 tables correct
- ✅ Docker Compose: Postgres 16 + server
- ✅ storeForward.ts: implemented (not wired)
- ✅ keyRotation.ts: implemented (not wired)
- ❌ All non-auth routes: broken (supabase stub)
- ❌ PRESENCE broadcast
- ❌ GPS persistence (supabase stub)
- ❌ Self-echo prevention in fan-out

### Portal
- ✅ All 4 pages render
- ⚠️ All pages broken until server routes fixed
- ❌ Login page
- ❌ JWT auto-set (manual DevTools required)

---

## 8. What Each Person Needs From the Others

### Saim needs from Shri
- Confirmed server IP + port once deployed
- JWT shape confirmation: `{ sub: userId, username, role }`
- WebSocket URL format confirmed: `ws://<ip>:<port>/ws?token=<jwt>`

### Saim needs from Maisam/Annie
- How does the mobile app call the comms layer? (event emitter? React context? direct import?)
  - Currently: `utils/comms.js` wraps `ForbiddenLANComms` and is imported directly

### Shri needs from Saim
- GPS_UPDATE WebSocket messages flowing so hub can write to `gps_updates` table
- Confirmation of `SYNC_TIME` message format so hub can echo server timestamp

### Shri needs from Maisam/Annie
- Agreed REST response shapes so portal doesn't break when supabase→Prisma migration ships
- Specifically: `GET /talkgroups` response shape (portal currently expects Supabase join syntax — will break)

### Maisam/Annie need from Shri
- Server URL + any `.env.local` values to put in `packages/mobile/`
- Confirmed talkgroup response shape from `GET /talkgroups`

### Maisam/Annie need from Saim
- Confirmation that C2 (`RelaySocket.ts`) is fixed before switching `MOCK_MODE=false`
- Signal status data shape from `getSignalStatus()` for SignalBar component

---

## 9. Interface Contracts

### WebSocket messages (full current types)

```typescript
// From packages/comms/src/types.ts — this is the contract

export type MessageType =
  | 'PTT_START' | 'PTT_AUDIO' | 'PTT_END'
  | 'FLOOR_GRANT' | 'FLOOR_DENY'
  | 'PRESENCE' | 'TEXT_MSG' | 'GPS_UPDATE'
  | 'SYNC_TIME';

// Control messages use sender UUID
{ type: 'PTT_START',   talkgroup: string, sender: string, timestamp: number, seq: number }
{ type: 'PTT_END',     talkgroup: string, sender: string, seq: number }
{ type: 'FLOOR_GRANT', talkgroup: string, winner: string, timestamp: number }
{ type: 'FLOOR_DENY',  talkgroup: string, loser: string }
{ type: 'PRESENCE',    talkgroup: string, online: string[] }
{ type: 'TEXT_MSG',    talkgroup: string, sender: string, text: string }
{ type: 'GPS_UPDATE',  device: string, lat: number, lng: number, alt: number }
{ type: 'SYNC_TIME',   clientTime: number }

// Audio uses sessionId (4-byte int) instead of sender UUID — bandwidth optimization
// sessionId generated fresh on each PTT_START, server maps back to user if needed
{ type: 'PTT_AUDIO', talkgroup: string, sessionId: number, seq: number, chunk: number, data: string }
```

### REST endpoints

```
POST /auth/register          → { jwt: string }
POST /auth/login             → { jwt: string }
POST /auth/changepassword    → { success: boolean }
GET  /talkgroups             → { talkgroups: Talkgroup[] }
POST /talkgroups             → { talkgroup: Talkgroup }
POST /talkgroups/:id/join    → { membership: Membership }
GET  /talkgroups/:id/members → { members: User[] }
GET  /devices                → { devices: Device[] }
PATCH /devices/:id/status    → { device: Device }
GET  /devices/:id/gps        → { gps: GpsUpdate }
GET  /keys/rotation          → { counter: number }
POST /keys/rotate            → { counter: number }
GET  /users                  → { users: { id, username, role }[] }  ← needs to be added
```

### DLS-140 local REST (Saim → hardware)

```
POST /auth/login                    → { jwt: string }
GET  /device/status                 → { certusSignalStrength, certusDataBars, cellularSignalStrength }
GET  /device/data-usage?period=24h  → { bytesUsed: number }
GET  /location/gps                  → { lat, lng, alt, mode }
GET  /network/routing               → { preference: 'cellular' | 'satellite' }
PUT  /network/routing               → body: { preference }
PUT  /network/firewall              → body: { profile: 'unrestricted' }
POST /diagnostics/ping              → { latencyMs: number }
```

### Switching from mock to real

In `packages/mobile/`:

```bash
cp .env.example .env.local
```

```env
EXPO_PUBLIC_MOCK_MODE=false
EXPO_PUBLIC_WS_URL=ws://<shri-ip>:<port>/ws
EXPO_PUBLIC_API_URL=http://<shri-ip>:<port>
EXPO_PUBLIC_DLS140_URL=http://192.168.111.1:3000
EXPO_PUBLIC_TALKGROUP=alpha
```

Then rebuild comms:
```bash
pnpm build:comms
```

---

## 10. Fix Order & Sprint Plan

### Phase 1: Get real mode working (MVP WebSocket)

**Do these before anything else. In this order.**

**1. C1 — Supabase→Prisma migration (Shri) — ~2–3 hrs**
Unblocks everything else. Routes, portal, GPS persistence all depend on this.

**2. C2 — RelaySocket `.on()` fix (Saim) — ~15 mins**
One find-and-replace. Must be done before Maisam/Annie can test real mode.

**3. C4 — Add `GET /users` route (Shri) — ~20 mins**
Unblocks portal Users page.

**4. C3 — Fix `socket.emit` crash (Maisam/Annie) — ~30 mins**
Replace with `GET /talkgroups` REST call. Requires Shri's C1 fix first.

**5. H4 — Fix self-echo in hub (Shri) — ~15 mins**
```typescript
room.forEach(client => {
  if (client !== socket && client.readyState === WebSocket.OPEN) {
    client.send(raw);
  }
});
```

**6. H6 — Fix hardcoded `'user123'` (Maisam/Annie) — ~5 mins**
Replace with `CONFIG.DEVICE_ID` in PTTScreen.jsx.

**7. M6 — Add LoginScreen to navigator (Maisam/Annie) — ~1 hr**
Wire `LoginScreen.tsx` as initial route in `App.jsx`. On success: set jwt in Zustand store, call `connectComms(jwt)`, navigate to Channels.

**8. H3 — Add PRESENCE broadcast (Shri) — ~30 mins**
On WS connect/disconnect, broadcast `{ type: 'PRESENCE', talkgroup, online: [...ids] }` to room.

---

### Phase 2: Demo polish (if time allows)

- Add portal login screen (M8)
- Wire Zustand store to UI components (M5)
- Wire storeForward.ts into hub.ts (M1)
- Add admin role check on device routes (H5)
- Fix portal Talkgroups response shape after Prisma migration (H7)

---

### Phase 3: UDP hybrid (if time allows, big +15% points)

**What changes:**

| Layer | Before | After |
|---|---|---|
| Voice audio (PTT_AUDIO) | WebSocket | UDP socket (RTP format) |
| Control messages | WebSocket | WebSocket (stays) |
| Floor control | WebSocket | WebSocket (stays) |

**Mobile:** Add `react-native-udp`. On PTT press, send Opus chunks directly as UDP datagrams to server's UDP port.

**Server:** Add a UDP socket listener alongside Fastify. On receive, look up room by session token, fan out datagrams to all room members' UDP addresses.

**Why it's worth it for the demo:**  
Eliminates head-of-line blocking entirely. On the satellite link this is the difference between "stutters occasionally" and "feels like a real radio."

**Minimum viable version:** Even just changing `PTT_AUDIO` fan-out to UDP while keeping everything else on WebSocket is a significant improvement and worth calling out in the presentation.

---

## 11. Fumadocs Docs Site Plan

The `docs/` markdown files will be migrated into a Fumadocs-powered Next.js documentation site as a new package in the monorepo.

### Why Fumadocs
- MDX rendering, auto-generated sidebar, full-text search
- Renders in browser — easier for teammates to read than raw `.md`
- Judges can browse architecture/tradeoffs docs live during presentation

### Planned structure

```
packages/docs-site/                  ← new package
├── app/
│   ├── layout.tsx                   (Fumadocs RootLayout)
│   └── docs/
│       └── [[...slug]]/page.tsx     (dynamic MDX rendering)
├── content/docs/                    ← MDX source (migrated from /docs)
│   ├── architecture.mdx
│   ├── tradeoffs.mdx
│   ├── api-contracts.mdx
│   ├── backend-integration.mdx
│   ├── sequence-ptt.mdx
│   └── first-e2e-mocktest.mdx
├── source.config.ts
└── next.config.mjs
```

### Migration steps

```bash
cd packages
npx create-fumadocs-app docs-site
# or: add fumadocs-core fumadocs-ui to existing Next.js app

# Then for each docs/*.md:
# 1. Copy to content/docs/
# 2. Rename .md → .mdx
# 3. Add frontmatter:
---
title: Architecture
description: System architecture and three-layer model
---
```

Sidebar and search index are generated automatically from the file tree. No config needed beyond frontmatter.

---

## 12. Known Gaps & Tradeoffs for Presentation

Present these proactively. Judges respect honesty more than pretending the system is perfect.

### Architectural decisions

| Decision | Options | Choice | Why |
|---|---|---|---|
| Relay architecture | P2P vs central server | Central server | Iridium NAT prevents P2P — no alternative |
| Floor control | Server grant/deny vs optimistic GPS | Optimistic GPS | Server round-trip = 1–3s delay at satellite latency |
| Clock sync | Raw device timestamps vs SYNC_TIME | SYNC_TIME offset | Prevents unfair arbitration from device clock skew |
| Audio codec | Opus vs Codec2 vs adaptive | Adaptive | Opus 8kbps good signal, Codec2 2400bps fallback < 2 bars |
| Audio transport | WebSocket vs UDP | WebSocket MVP → UDP roadmap | WebSocket ships faster; UDP is the correct long-term answer |
| Auth session ID | Full JWT per audio packet vs 4-byte sessionId | 4-byte sessionId | Saves ~30 bytes per chunk; ~30% of 22kbps is packaging |
| Half-duplex | Full duplex vs strict half-duplex | Strict half-duplex | 22kbps cannot handle simultaneous TX+RX without link saturation |
| App platform | Capacitor vs React Native + Expo | React Native + Expo | Team knows React; Expo simplifies native builds; same source → 3 targets |
| Database | Supabase vs PostgreSQL + Prisma | PostgreSQL + Prisma | More control; avoids vendor lock-in |

### Known gaps to acknowledge

| Gap | Mitigation |
|---|---|
| Audio codec is AAC not Opus | Opus was the plan; expo-av `LOW_QUALITY` preset outputs AAC. Functionally similar at ~12kbps. V2: implement `react-native-opus`. |
| No KDF / key rotation in use | `master_secret` stored in DB but not distributed to clients. Encryption uses hardcoded test key. V2: add `/keys/derive` endpoint. |
| Timestamp spoofing possible | Relay validates timestamps ±5s of server time. V2: signed timestamps. |
| No automated rogue detection | Web portal allows manual override/disable. V2: anomaly detection on TX frequency. |
| Satellite link drops on handoff | Store-and-forward buffers 30s (implemented, not wired). V2: wire it into hub. |
| Admin single point of failure | If relay unreachable: local PTT over WiFi still works. V2: multi-region relay. |
| WebSocket head-of-line blocking | Jitter buffer mitigates stutter in MVP. V2: UDP transport for audio. |

### Bandwidth budget

```
Opus 8kbps audio:
  Audio payload:  1000 bytes/s
  Header (12B @ 60ms frame rate): 200 bytes/s
  Encryption overhead (28B/frame): 467 bytes/s
  WebSocket framing: ~100 bytes/s
  Total: ~1800 bytes/s = ~14.4 kbps
  Uplink remaining: 22 - 14.4 = 7.6 kbps headroom ✅

With UDP (Phase 2):
  Remove WebSocket framing ~100 bytes/s
  Remove TCP headers ~300 bytes/s
  Total: ~11.5 kbps — 10.5 kbps headroom ✅✅
```

---

## Appendix: Monorepo Quick Reference

### Package map

```
TheForbiddenLAN/
├── packages/
│   ├── comms/          @forbiddenlan/comms  (Saim)
│   │   ├── src/        ForbiddenLANComms, RelaySocket, MockRelaySocket,
│   │   │               AudioPipeline, Encryption, FloorControl,
│   │   │               GPSPoller, DLS140Client, types
│   │   └── dist/       compiled output — run pnpm build:comms first
│   │
│   ├── mobile/         React Native + Expo SDK 54  (Maisam + Annie)
│   │   ├── src/
│   │   │   ├── screens/    Channels.jsx, PTTScreen.jsx, LoginScreen.tsx,
│   │   │   │               MapScreen.tsx, VoiceChannelChatPage.jsx
│   │   │   ├── components/ PTTButton, SignalBar, MovingMap,
│   │   │   │               TalkgroupSelector, TextPanel, NetworkInfo, UserStatus
│   │   │   ├── hooks/      useComms.ts, useAudioCapture.ts, useAudioPlayback.ts
│   │   │   ├── context/    ChannelContext.jsx
│   │   │   ├── store/      index.ts (Zustand — defined, unused)
│   │   │   └── utils/      audio.js, comms.js, socket.js
│   │   ├── app.json        Expo config
│   │   ├── index.js        native entry → App.jsx
│   │   ├── index.web.js    web entry (legacy, dead code)
│   │   └── vite.config.js  react-native-web alias for browser target
│   │
│   ├── portal/         Vite + React admin UI  (Maisam + Annie)
│   │   └── src/pages/  Dashboard, Devices, Talkgroups, Users
│   │
│   └── server/         Fastify + Prisma + Postgres  (Shri)
│       ├── src/
│       │   ├── routes/     auth.ts ✅  talkgroups.ts ❌  devices.ts ❌  keys.ts ❌
│       │   ├── ws/         hub.ts ⚠️  floorControl.ts (not wired)
│       │   ├── services/   storeForward.ts (not wired)  keyRotation.ts (not wired)
│       │   └── db/         client.ts ✅  supabase.ts ❌ (stub — remove)
│       ├── prisma/schema.prisma  ✅
│       └── docker-compose.yml    ✅
│
├── docs/               markdown source → Fumadocs migration planned
│   ├── architecture.md
│   ├── tradeoffs.md
│   ├── BACKEND_INTEGRATION.md
│   ├── api-contracts.md
│   ├── sequence-ptt.md
│   └── first-e2e-mocktest.md
│
└── gradle-dist/        Android build tooling (Gradle 7.3.1)
```

### Key env vars (mobile)

| Var | Default | Purpose |
|---|---|---|
| `EXPO_PUBLIC_MOCK_MODE` | `true` | `true` = MockRelaySocket; `false` = real WebSocket |
| `EXPO_PUBLIC_WS_URL` | `ws://localhost:9999` | Shri's relay server |
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000` | Shri's REST server |
| `EXPO_PUBLIC_DLS140_URL` | `http://192.168.111.1:3000` | Satellite router local IP |
| `EXPO_PUBLIC_TALKGROUP` | `alpha` | Default talkgroup on connect |
| `EXPO_PUBLIC_DEVICE_ID` | random per launch | Ephemeral — set explicitly for consistent floor control |

### Prisma schema (current)

```prisma
model User {
  id           String  @id @default(uuid())
  username     String  @unique
  password_hash String
  role         String  @default("operator")
  device_id    String?
}

model Device {
  id         String  @id @default(uuid())
  name       String
  site       String
  serial     String
  active     Boolean @default(true)
  created_at DateTime @default(now())
}

model Talkgroup {
  id               String @id @default(uuid())
  name             String
  master_secret    Bytes
  rotation_counter Int    @default(0)
}

model Membership {
  user_id      String
  talkgroup_id String
  site         String        // REQUIRED — populate from user's Device.site
  @@id([user_id, talkgroup_id])
}

model KeyRotation {
  talkgroup_id String
  counter      Int
  rotated_at   DateTime @default(now())
  @@id([talkgroup_id, counter])
}

model GpsUpdate {
  device_id  String   @id
  lat        Float
  lng        Float
  alt        Float
  updated_at DateTime @updatedAt
}
```
