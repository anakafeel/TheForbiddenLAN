# SQLite Migration — Phase 3 Implementation Plan

**Status**: Approved for implementation
**Branch**: `shri-mobile-sqlite` (off `shri-backend-v2`)
**Date**: 2026-03-06

---

## Goal

Add local SQLite to the mobile app so it reads talkgroups/memberships/keys from a local replica instead of the REST shim. The REST shim routes on the server are deleted once this is live.

---

## Two Critical Failure Points and Mitigations

These were identified during plan review and **must be built in from the start**.

### Failure #4 — JOIN_TALKGROUP Timing Race

**Problem**: After SQLite migration the login flow becomes:
```
login → SYNC_REQUEST → [wait for SYNC_BATCH to land and apply] → read SQLite → JOIN_TALKGROUP
```
If `JOIN_TALKGROUP` fires during the SYNC_BATCH window, `hub.ts` looks up the user's talkgroup memberships and finds none (SQLite is empty). The user gets routed to no rooms and misses all PTT audio *silently*.

**Mitigation**:
- `SyncClient` emits a `sync_complete` event after SYNC_BATCH ops are fully written to SQLite
- `useComms` does NOT send `JOIN_TALKGROUP` on WebSocket connect — it waits for `sync_complete`
- After `sync_complete`, read talkgroup list from SQLite and send `JOIN_TALKGROUP` for each

```
WS connect → SYNC_REQUEST
SYNC_BATCH received → applyOps to SQLite → emit('sync_complete')
sync_complete handler → readTalkgroupsFromSQLite() → for each: send JOIN_TALKGROUP
```

---

### Failure #5 — Duplicate Op Application

**Problem**: An op can arrive via two paths at the same time:
1. SYNC_BATCH (catch-up replay of all ops since lastSeq)
2. Live `OP` message (broadcast when a new op is appended while the device is connected)

If a new op is appended while SYNC_BATCH is in-flight, the device receives it in both messages. Without protection, `applyOp` runs twice and creates duplicate rows / corrupted counters.

**Mitigation Part A — Idempotent SQL**: Every `applyOp` write uses `INSERT OR IGNORE` on a primary key of `(seq, type)`. Running the same op twice is a no-op.

**Mitigation Part B — In-flight deduplication in SyncClient**:
- When SYNC_REQUEST is sent, record `syncInFlight = true` and `pendingUpToSeq = null`
- When SYNC_BATCH arrives, record `pendingUpToSeq = upToSeq`
- Any live `OP` messages received while `syncInFlight = true` AND `op.seq <= pendingUpToSeq` are dropped — they will be covered by the SYNC_BATCH
- After SYNC_BATCH is fully applied, set `syncInFlight = false` and process any queued live ops with seq > pendingUpToSeq

---

## Architecture

```
packages/comms/src/
  SyncClient.ts          ← new: sync state machine, emits sync_complete
  SyncAdapter.ts         ← new: interface (no expo-sqlite import, platform-agnostic)

packages/mobile/src/
  db/
    client.ts            ← new: SQLiteProvider + getDb() singleton
    schema.ts            ← new: CREATE TABLE statements
    applyOp.ts           ← new: op-type dispatch with INSERT OR IGNORE
    ExpoSQLiteAdapter.ts ← new: implements SyncAdapter using expo-sqlite
  hooks/
    useSyncClient.ts     ← new: creates SyncClient, passes adapter, exposes syncReady
    useTalkgroups.ts     ← rewrite: read from SQLite instead of REST GET
```

---

## SQLite Schema

```sql
-- talkgroup records materialized from ops
CREATE TABLE IF NOT EXISTS talkgroups (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  master_secret    TEXT NOT NULL,
  rotation_counter INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

-- membership records
CREATE TABLE IF NOT EXISTS memberships (
  user_id      TEXT NOT NULL,
  talkgroup_id TEXT NOT NULL,
  site         TEXT NOT NULL DEFAULT 'unknown',
  PRIMARY KEY (user_id, talkgroup_id)
);

-- op log mirror — primary key on seq prevents duplicates
CREATE TABLE IF NOT EXISTS ops (
  seq        INTEGER PRIMARY KEY,
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL,  -- JSON string
  issued_by  TEXT NOT NULL,
  issued_at  TEXT NOT NULL
);

-- single-row cursor (always rowid=1)
CREATE TABLE IF NOT EXISTS sync_cursor (
  id       INTEGER PRIMARY KEY DEFAULT 1,
  last_seq INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO sync_cursor (id, last_seq) VALUES (1, 0);
```

---

## SyncAdapter Interface

Lives in `packages/comms/src/SyncAdapter.ts` — no expo-sqlite import, just a plain TypeScript interface. The comms package stays platform-agnostic and unit-testable.

```typescript
export interface SyncAdapter {
  getLastSeq(): Promise<number>;
  applyOp(op: { seq: number; type: string; payload: any; issued_by: string; issued_at: string }): Promise<void>;
  setLastSeq(seq: number): Promise<void>;
}
```

---

## SyncClient

Lives in `packages/comms/src/SyncClient.ts`. Accepts a WebSocket-like `sendFn` and a `SyncAdapter`.

```typescript
export class SyncClient extends EventEmitter {
  // Events: 'sync_complete'

  async startSync(sendFn: (msg: any) => void): Promise<void>
  // 1. getLastSeq from adapter
  // 2. set syncInFlight = true
  // 3. sendFn({ type: 'SYNC_REQUEST', lastSeq })

  async handleSyncBatch(batch: { ops: Op[]; upToSeq: number }, sendFn: (msg: any) => void): Promise<void>
  // 1. record pendingUpToSeq = upToSeq
  // 2. for each op: await adapter.applyOp(op)  ← INSERT OR IGNORE, idempotent
  // 3. await adapter.setLastSeq(upToSeq)
  // 4. sendFn({ type: 'SYNC_ACK', lastSeq: upToSeq })
  // 5. syncInFlight = false
  // 6. emit('sync_complete')
  // 7. flush any queued live ops (seq > pendingUpToSeq)

  handleLiveOp(op: Op): void
  // If syncInFlight && op.seq <= pendingUpToSeq: drop (covered by batch)
  // Else if syncInFlight: queue for after batch
  // Else: applyOp immediately
}
```

---

## applyOp Dispatch

`packages/mobile/src/db/applyOp.ts`

```typescript
export async function applyOp(db: SQLiteDatabase, op: SyncOp): Promise<void> {
  // Always write the raw op first (INSERT OR IGNORE on seq PK = idempotent)
  await db.runAsync(
    'INSERT OR IGNORE INTO ops (seq, type, payload, issued_by, issued_at) VALUES (?,?,?,?,?)',
    [op.seq, op.type, JSON.stringify(op.payload), op.issued_by, op.issued_at]
  );

  switch (op.type) {
    case 'ADMIN_CREATE_TALKGROUP':
      await db.runAsync(
        'INSERT OR IGNORE INTO talkgroups (id, name, master_secret, rotation_counter, created_at) VALUES (?,?,?,0,?)',
        [op.payload.talkgroupId, op.payload.name, op.payload.masterSecret, op.issued_at]
      );
      break;
    case 'ADMIN_DELETE_TALKGROUP':
      await db.runAsync('DELETE FROM talkgroups WHERE id=?', [op.payload.talkgroupId]);
      await db.runAsync('DELETE FROM memberships WHERE talkgroup_id=?', [op.payload.talkgroupId]);
      break;
    case 'ADMIN_ADD_MEMBER':
      await db.runAsync(
        'INSERT OR REPLACE INTO memberships (user_id, talkgroup_id, site) VALUES (?,?,?)',
        [op.payload.userId, op.payload.talkgroupId, op.payload.site ?? 'unknown']
      );
      break;
    case 'ADMIN_REMOVE_MEMBER':
      await db.runAsync(
        'DELETE FROM memberships WHERE user_id=? AND talkgroup_id=?',
        [op.payload.userId, op.payload.talkgroupId]
      );
      break;
    case 'ADMIN_ROTATE_KEY':
      await db.runAsync(
        'UPDATE talkgroups SET rotation_counter = rotation_counter + 1 WHERE id=?',
        [op.payload.talkgroupId]
      );
      break;
  }
}
```

---

## useSyncClient Hook

`packages/mobile/src/hooks/useSyncClient.ts`

```typescript
export function useSyncClient(commsRef: RefObject<ForbiddenLANComms>) {
  const [syncReady, setSyncReady] = useState(false);
  const syncClientRef = useRef<SyncClient | null>(null);

  useEffect(() => {
    const db = getDb();
    const adapter = new ExpoSQLiteAdapter(db);
    const syncClient = new SyncClient(adapter);
    syncClientRef.current = syncClient;

    syncClient.on('sync_complete', () => setSyncReady(true));

    // attach to comms message handler
    commsRef.current?.onMessage((msg) => {
      if (msg.type === 'SYNC_BATCH') syncClient.handleSyncBatch(msg, send);
      if (msg.type === 'OP') syncClient.handleLiveOp(msg.op);
    });

    // kick off initial sync
    syncClient.startSync(send);
  }, []);

  return { syncReady, syncClientRef };
}
```

---

## useComms Changes

Only one change required: replace the current unconditional JOIN_TALKGROUP-on-connect flow with sync_complete-gated flow.

**Before (current REST flow)**:
```
connect → fetchTalkgroups (REST) → JOIN_TALKGROUP for each
```

**After (SQLite flow)**:
```
connect → SYNC_REQUEST
sync_complete fires → read memberships from SQLite → JOIN_TALKGROUP for each
```

---

## useTalkgroups Changes

Replace all `fetch()` calls with SQLite reads:

```typescript
// Before
const res = await fetch(`${CONFIG.API_URL}/talkgroups`, { headers: { Authorization: `Bearer ${jwt}` } });

// After
const userId = useStore(s => s.user?.sub);
const rows = await db.getAllAsync(
  'SELECT t.* FROM talkgroups t JOIN memberships m ON t.id=m.talkgroup_id WHERE m.user_id=?',
  [userId]
);
```

---

## Implementation Order

1. **Install dependencies** — `expo-sqlite`, `expo-secure-store` in `packages/mobile`
2. **Create `packages/comms/src/SyncAdapter.ts`** — plain interface
3. **Create `packages/comms/src/SyncClient.ts`** — full state machine with deduplication
4. **Create `packages/mobile/src/db/schema.ts`** — CREATE TABLE statements
5. **Create `packages/mobile/src/db/client.ts`** — `SQLiteProvider` + `getDb()` singleton
6. **Create `packages/mobile/src/db/applyOp.ts`** — op-type dispatch with `INSERT OR IGNORE`
7. **Create `packages/mobile/src/db/ExpoSQLiteAdapter.ts`** — implements SyncAdapter
8. **Create `packages/mobile/src/hooks/useSyncClient.ts`** — wires sync to comms
9. **Rewrite `useTalkgroups.ts`** — reads from SQLite
10. **Update `useComms.ts`** — wait for `sync_complete`, then JOIN_TALKGROUP
11. **Fix JWT persistence** — `expo-secure-store` in `useAuth.ts`

---

## What Stays the Same on the Server

- The REST shim routes stay until this PR is merged and tested
- `hub.ts` floor control, relay, UDP — untouched
- `hub.ts` SYNC_REQUEST/SYNC_BATCH/SYNC_ACK/OP handlers — already implemented, no changes needed
- Auth REST endpoints — untouched (login/register still use REST)

---

## When REST Shim Is Removed

After this PR is verified e2e:
- Delete `packages/server/src/routes/talkgroups.ts`
- Delete `packages/server/src/routes/keys.ts`
- Delete `packages/server/src/services/materialize.ts`
- Remove shim route mounts from `packages/server/src/index.ts`
- Update `CLAUDE.md` REST endpoint table (auth + gps + tle only)
