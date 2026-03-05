# Distributed Architecture — Server as Relay + Local Device State

**Status**: Proposed
**Author**: Shri
**Date**: 2026-03-05 (revised)

---

## Motivation

The current server architecture is centralized: Postgres is the single source of truth, clients are stateless, and every operation (CRUD, auth, provisioning) goes through REST endpoints backed by Prisma queries.

This is fragile for a satellite deployment:

- **Offline = useless.** If a device loses connectivity to the relay, it can't even look up which talkgroups it belongs to. All state is server-side.
- **Single point of failure.** Postgres goes down, the whole system is dead — even though the relay (the critical path for PTT) doesn't need the DB for fan-out.
- **Expensive dependency for tiny data.** Postgres 16 in Docker for a few dozen users and a handful of talkgroups.
- **The server knows too much.** It stores password hashes, group secrets, membership lists. Compromised droplet = everything exposed.

The goal is to shift to a distributed model where:

1. Every device carries its own state in a local SQLite database
2. The server becomes a message broker: relay + operation log + sync
3. Admin provisioning happens via signed messages, not REST calls
4. Devices can operate independently when disconnected

## Constraints

- **One relay server.** Single DigitalOcean droplet. No multi-node, no consensus protocols. The relay is a natural serialization point — monotonic sequence counters are sufficient for ordering.
- **22 kbps uplink, 88 kbps downlink.** Every byte costs money. Sync must be efficient.
- **500–1500 ms latency.** Round trips are expensive. Avoid request/response patterns where possible.
- **Carrier-grade NAT on Iridium Certus.** Devices can't receive inbound connections. Everything goes through the relay. UDP endpoints require keep-alive registration every 25s.

## Current Transport Layer (As-Built)

Before describing the distributed changes, here is the transport architecture that is already implemented and must be preserved.

### Dual-Transport: WebSocket (TCP) + UDP

The server runs both WebSocket (TCP) and UDP on port 3000. The intended design is that audio transport depends on the device's active link:

**Satellite (Iridium Certus):** Audio goes over UDP. TCP's retransmit behavior causes store-and-forward stalls on the 500–1500ms RTT satellite link — users hear silence then audio bursts. UDP with Opus FEC gives real-time streaming with graceful degradation on packet loss.

**Cellular:** Audio stays on WebSocket (TCP). Cellular RTT is low enough (~50–100ms) that TCP works fine, and guaranteed delivery is preferred over the small latency savings of UDP.

| Message Type | Satellite Transport | Cellular Transport | Reason |
|---|---|---|---|
| PTT_AUDIO | **UDP** | **WebSocket (TCP)** | Satellite needs UDP for real-time; cellular is fine with TCP |
| PTT_START | WebSocket (TCP) | WebSocket (TCP) | Floor arbitration requires guaranteed delivery |
| PTT_END | WebSocket (TCP) | WebSocket (TCP) | Floor release must be reliable |
| FLOOR_GRANT / FLOOR_DENY / FLOOR_RELEASED | WebSocket (TCP) | WebSocket (TCP) | Walk-on prevention requires reliability |
| JOIN/LEAVE_TALKGROUP, PRESENCE, TEXT_MSG, GPS_UPDATE | WebSocket (TCP) | WebSocket (TCP) | State management must be accurate |
| SYNC_TIME | WebSocket (TCP) | WebSocket (TCP) | Clock drift correction for floor arbitration |
| UDP_REGISTER | UDP | N/A | NAT keep-alive, only needed on satellite |

> **Implementation gap:** `ForbiddenLANComms.setTransportMode()` currently ignores the mode parameter and hardcodes `AudioPipeline.useUdp = true`, meaning audio always goes over UDP even on cellular. This needs to be wired to `DLS140Client.getStatus().activeLink` so it actually switches transports.

**Server-side dual delivery:** When the server receives PTT_AUDIO (from either transport), it always relays to peers via both UDP (to those with registered endpoints) and WebSocket. This is unconditional — not gated on satellite mode. Clients deduplicate using `sessionId + chunk`. This guarantees audio arrives even if a peer's NAT mapping has expired or they haven't registered a UDP endpoint.

### Server-Authoritative Floor Control

The server tracks which device holds the floor per talkgroup:

```
talkgroupFloor: Map<talkgroupId, { socket, senderId, sessionId, acquiredAt }>
```

- **PTT_START** → server checks if floor is free. If yes: FLOOR_GRANT + fan-out PTT_START. If no: FLOOR_DENY to requester.
- **PTT_AUDIO** → server validates sender is the floor holder. Drops frames from non-holders.
- **PTT_END** → server releases floor, sends FLOOR_RELEASED to talkgroup.
- **Watchdog** → auto-releases floor after 65s (client MAX_TX = 60s + margin).
- **Collision window** → 50ms; on tie, lowest timestamp wins, then lexically smallest sender UUID.

### UDP NAT Handling (Satellite Only)

When on a satellite link, devices send `UDP_REGISTER` every 25 seconds to maintain their NAT port mapping on the Iridium Certus carrier-grade NAT:

```
udpClients: Map<userId, dgram.RemoteInfo>  // { address, port, family, size }
```

Server uses this map to fan out UDP datagrams to each device.

### Clock Drift Correction

Devices run a `SYNC_TIME` handshake on connect + periodic resync every 60s. Server responds with `serverTime`. Client computes offset for floor control timestamp arbitration.

### packages/comms — Shared Communication Library

The `@forbiddenlan/comms` package encapsulates all transport logic, consumed by the mobile app via `useComms()`:

| Module | Purpose |
|---|---|
| `ForbiddenLANComms.ts` | Main orchestrator: manages all sub-components, half-duplex enforcement, PTT watchdog |
| `RelaySocket.ts` | WebSocket client: reconnect with exponential backoff, SYNC_TIME resync |
| `UdpSocket.ts` | UDP client: react-native-udp, UDP_REGISTER keep-alive, audio frame routing |
| `AudioPipeline.ts` | Frame sequencing: strips talkgroup context for bandwidth savings, routes via UDP or WebSocket based on `useUdp` flag |
| `FloorControl.ts` | Client-side floor pre-check (advisory; server is authoritative) |
| `DLS140Client.ts` | DLS-140 SATCOM device HTTP API (GPS, status, routing preference) |
| `GPSPoller.ts` | Polls DLS-140 GPS every 10s, broadcasts GPS_UPDATE via WebSocket |
| `Encryption.ts` | AES-GCM stub with test key; awaits KDF implementation |

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Relay Server (DO Droplet, port 3000)           │
│                                                                  │
│  ┌───────────┐  ┌──────────┐  ┌───────────────┐  ┌───────────┐ │
│  │ WebSocket  │  │ UDP      │  │ Operation Log │  │ Sync      │ │
│  │ Relay      │  │ Relay    │  │ (Postgres)    │  │ Engine    │ │
│  │ (control   │  │ (audio   │  │               │  │ (cursors) │ │
│  │  + state)  │  │  fanout) │  │               │  │           │ │
│  └───────────┘  └──────────┘  └───────────────┘  └───────────┘ │
│  ┌───────────┐  ┌──────────┐  ┌───────────────┐                 │
│  │ Floor      │  │ Auth     │  │ GPS Store     │                 │
│  │ Control    │  │ (JWT)    │  │ (append-only) │                 │
│  └───────────┘  └──────────┘  └───────────────┘                 │
└──────────────────────────────────────────────────────────────────┘
        ▲ WS (TCP)       ▲ UDP              ▲ WS (TCP)
        │ control msgs   │ audio frames     │ control msgs
        ▼                ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   Device A       │ │   Device B       │ │   Device C       │
│ ┌──────────────┐ │ │ ┌──────────────┐ │ │ ┌──────────────┐ │
│ │ SQLite       │ │ │ │ SQLite       │ │ │ │ SQLite       │ │
│ │ (local state)│ │ │ │ (local state)│ │ │ │ (local state)│ │
│ └──────────────┘ │ │ └──────────────┘ │ │ └──────────────┘ │
│ ┌──────────────┐ │ │ ┌──────────────┐ │ │ ┌──────────────┐ │
│ │ @forbiddenlan│ │ │ │ @forbiddenlan│ │ │ │ @forbiddenlan│ │
│ │ /comms       │ │ │ │ /comms       │ │ │ │ /comms       │ │
│ └──────────────┘ │ │ └──────────────┘ │ │ └──────────────┘ │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

## What the Server Does (Four Roles)

### Role 1: Real-Time Relay (existing, preserved)

Fan out real-time messages to talkgroup members across both transports.

**WebSocket (TCP) — control + state + audio:**
- PTT_START, PTT_END (floor handshake)
- FLOOR_GRANT, FLOOR_DENY, FLOOR_RELEASED
- JOIN_TALKGROUP, LEAVE_TALKGROUP, PRESENCE
- TEXT_MSG, GPS_UPDATE
- SYNC_TIME
- PTT_AUDIO (primary on cellular; always relayed by server as dual-delivery fallback on satellite)

**UDP — audio (satellite only):**
- PTT_AUDIO (primary delivery when on satellite link)
- UDP_REGISTER (NAT keep-alive, satellite only)

In-memory state for relay (no persistence needed):
```
rooms:              Map<talkgroupId, Set<WebSocket>>
socketUser:         Map<WebSocket, { userId, deviceId, senderDeviceId }>
socketRooms:        Map<WebSocket, Set<talkgroupId>>
sessionTalkgroup:   Map<sessionId, talkgroupId>
talkgroupFloor:     Map<talkgroupId, { socket, senderId, sessionId, acquiredAt }>
udpClients:         Map<userId, dgram.RemoteInfo>
deviceIdToSocket:   Map<deviceId, WebSocket>
```

### Role 2: Floor Control (existing, preserved)

Server-authoritative half-duplex arbitration. Prevents walk-on (two people talking simultaneously). This stays entirely in-memory — no persistence, no schema changes needed.

### Role 3: Operation Log (new — replaces REST CRUD)

Every admin action becomes a message that the server:

1. **Validates** — is the sender actually an admin?
2. **Assigns a sequence number** — monotonic counter, global ordering
3. **Persists** — appends to the `operations` table in Postgres
4. **Fans out** — sends to all currently connected devices over WebSocket (offline devices catch up via sync on reconnect)

The operation log is append-only. It is the canonical ordering of all state changes.

### Role 4: Sync Broker (new)

When a device connects (or reconnects), the server:

1. Checks the user's last acknowledged sequence number (`sync_cursors`)
2. Sends all operations since that sequence number as a `SYNC_BATCH`
3. Waits for a `SYNC_ACK` from the device with the new cursor

This guarantees that a device that was offline for hours/days catches up automatically.

## Server-Side Schema (Postgres)

The current 6-table schema changes. App-level entities (talkgroups, memberships, key rotations) are no longer queried directly by the server — they live on each device's SQLite. The server stores operations, auth, devices (needed as FK for GPS), and GPS.

```sql
-- The operation log. Every admin action is a row.
operations (
  seq         SERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  issued_by   UUID NOT NULL,
  signature   TEXT NOT NULL,          -- Ed25519 signature over type+payload+seq
  issued_at   TIMESTAMPTZ DEFAULT now()
)

-- Track what each client has seen (keyed by user_id, not device_id —
-- portal users don't have devices, and a user might log in from different devices)
sync_cursors (
  user_id     UUID PRIMARY KEY,
  last_seq    INTEGER NOT NULL DEFAULT 0,
  synced_at   TIMESTAMPTZ
)

-- Auth still lives on the server (needed to issue JWTs before WS connects)
users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'user',
  public_key      TEXT,              -- Ed25519 public key (for admins)
  created_at      TIMESTAMPTZ DEFAULT now()
)

-- Devices stay on the server (needed as FK target for gps_updates,
-- and register creates device records during auth)
devices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT,
  site        TEXT,
  serial      TEXT UNIQUE NOT NULL,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
)

-- GPS stays server-side (devices report up, admin portal reads)
gps_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   UUID NOT NULL REFERENCES devices(id),
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  alt         DOUBLE PRECISION,
  updated_at  TIMESTAMPTZ DEFAULT now()
)
```

## Device-Side Schema (SQLite)

Each device maintains a local database with the same entities as the current Prisma schema:

```sql
users (
  id          TEXT PRIMARY KEY,
  username    TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user',
  public_key  TEXT                   -- for verifying admin signatures
)

talkgroups (
  id                TEXT PRIMARY KEY,
  name              TEXT UNIQUE NOT NULL,
  master_secret     BLOB,            -- 32 bytes, for key derivation
  rotation_counter  INTEGER DEFAULT 0
)

memberships (
  user_id       TEXT NOT NULL,
  talkgroup_id  TEXT NOT NULL,
  site          TEXT DEFAULT 'unknown',
  PRIMARY KEY (user_id, talkgroup_id)
)

devices (
  id      TEXT PRIMARY KEY,
  name    TEXT,
  site    TEXT,
  serial  TEXT UNIQUE,
  active  INTEGER DEFAULT 1
)

key_rotations (
  id             TEXT PRIMARY KEY,
  talkgroup_id   TEXT NOT NULL,
  counter        INTEGER NOT NULL,
  rotated_at     TEXT
)

-- Sync state
sync_state (
  key    TEXT PRIMARY KEY,
  value  TEXT
)
-- Single row: key='last_seq', value='<int>'
```

No `password_hash` on devices. Devices only store peer identity info, not credentials.

## Message Types

### Admin Operations (require role=admin, must be signed)

All admin messages include a `signature` field: an Ed25519 signature over the canonical JSON of `type + payload`, computed with the admin's private key. Devices verify the signature against the admin's known public key before applying.

```json
{ "type": "ADMIN_CREATE_TALKGROUP", "name": "Tower", "masterSecret": "<base64 32 bytes>", "signature": "..." }
{ "type": "ADMIN_DELETE_TALKGROUP", "talkgroupId": "<uuid>", "signature": "..." }
{ "type": "ADMIN_ADD_MEMBER", "talkgroupId": "<uuid>", "userId": "<uuid>", "site": "Hangar", "signature": "..." }
{ "type": "ADMIN_REMOVE_MEMBER", "talkgroupId": "<uuid>", "userId": "<uuid>", "signature": "..." }
{ "type": "ADMIN_ROTATE_KEY", "talkgroupId": "<uuid>", "newCounter": 5, "signature": "..." }
{ "type": "ADMIN_DEACTIVATE_DEVICE", "deviceId": "<uuid>", "signature": "..." }
{ "type": "ADMIN_SNAPSHOT", "seq": 5000, "state": { ... }, "hash": "<SHA-256>", "signature": "..." }
```

### User Operations

```json
{ "type": "REQUEST_JOIN_TALKGROUP", "talkgroupId": "<uuid>", "targetUser": "<uuid>" }
```

**Hackathon mode (current, `AUTO_APPROVE_JOIN=true`):** The server receives this request and automatically generates a corresponding `ADMIN_ADD_MEMBER` operation, assigns it a sequence number, persists it, and fans it out. These auto-approved ops are **unsigned** — the `signature` field is set to `"auto"`. Devices accept unsigned ops when they come from a SYNC_BATCH (trusting the server). No admin intervention needed.

**Production mode (`AUTO_APPROVE_JOIN=false`):** The server relays the request to all connected admins as a notification. Admin manually reviews and responds with a signed `ADMIN_ADD_MEMBER` using their own private key (which the server never sees). Devices verify the signature before applying. Switching to this mode requires flipping the env var and having the admin portal UI render pending requests.

### Sync Operations

```json
{ "type": "SYNC_REQUEST", "lastSeq": 0 }
{ "type": "SYNC_BATCH", "ops": [ ... ], "upToSeq": 47 }
{ "type": "SYNC_ACK", "lastSeq": 47 }
```

### Real-Time Messages (existing, preserved)

**WebSocket (TCP):**
```json
{ "type": "JOIN_TALKGROUP", "talkgroup": "TG-1" }
{ "type": "LEAVE_TALKGROUP", "talkgroup": "TG-1" }
{ "type": "PTT_START", "talkgroup": "TG-1", "sender": "device-uuid", "timestamp": 1234567890123, "seq": 42, "sessionId": 12345 }
{ "type": "PTT_AUDIO", "sessionId": 12345, "chunk": 1, "data": "<base64 opus>" }
{ "type": "PTT_END", "talkgroup": "TG-1", "sender": "device-uuid", "seq": 42, "sessionId": 12345 }
{ "type": "FLOOR_GRANT", "talkgroup": "TG-1", "winner": "device-uuid", "timestamp": 1234567890123 }
{ "type": "FLOOR_DENY", "talkgroup": "TG-1", "holder": "device-uuid" }
{ "type": "FLOOR_RELEASED", "talkgroup": "TG-1", "previousHolder": "device-uuid" }
{ "type": "PRESENCE", "talkgroup": "TG-1", "online": ["uuid1", "uuid2"] }
{ "type": "TEXT_MSG", "talkgroup": "TG-1", "sender": "device-uuid", "text": "Landing in 5" }
{ "type": "GPS_UPDATE", "device": "device-uuid", "lat": 49.28, "lng": -123.12, "alt": 200.0 }
{ "type": "SYNC_TIME", "clientTime": 1234567890123 }
```

**UDP (satellite only):**
```json
{ "type": "PTT_AUDIO", "sessionId": 12345, "chunk": 1, "data": "<base64 opus>" }
{ "type": "UDP_REGISTER", "userId": "device-uuid" }
```

Note: PTT_AUDIO is stripped of talkgroup/timestamp context on the wire — the server looks up talkgroup from `sessionTalkgroup` map seeded by the WebSocket PTT_START. This is a bandwidth optimization for the 22kbps satellite uplink. On cellular, PTT_AUDIO goes over WebSocket instead and the same sessionId routing applies.

## Provisioning Flow

### New user joins the system

```
1. User installs app, hits POST /auth/register → gets JWT + userId
   Server creates row in users table (role='user')

2. User connects to WebSocket with JWT
   Sends SYNC_REQUEST { lastSeq: 0 }
   Server responds with SYNC_BATCH — but no ops target this user yet
   User is connected, authenticated, in zero talkgroups
   Device also sends UDP_REGISTER if on satellite link to establish NAT mapping

3. Existing talkgroup member sends:
   { "type": "REQUEST_JOIN_TALKGROUP", "talkgroupId": "...", "targetUser": "<new-user-id>" }

4a. [Hackathon mode — AUTO_APPROVE_JOIN=true]
    Server auto-generates:
    { "type": "ADMIN_ADD_MEMBER", "talkgroupId": "...", "userId": "...", "site": "unknown", "signature": "auto" }
    Unsigned, assigned seq=48, persisted, fanned out
    → immediate membership, no human in the loop

4b. [Production mode — AUTO_APPROVE_JOIN=false]
    Server relays request to connected admins
    Admin reviews, sends signed ADMIN_ADD_MEMBER if approved
    Server assigns seq=48, persists, fans out

5. Every connected device in the talkgroup + the new user (if online) receives the operation
   Each device verifies the Ed25519 signature
   Each device inserts into local SQLite: memberships(userId, talkgroupId, site)
   Each device sends SYNC_ACK { lastSeq: 48 }
   (Offline devices receive this op via SYNC_BATCH on reconnect)

6. New user is now in the talkgroup.
   They send JOIN_TALKGROUP on WebSocket to enter the room.
   Audio arrives via UDP (satellite) or WebSocket (cellular), depending on active link.
```

### Device reconnects after being offline

```
1. Device connects to WebSocket with JWT
2. If on satellite link, sends UDP_REGISTER to re-establish NAT mapping
3. Sends SYNC_REQUEST { lastSeq: 42 }  (last op it saw before disconnecting)
4. Server queries: SELECT * FROM operations WHERE seq > 42 ORDER BY seq
5. Server sends SYNC_BATCH { ops: [...], upToSeq: 67 }
6. Device replays ops 43–67 against local SQLite
7. Device sends SYNC_ACK { lastSeq: 67 }
8. Device re-sends JOIN_TALKGROUP for each talkgroup in local SQLite
9. Device runs SYNC_TIME handshake for clock drift correction
10. Device is now caught up. Resumes normal operation.
```

## Signed Admin Operations

Admin operations are cryptographically signed to prevent forgery. The relay server cannot fabricate admin commands — it can only relay and persist them. (In hackathon mode, auto-approved ops are unsigned and devices trust the server. Signature verification is only enforced in production mode.)

### Key generation

On first admin registration, the server generates an Ed25519 keypair:
- Private key is returned to the admin (stored on their device)
- Public key is stored in the `users` table and distributed to all devices via `SYNC_BATCH`

### Signature scheme

For each admin operation:
1. Canonicalize the payload: deterministic JSON serialization with sorted keys (use a stable stringify like `json-stable-stringify` or `JSON.stringify(obj, Object.keys(obj).sort())` — the built-in `JSON.stringify` does NOT guarantee key order)
2. Sign with Ed25519 private key: `crypto.sign(null, Buffer.from(canonical), privateKey)`
3. Include base64 signature in the message

Devices verify before applying:
1. Look up admin's public key from local SQLite `users` table
2. Verify: `crypto.verify(null, Buffer.from(canonical), publicKey, signature)`
3. If invalid, drop the operation and log a warning

### Why this matters

Even if the relay server is compromised (someone gets root on the droplet), they cannot:
- Create fake talkgroups
- Add unauthorized users to talkgroups
- Rotate encryption keys
- Deactivate devices

They can only disrupt the relay (DoS), which is an accepted risk with a single relay.

## State Snapshots

To avoid replaying the entire operation log for new devices, the admin periodically publishes a snapshot.

```json
{
  "type": "ADMIN_SNAPSHOT",
  "seq": 5000,
  "state": {
    "users": [ { "id": "...", "username": "admin", "role": "admin", "public_key": "..." }, ... ],
    "talkgroups": [ { "id": "...", "name": "Ground Ops", "rotation_counter": 3 }, ... ],
    "memberships": [ { "user_id": "...", "talkgroup_id": "...", "site": "Hangar" }, ... ],
    "devices": [ { "id": "...", "serial": "DLS-001", "active": true }, ... ]
  },
  "hash": "<SHA-256 of canonical state JSON>",
  "signature": "<Ed25519 over hash>"
}
```

The server stores this as a regular operation (it gets a seq number). When a new device sends `SYNC_REQUEST { lastSeq: 0 }`, the server:

1. Finds the most recent `ADMIN_SNAPSHOT` operation
2. Sends it as the first message in the `SYNC_BATCH`
3. Follows with all operations after the snapshot's seq

Existing devices can verify the snapshot hash against their own computed state to detect divergence.

## What Stays as REST

Only authentication stays as HTTP (needed before WebSocket connects):

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /ping | No | Health check |
| POST | /auth/register | No | Create account, get JWT |
| POST | /auth/login | No | Get JWT |

Everything else moves to WebSocket messages. The current REST routes for talkgroups, devices, keys, and users are replaced by admin operations over WebSocket.

## What Changes on the Server

### Files deleted (REST CRUD → admin messages)

| File | Replaced by |
|------|-------------|
| `src/routes/talkgroups.ts` | ADMIN_CREATE_TALKGROUP, ADMIN_DELETE_TALKGROUP, ADMIN_ADD_MEMBER, ADMIN_REMOVE_MEMBER messages in hub |
| `src/routes/devices.ts` | ADMIN_DEACTIVATE_DEVICE message in hub; GPS read could move to WS subscription or stay as REST for portal |
| `src/routes/keys.ts` | ADMIN_ROTATE_KEY message in hub |
| `src/routes/users.ts` | Admin gets user list via SYNC_BATCH |
| `src/services/keyRotation.ts` | Logic moves into hub's ADMIN_ROTATE_KEY handler |

### Files kept (unchanged or minor changes)

| File | Notes |
|------|-------|
| `src/routes/auth.ts` | register + login stay as REST |
| `src/index.ts` | Remove deleted route mounts; keep /auth, /ping, /ws, UDP listener |

### Files expanded

| File | New responsibility |
|------|-------------------|
| `src/ws/hub.ts` | Add: admin message validation + sequencing + persistence, SYNC_REQUEST/SYNC_BATCH/SYNC_ACK handling, auto-approve logic. Preserve: all existing relay, floor control, UDP fan-out, SYNC_TIME, dual delivery |

### Schema rewritten

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Replace Talkgroup, Membership, KeyRotation models with Operation, SyncCursor models. Keep User (add public_key field). Keep Device (for GPS FK). Keep GpsUpdate. |

### Minimal changes to packages/comms

The `@forbiddenlan/comms` library mostly stays the same — it talks to the same WebSocket and UDP endpoints. Two changes are needed:

1. **Transport switching (separate from this migration):** `ForbiddenLANComms.setTransportMode()` needs to actually set `AudioPipeline.useUdp` based on the mode parameter instead of hardcoding `true`. This is independent of the distributed architecture work but is called out here since it's documented as intended behavior above.

2. **Sync + admin ops handling (mobile-side):** The mobile app needs to handle SYNC_REQUEST/SYNC_BATCH/SYNC_ACK messages and apply admin operations to local SQLite. This is app-layer logic (in the mobile package's hooks/stores), not a change to the comms transport layer itself.

## Impact on Admin Portal

The portal currently uses REST endpoints (`GET /talkgroups`, `POST /talkgroups/:id/members`, etc.). After this migration:

- Portal connects to WebSocket (same as mobile devices)
- Admin actions send signed messages instead of REST calls
- Portal receives operations via SYNC_BATCH like any other client
- Portal maintains its own local state (could be in-memory or IndexedDB)
- GPS reads: either subscribe to GPS_UPDATE via WebSocket, or keep a minimal REST endpoint for the portal

## Comparison: Before and After

| Aspect | Centralized (current) | Distributed (proposed) |
|--------|----------------------|----------------------|
| Source of truth | Postgres on server | Operation log on server + local SQLite on devices |
| Client state | Stateless (queries server) | Full local copy (works offline) |
| Admin actions | REST API calls | Signed WebSocket messages |
| Provisioning | Server-side CRUD | Message-based, cryptographically verified |
| Integrity | Trust the server | Verify admin signatures on-device |
| Sync | N/A (always online) | Cursor-based catch-up on reconnect |
| REST endpoints | ~16 | 3 (ping, register, login) |
| Offline capability | None | Full read path, queued writes |
| Server compromise impact | Total (all data exposed) | Limited (relay disrupted, but can't forge admin ops) |
| Audio transport | UDP on satellite, WebSocket on cellular | **Unchanged** |
| Floor control | Server-authoritative | **Unchanged** |
| NAT handling | UDP_REGISTER keep-alive (satellite only) | **Unchanged** |
| Clock sync | SYNC_TIME handshake | **Unchanged** |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | (required) | Secret for signing/verifying JWTs |
| `DATABASE_URL` | (required) | Postgres connection string |
| `PORT` | `3000` | WebSocket (TCP) + UDP listener port |
| `AUTO_APPROVE_JOIN` | `true` | When `true`, `REQUEST_JOIN_TALKGROUP` is auto-approved by the server (hackathon mode). When `false`, request is relayed to admins for manual approval (production mode). |

## Open Questions

- **Who triggers snapshots?** Admin manually, or server on a schedule?
- **How are admin keypairs backed up?** If admin loses their private key, they can't issue signed ops. Need a recovery path.
- **Portal GPS reads:** Subscribe via WebSocket, or keep a minimal REST endpoint?
- **Max SYNC_BATCH size?** Over a 22kbps link, a batch of 1000 ops might be too large. May need pagination: `SYNC_BATCH { ops: [...100], upToSeq: 142, more: true }`.
- **Encryption KDF integration:** The comms `Encryption.ts` currently uses a hardcoded test key. The distributed architecture stores `master_secret` and `rotation_counter` in local SQLite — the KDF (`KDF(master_secret, talkgroup_id, rotation_counter)`) should derive from those local values, not a server fetch.
