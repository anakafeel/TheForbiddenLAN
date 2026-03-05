# REST Shim — Backward-Compatible Read Layer Over the Operation Log

**Status**: Implementation Plan
**Date**: 2026-03-05

---

## What This Is

The distributed architecture (see `distributed-architecture.md`) replaced the server's CRUD tables (Talkgroup, Membership, KeyRotation) with an append-only operation log. Admin writes now go through WebSocket messages (ADMIN_CREATE_TALKGROUP, ADMIN_ADD_MEMBER, etc.) that get sequenced, persisted, and fanned out.

But the mobile app still calls the old REST endpoints (`GET /talkgroups`, `POST /talkgroups/:id/members`, etc.) because we haven't added SQLite on the phones yet.

The **REST shim** bridges this gap: it re-adds the same REST endpoints with the same response shapes, but backs them with the operation log instead of direct table reads.

- **Reads** (GET) → replay the operation log to compute current state (which talkgroups exist, who's a member, what the key rotation counter is), then return the same JSON the mobile app expects.
- **Writes** (POST/DELETE/PATCH) → create operations in the log via `appendOp()` (the same function the WebSocket admin handlers use), then return the same JSON the mobile app expects.

## Why

1. **Don't break the mobile app.** Saim is actively testing. The app calls these REST endpoints. If they disappear, everything breaks.
2. **Test the server in isolation.** We can verify the operation log, sync protocol, and materialization logic without touching mobile code.
3. **One problem at a time.** After the server is verified, we add SQLite on phones — and the REST shim naturally goes away because the phone reads from local SQLite instead of REST.

## How It Works

### materializeState()

A single function that replays all operations from the `operations` table and returns the current state:

```typescript
interface MaterializedState {
  talkgroups: Map<string, { id: string; name: string; masterSecret: string; rotationCounter: number; createdAt: string }>;
  memberships: Map<string, Set<string>>; // talkgroupId → Set<userId>
  memberSites: Map<string, string>;       // `${userId}:${talkgroupId}` → site
}
```

It processes ops in seq order:
- `ADMIN_CREATE_TALKGROUP` → add to talkgroups map
- `ADMIN_DELETE_TALKGROUP` → remove from talkgroups map, remove all memberships for that talkgroup
- `ADMIN_ADD_MEMBER` → add userId to memberships set for talkgroupId
- `ADMIN_REMOVE_MEMBER` → remove userId from memberships set
- `ADMIN_ROTATE_KEY` → increment rotationCounter on the talkgroup
- `ADMIN_SNAPSHOT` → replace entire state with snapshot contents

### Shim Endpoints

Every endpoint matches the old response shape exactly so the mobile app doesn't know the difference.

| Old Route | Shim Behavior |
|-----------|---------------|
| `GET /talkgroups` | materializeState(), filter talkgroups where user is a member, return `{ talkgroups }` |
| `POST /talkgroups` | appendOp(ADMIN_CREATE_TALKGROUP), return `{ talkgroup }` |
| `DELETE /talkgroups/:id` | appendOp(ADMIN_DELETE_TALKGROUP), return `{ ok: true }` |
| `POST /talkgroups/:id/join` | appendOp(ADMIN_ADD_MEMBER) via auto-approve, return `{ membership }` |
| `DELETE /talkgroups/:id/leave` | appendOp(ADMIN_REMOVE_MEMBER), return `{ ok: true }` |
| `GET /talkgroups/:id/members` | materializeState(), return members of talkgroup as `{ members }` |
| `POST /talkgroups/:id/members` | appendOp(ADMIN_ADD_MEMBER), return `{ membership }` |
| `DELETE /talkgroups/:id/members/:userId` | appendOp(ADMIN_REMOVE_MEMBER), return `{ ok: true }` |
| `GET /devices` | prisma.device.findMany() (unchanged — devices table still exists) |
| `PATCH /devices/:id/status` | prisma.device.update() + appendOp(ADMIN_DEACTIVATE_DEVICE) if deactivating |
| `GET /devices/:id/gps` | prisma.gpsUpdate.findFirst() (unchanged) |
| `POST /devices/:id/gps` | prisma.gpsUpdate.create() (unchanged) |
| `GET /users` | prisma.user.findMany() (unchanged — users table still exists) |
| `GET /keys/rotation?talkgroupId=x` | materializeState(), return rotationCounter for talkgroup |
| `POST /keys/rotate` | appendOp(ADMIN_ROTATE_KEY), return new counter |

### What's NOT Shimmed

- `POST /auth/register`, `POST /auth/login`, `POST /auth/changepassword` — these already work against the User/Device tables which are unchanged.
- `GET /tle/iridium` — no DB interaction, unchanged.
- `GET /ping` — unchanged.

## Testing Plan

1. Run the new server on `PORT=3001` while the old server stays on `PORT=3000`.
2. Point a test client (curl / Postman / the mobile app with a modified API_URL) at `:3001`.
3. Verify:
   - Register + login works → get JWT
   - Create talkgroup via `POST /talkgroups` → check that an `ADMIN_CREATE_TALKGROUP` operation appears in the operations table
   - List talkgroups via `GET /talkgroups` → check it returns the created talkgroup
   - Add member via `POST /talkgroups/:id/members` → check that `ADMIN_ADD_MEMBER` op is persisted
   - List members via `GET /talkgroups/:id/members` → check member appears
   - Join talkgroup via `POST /talkgroups/:id/join` → check auto-approve creates op
   - Connect WebSocket → send `SYNC_REQUEST { lastSeq: 0 }` → verify `SYNC_BATCH` returns all ops
   - Key rotation via `POST /keys/rotate` → check `ADMIN_ROTATE_KEY` op
   - GPS read/write still works
   - PTT flow works (PTT_START → FLOOR_GRANT → PTT_AUDIO → PTT_END → FLOOR_RELEASED)
4. Once verified, swap: stop old server, start new server on `:3000`.
5. Saim retests the mobile app — should see no difference.

## When This Goes Away

When SQLite is added to the phones:
- Mobile reads talkgroups/members/keys from local SQLite instead of REST
- Mobile handles `OP` and `SYNC_BATCH` messages to keep local SQLite in sync
- The REST shim routes are deleted
- Only auth + GPS + TLE REST endpoints remain (as documented in distributed-architecture.md)
