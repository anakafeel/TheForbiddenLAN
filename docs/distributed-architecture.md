# Distributed Architecture — Server as Relay + Local Device State

**Status**: Proposed
**Author**: Shri
**Date**: 2026-03-03

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

- **One relay server.** We have a single DigitalOcean droplet. No multi-node, no consensus protocols. The relay is a natural serialization point.
- **22 kbps uplink, 88 kbps downlink.** Every byte costs money. Sync must be efficient.
- **500–1500 ms latency.** Round trips are expensive. Avoid request/response patterns where possible.
- **NAT on the satellite network.** Devices can't talk directly. Everything goes through the relay.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Relay Server (DO Droplet)             │
│                                                         │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────┐ │
│  │ WebSocket │  │ Operation Log │  │ Sync Engine      │ │
│  │ Relay     │  │ (Postgres)    │  │ (cursors + push) │ │
│  │ (fan-out) │  │               │  │                  │ │
│  └──────────┘  └───────────────┘  └──────────────────┘ │
│  ┌──────────┐  ┌───────────────┐                        │
│  │ Auth      │  │ GPS Store     │                        │
│  │ (JWT)     │  │ (append-only) │                        │
│  └──────────┘  └───────────────┘                        │
└─────────────────────────────────────────────────────────┘
        ▲               ▲               ▲
        │ WebSocket      │ WebSocket      │ WebSocket
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Device A   │ │   Device B   │ │   Device C   │
│ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │
│ │  SQLite   │ │ │ │  SQLite   │ │ │ │  SQLite   │ │
│ │ (local)   │ │ │ │ (local)   │ │ │ │ (local)   │ │
│ └──────────┘ │ │ └──────────┘ │ │ └──────────┘ │
└──────────────┘ └──────────────┘ └──────────────┘
```

## What the Server Does (Three Roles)

### Role 1: Relay (unchanged from current)

Fan out real-time messages to talkgroup members. No persistence needed.

- PTT_START, PTT_AUDIO, PTT_END
- TEXT_MSG
- GPS_UPDATE
- PRESENCE

This is the existing `hub.ts` logic. Room maps stay in-memory.

### Role 2: Operation Log (replaces REST CRUD)

Every admin action becomes a message that the server:

1. **Validates** — is the sender actually an admin?
2. **Assigns a sequence number** — monotonic counter, global ordering
3. **Persists** — appends to the `operations` table in Postgres
4. **Fans out** — sends to all affected devices over WebSocket

The operation log is append-only. It is the canonical ordering of all state changes.

### Role 3: Sync Broker (new)

When a device connects (or reconnects), the server:

1. Checks the device's last acknowledged sequence number (`device_sync_cursors`)
2. Sends all operations since that sequence number as a `SYNC_BATCH`
3. Waits for a `SYNC_ACK` from the device with the new cursor

This guarantees that a device that was offline for hours/days catches up automatically.

## Server-Side Schema (Postgres)

Replaces the current 6-table schema. The server no longer stores app-level entities (talkgroups, memberships, devices). It stores operations and auth.

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

-- Track what each device has seen
device_sync_cursors (
  device_id   UUID PRIMARY KEY,
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

-- GPS stays server-side (devices report up, admin portal reads)
gps_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   UUID NOT NULL,
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

**Hackathon mode (current, `AUTO_APPROVE_JOIN=true`):** The server receives this request, automatically generates a corresponding `ADMIN_ADD_MEMBER` operation (signed with the server's admin key), assigns it a sequence number, persists it, and fans it out. The requesting member's device and the new user's device both get the membership immediately. No admin intervention needed.

**Production mode (`AUTO_APPROVE_JOIN=false`):** The server relays the request to all connected admins as a notification. Admin manually reviews and responds with a signed `ADMIN_ADD_MEMBER` if approved. Switching to this mode requires only flipping the env var and having the admin portal UI render pending requests — no server logic changes beyond the flag check.

### Sync Operations

```json
{ "type": "SYNC_REQUEST", "lastSeq": 0 }
{ "type": "SYNC_BATCH", "ops": [ ... ], "upToSeq": 47 }
{ "type": "SYNC_ACK", "lastSeq": 47 }
```

### Existing Real-Time Messages (unchanged)

```json
{ "type": "JOIN_TALKGROUP", "talkgroup": "TG-1" }
{ "type": "LEAVE_TALKGROUP", "talkgroup": "TG-1" }
{ "type": "PTT_START", "talkgroup": "TG-1", "sender": "device-uuid", "timestamp": 1234567890123, "seq": 42 }
{ "type": "PTT_AUDIO", "talkgroup": "TG-1", "sessionId": 12345, "seq": 42, "chunk": 1, "data": "<base64 opus>" }
{ "type": "PTT_END", "talkgroup": "TG-1", "sender": "device-uuid", "seq": 42 }
{ "type": "PRESENCE", "talkgroup": "TG-1", "online": ["uuid1", "uuid2"] }
{ "type": "TEXT_MSG", "talkgroup": "TG-1", "sender": "device-uuid", "text": "Landing in 5" }
{ "type": "GPS_UPDATE", "device": "device-uuid", "lat": 49.28, "lng": -123.12, "alt": 200.0 }
```

## Provisioning Flow

### New user joins the system

```
1. User installs app, hits POST /auth/register → gets JWT + userId
   Server creates row in users table (role='user')

2. User connects to WebSocket with JWT
   Sends SYNC_REQUEST { lastSeq: 0 }
   Server responds with SYNC_BATCH — but no ops target this user yet
   User is connected, authenticated, in zero talkgroups

3. Existing talkgroup member sends:
   { "type": "REQUEST_JOIN_TALKGROUP", "talkgroupId": "...", "targetUser": "<new-user-id>" }

4a. [Hackathon mode — AUTO_APPROVE_JOIN=true]
    Server auto-generates:
    { "type": "ADMIN_ADD_MEMBER", "talkgroupId": "...", "userId": "...", "site": "unknown", "signature": "..." }
    Signed with the server's admin key, assigned seq=48, persisted, fanned out
    → immediate membership, no human in the loop

4b. [Production mode — AUTO_APPROVE_JOIN=false]
    Server relays request to connected admins
    Admin reviews, sends signed ADMIN_ADD_MEMBER if approved
    Server assigns seq=48, persists, fans out

5. Every device in the talkgroup + the new user receives the operation
   Each device verifies the Ed25519 signature
   Each device inserts into local SQLite: memberships(userId, talkgroupId, site)
   Each device sends SYNC_ACK { lastSeq: 48 }

6. New user is now in the talkgroup. PTT audio reaches their device.
```

### Device reconnects after being offline

```
1. Device connects to WebSocket with JWT
2. Sends SYNC_REQUEST { lastSeq: 42 }  (last op it saw before disconnecting)
3. Server queries: SELECT * FROM operations WHERE seq > 42 ORDER BY seq
4. Server sends SYNC_BATCH { ops: [...], upToSeq: 67 }
5. Device replays ops 43–67 against local SQLite
6. Device sends SYNC_ACK { lastSeq: 67 }
7. Device is now caught up. Resumes normal operation.
```

## Signed Admin Operations

Admin operations are cryptographically signed to prevent forgery. The relay server cannot fabricate admin commands — it can only relay and persist them.

### Key generation

On first admin registration, the server generates an Ed25519 keypair:
- Private key is returned to the admin (stored on their device)
- Public key is stored in the `users` table and distributed to all devices via `SYNC_BATCH`

### Signature scheme

For each admin operation:
1. Canonicalize the payload: `JSON.stringify({ type, ...payload })` with sorted keys
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
    "users": [ { "id": "...", "username": "admin", "role": "admin", "publicKey": "..." }, ... ],
    "talkgroups": [ { "id": "...", "name": "Ground Ops", "rotationCounter": 3 }, ... ],
    "memberships": [ { "userId": "...", "talkgroupId": "...", "site": "Hangar" }, ... ],
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

Only two HTTP endpoints remain:

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /ping | No | Health check |
| POST | /auth/register | No | Create account, get JWT |
| POST | /auth/login | No | Get JWT |

Everything else moves to WebSocket messages.

## Server File Changes

| File | Action | Notes |
|------|--------|-------|
| `src/index.ts` | Simplify | Mount only /auth, /ping, /ws |
| `src/routes/auth.ts` | Keep | register + login stay as REST |
| `src/routes/talkgroups.ts` | Delete | Replaced by ADMIN_* messages |
| `src/routes/devices.ts` | Delete | GPS write stays in hub, rest becomes messages |
| `src/routes/keys.ts` | Delete | Replaced by ADMIN_ROTATE_KEY |
| `src/routes/users.ts` | Delete | Admin gets user list via sync |
| `src/services/keyRotation.ts` | Delete | Logic moves into hub |
| `src/ws/hub.ts` | Expand | Add admin message handling, sync logic, op persistence |
| `prisma/schema.prisma` | Rewrite | operations, device_sync_cursors, users, gps_updates |

## Comparison: Before and After

| Aspect | Centralized (current) | Distributed (proposed) |
|--------|----------------------|----------------------|
| Source of truth | Postgres on server | Operation log on server + local SQLite on devices |
| Client state | Stateless (queries server) | Full local copy (works offline) |
| Admin actions | REST API calls | Signed WebSocket messages |
| Provisioning | Server-side CRUD | Message-based, cryptographically verified |
| Integrity | Trust the server | Verify admin signatures on-device |
| Sync | N/A (always online) | Cursor-based catch-up on reconnect |
| REST endpoints | 14 | 3 (ping, register, login) |
| Offline capability | None | Full read path, queued writes |
| Server compromise impact | Total (all data exposed) | Limited (relay disrupted, but can't forge admin ops) |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | (required) | Secret for signing/verifying JWTs |
| `DATABASE_URL` | (required) | Postgres connection string |
| `AUTO_APPROVE_JOIN` | `true` | When `true`, `REQUEST_JOIN_TALKGROUP` is auto-approved by the server (hackathon mode). When `false`, request is relayed to admins for manual approval (production mode). |

## Open Questions

- **Who triggers snapshots?** Admin manually, or server on a schedule?
- **How are admin keypairs backed up?** If admin loses their private key, they can't issue signed ops. Need a recovery path.
- **Should GPS reads be a WS message or stay REST?** The admin portal currently uses REST to fetch GPS. Could switch to subscribing via WebSocket instead.
- **Max SYNC_BATCH size?** Over a 22kbps link, a batch of 1000 ops might be too large. May need pagination: `SYNC_BATCH { ops: [...100], upToSeq: 142, more: true }`.
