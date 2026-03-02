# TheForbiddenLAN — Full Architectural Audit

**Date:** 2026-03-02
**Branch:** `anakafeel/chore/expo-migration`
**Scope:** All packages — comms, mobile, server, portal, docs.

This report is self-contained and can be handed to another Claude instance with no prior context.

---

## 1. Package Inventory

| Package           | Language               | Bundler/Runtime        | DB access          | Status                              |
| ----------------- | ---------------------- | ---------------------- | ------------------ | ----------------------------------- |
| `packages/comms`  | TypeScript (ESM)       | `tsc` / `tsx`          | none               | library; exports 10 modules         |
| `packages/mobile` | JS + TS (React Native) | Metro (Expo SDK 54)    | none               | Expo Go compatible; mock mode works |
| `packages/server` | TypeScript (ESM)       | `tsx` dev / `tsc` prod | Prisma + Postgres  | **50% wired** — see §4              |
| `packages/portal` | TypeScript (React)     | Vite 5                 | none (REST client) | basic admin UI, no auth flow        |

Monorepo: Nx 18 + PNPM workspaces, `shamefully-hoist=true` in `.npmrc`.

---

## 2. `packages/comms` Audit

### 2.1 Public API (`src/index.ts`)

All re-exported:

```
ForbiddenLANComms  RelaySocket      MockRelaySocket
AudioPipeline      Encryption       FloorControl
GPSPoller          DLS140Client     types
```

### 2.2 Key module notes

**`RelaySocket.ts`**

- Uses `ws` npm package: `.on('message', ...)`, `.on('open', ...)`, `.on('close', ...)`, `.on('error', ...)`.
- On React Native, `ws` is shimmed to `global.WebSocket` (browser API) via `src/shims/ws.js`.
- Browser WebSocket has **no `.on()` method** — it uses `.addEventListener()`.
- **This is a crash in real mode.** MockRelaySocket never calls `establishConnection()`, so mock mode works. Real mode: `TypeError: this.ws.on is not a function`.
- Fix documented in `docs/BACKEND_INTEGRATION.md` §Step 2.

**`AudioPipeline.ts`**

- Pure sequencer. Three methods: `startRecording()`, `enqueueChunk(base64)`, `stopRecording()`.
- Takes an optional `Encryption` instance.
- Does NOT do audio capture — that is `utils/audio.js` in the mobile package.

**`Encryption.ts`**

- AES-GCM-256 via Web Crypto API (works in Hermes/RN).
- Hardcoded test key: `deadbeef...` (32-byte hex string).
- `init(hexKey?)` accepts optional key — KDF-derived key can be passed in.
- 12-byte random IV prepended to each ciphertext; overhead is 12 (IV) + 16 (GCM tag) = 28 bytes per chunk.
- At 22kbps, 28 bytes = ~10ms of bandwidth. Acceptable.

**`FloorControl.ts`**

- Exports one function: `isTimestampValid(timestamp, windowMs=5000): boolean`.
- **Never called from `hub.ts`** or anywhere in the server.
- Floor control is entirely client-side (optimistic GPS timestamp arbitration in the mobile app).

**`MockRelaySocket.ts`**

- Echoes all messages back after 50ms.
- Single-device loopback only — does not simulate multi-device scenarios.

**`GPSPoller.ts`** (not read directly, inferred from `comms.startSignalPolling()` call)

- Polls DLS-140 HTTP endpoint every N ms.
- Silently fails if DLS-140 is unreachable (correct behaviour for mock mode).

**`DLS140Client.ts`**

- HTTP client for Iridium DLS-140 satellite modem.
- Returns `DLS140Status` / `DLS140GPS` from the types union.

### 2.3 package.json

- `"type": "module"` — ESM only.
- `"main": "./dist/index.js"` / `"exports": { ".": { "import": "./dist/index.js" } }`.
- Requires `pnpm build:comms` (i.e. `tsc -p tsconfig.lib.json`) before non-Metro consumers (server, portal) can import it.
- Metro bypasses this via the `resolveRequest` source redirect in `metro.config.js`.
- `ws` and `@types/ws` are prod dependencies — this is intentional for server-side use (Node.js `ws`). On mobile, Metro resolves `ws` to the `src/shims/ws.js` shim.

---

## 3. `packages/mobile` Audit

### 3.1 Entry point

`index.js` → `registerRootComponent(App)` from `packages/mobile/App.js` (Expo entry convention).
`App.js` imports from `./src/App.jsx`.

### 3.2 Navigation

```
App.jsx
└── ChannelProvider (ChannelContext)
    └── NavigationContainer
        └── Stack.Navigator
            ├── Channels  (ChannelsScreen)
            └── PTT       (PTTScreen)
```

**No Login screen in the navigator.** `src/screens/LoginScreen.tsx` exists as a file but is not registered. Direct landing on Channels.

### 3.3 State management — two parallel systems (disconnected)

| System        | File                         | What it holds                                                      | Who uses it                     |
| ------------- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------- |
| React Context | `context/ChannelContext.jsx` | `current` channel object, `setCurrent`                             | `Channels.jsx`, `PTTScreen.jsx` |
| Zustand store | `store/index.ts`             | jwt, activeTalkgroup, talkgroups[], signalStatus, floorStatus, gps | **Unused by any screen**        |

The Zustand store is defined and typed but never connected to any UI. It would be the right place to put `jwt` once auth is added.

### 3.4 Config (`src/config.js`)

- Reads `EXPO_PUBLIC_*` vars (Expo native) with fallback to `VITE_*` (web compat, ignored on native).
- `MOCK_MODE` defaults to `true`.
- `DEVICE_ID` is `Math.random()` per launch — ephemeral. Documented in BACKEND_INTEGRATION.md §Step 5.
- `WS_URL` default: `ws://localhost:9999`.
- `API_URL` default: `http://localhost:3000`.

### 3.5 Comms initialization chain

```
socket.js (imported by Channels.jsx)
  → if MOCK_MODE: initComms(MOCK_JWT)
     → comms.js: encryption.init() + comms.connect(jwt) + comms.joinTalkgroup(talkgroup)
        → ForbiddenLANComms: uses MockRelaySocket
           → MockRelaySocket: echoes PTT_AUDIO back after 50ms
```

### 3.6 Audio pipeline (mobile side)

```
PTT press
  → startAudioStream() [audio.js]
     → Audio.requestPermissionsAsync()
     → Audio.setAudioModeAsync({ allowsRecordingIOS: true })
     → Audio.Recording.createAsync(LOW_QUALITY)  ← m4a/AAC, not Opus

PTT release
  → stopAudioStream() [audio.js]
     → recording.stopAndUnloadAsync()
     → FileSystem.readAsStringAsync(uri, Base64)
     → encryption.encrypt(base64)
     → comms.sendAudioChunk(encrypted)  ← single PTT_AUDIO message with full file

Receiving:
  → comms.js subscribe callback
     → PTT_AUDIO: decrypt + push to _accumulator[]
     → PTT_END: concatenate all chunks → write temp .m4a → Audio.Sound.createAsync → play
```

**Important:** Codec is m4a/AAC via `LOW_QUALITY` preset (~12kbps), **not Opus**. The memory file says Opus 8kbps — this is aspirational, not current. `Audio.RecordingOptionsPresets.LOW_QUALITY` is AAC.

### 3.7 Known gaps in mobile

| #   | File                   | Issue                                                                                                                       |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| M1  | `Channels.jsx:100–103` | In real mode, imports `socket` (which is `null`, line 79 of socket.js) and calls `socket.emit('list-channels')` → **crash** |
| M2  | `Channels.jsx:156–159` | Inline PTT `handlePTTToggle` has `// TODO: Start/stop audio capture` — no audio I/O wired                                   |
| M3  | `PTTScreen.jsx:41,46`  | Hardcoded `'user123'` passed to `emitStartTalking`/`emitStopTalking` — should be `CONFIG.DEVICE_ID`                         |
| M4  | `App.jsx`              | No LoginScreen in navigator — `LoginScreen.tsx` is dead code                                                                |
| M5  | `store/index.ts`       | Zustand store never used by any component — dead code                                                                       |
| M6  | `src/App.web.jsx`      | Legacy react-native-web entry, not in build, dead code                                                                      |
| M7  | `config.js:43`         | `DEVICE_ID` from `Math.random()` — new ID each launch                                                                       |

---

## 4. `packages/server` Audit

### 4.1 Framework and plugins

Fastify 4.26.0 with:

- `@fastify/cors` — all origins (not restricted)
- `@fastify/jwt` — HS256, secret from `JWT_SECRET` env (default: `'dev-secret'`)
- `@fastify/websocket` — wraps Fastify for WS handling

### 4.2 Route map

| Method | Path                      | File                 | DB client used      | Status     |
| ------ | ------------------------- | -------------------- | ------------------- | ---------- |
| POST   | `/auth/register`          | routes/auth.ts       | **Prisma**          | works      |
| POST   | `/auth/login`             | routes/auth.ts       | **Prisma**          | works      |
| POST   | `/auth/changepassword`    | routes/auth.ts       | **Prisma**          | works      |
| GET    | `/talkgroups`             | routes/talkgroups.ts | supabase stub       | **broken** |
| POST   | `/talkgroups`             | routes/talkgroups.ts | supabase stub       | **broken** |
| POST   | `/talkgroups/:id/join`    | routes/talkgroups.ts | supabase stub       | **broken** |
| GET    | `/talkgroups/:id/members` | routes/talkgroups.ts | supabase stub       | **broken** |
| GET    | `/devices`                | routes/devices.ts    | supabase stub       | **broken** |
| PATCH  | `/devices/:id/status`     | routes/devices.ts    | supabase stub       | **broken** |
| GET    | `/devices/:id/gps`        | routes/devices.ts    | supabase stub       | **broken** |
| GET    | `/keys/rotation`          | routes/keys.ts       | supabase stub       | **broken** |
| POST   | `/keys/rotate`            | routes/keys.ts       | supabase stub       | **broken** |
| —      | `/ws` (WebSocket)         | ws/hub.ts            | supabase stub (GPS) | partial    |
| —      | `/users`                  | **missing**          | —                   | **404**    |

### 4.3 The Supabase stub — root cause

`packages/server/src/db/supabase.ts`:

```ts
// temporary stub — replaced with Prisma client in step 3
export const supabase = {} as any;
```

Every route except auth imports this. All calls like `supabase.from('talkgroups').select(...)` will throw `TypeError: supabase.from is not a function` at runtime. The catch blocks in route handlers return empty arrays or 500 errors silently.

`packages/server/src/db/client.ts` (the real Prisma client):

```ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
export default prisma;
```

Only `routes/auth.ts` imports this. All other routes need to be migrated from `supabase` to `prisma`.

### 4.4 WebSocket hub (`ws/hub.ts`)

What it does:

- JWT auth via `?token=` query param on connect.
- Rooms: `Map<string, Set<WebSocket>>` keyed by talkgroup name.
- Fan-out: broadcasts all received messages to all members of the room.
- GPS: writes `GPS_UPDATE` messages to `supabase.from('gps_updates')` — **silently broken**.

What it does NOT do:

- No `PRESENCE` broadcast on connect/disconnect.
- No floor control arbitration (uses `floorControl.ts` zero times).
- No store-and-forward for offline devices (uses `storeForward.ts` zero times).
- No self-filter — sender receives their own PTT_AUDIO back.

### 4.5 Services — wiring status

| Service      | File                     | Exports                        | Called from |
| ------------ | ------------------------ | ------------------------------ | ----------- |
| keyRotation  | services/keyRotation.ts  | `rotateGroupKey(talkgroupId)`  | **nowhere** |
| storeForward | services/storeForward.ts | `bufferMessage`, `flushBuffer` | **nowhere** |

### 4.6 Prisma schema — key observations

```prisma
model Membership {
  user_id      String
  talkgroup_id String
  site         String        ← REQUIRED, no default
  ...
}
```

The `/talkgroups/:id/join` route does:

```ts
supabase.from("memberships").upsert({ user_id, talkgroup_id });
// Missing: site field
```

When ported to Prisma this will fail validation — `site` is required.

```prisma
model Talkgroup {
  master_secret    Bytes     ← stored, never distributed to clients
  rotation_counter Int       ← used for KDF versioning
}
```

The `master_secret` is generated on talkgroup creation (`randomBytes(32)`) and persisted. No endpoint returns it to mobile clients. The KDF flow (derive session key from `master_secret + talkgroup + rotation_counter`) has no client-side implementation and no server-side distribution mechanism.

### 4.7 Docker / deployment

`docker-compose.yml`: Postgres 16 + server. No portal service (portal is a static build).
`Dockerfile`: `node:20-alpine`, `npm install`, `prisma generate`, `entrypoint.sh`.

- Uses `npm install` (not pnpm) — correct, since Docker copies only `packages/server/package.json`.
- `entrypoint.sh` referenced but not audited (assumed: `prisma migrate deploy && node dist/index.js`).

### 4.8 Missing endpoint

Portal `Users.tsx` fetches `GET /users`. No such route exists. Will return 404.

### 4.9 Security gaps

- `GET /devices` and `PATCH /devices/:id/status` — JWT required but no role check. Any registered user can disable any device.
- CORS: `@fastify/cors` registered with no config → allows all origins. Acceptable for hackathon.
- JWT secret defaults to `'dev-secret'` if `JWT_SECRET` env not set.

---

## 5. `packages/portal` Audit

### 5.1 Stack

Vite 5 + React 18 + react-router-dom 6. No UI component library — all inline styles.

### 5.2 Pages

| Page       | Route         | API calls                                   | Notes                                                                     |
| ---------- | ------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| Dashboard  | `/dashboard`  | `GET /devices`                              | Shows active/total device count. Works once server device route is wired. |
| Devices    | `/devices`    | `GET /devices`, `PATCH /devices/:id/status` | Toggle active state. Works once supabase→prisma migration done.           |
| Talkgroups | `/talkgroups` | `GET /talkgroups`, `POST /talkgroups`       | Lists user's groups. Has shape mismatch — see below.                      |
| Users      | `/users`      | `GET /users`                                | **404** — route does not exist on server.                                 |

**Talkgroups shape mismatch:** The `GET /talkgroups` route returns `{ talkgroup_id, talkgroups: {...} }` (Supabase join syntax). Portal renders `g.talkgroups?.name ?? g.name`. When the route is ported to Prisma, the response shape will change — portal rendering will break.

### 5.3 Auth

- JWT stored in `localStorage` under key `'jwt'`.
- No login page in the portal. JWT must be manually inserted (e.g., `localStorage.setItem('jwt', '...')` in DevTools) or pasted in.
- Unopened: who calls `localStorage.setItem('jwt', ...)` — nothing in the portal codebase does. Portal is completely inaccessible to non-developers without a manual JWT injection step.

### 5.4 `@forbiddenlan/comms` dependency

Listed in `portal/package.json` but imported nowhere in the portal source. Likely added in anticipation of a live-connection status widget or map. Currently dead dependency.

---

## 6. Integration Points — Current vs Required

### 6.1 Mobile ↔ Server (WebSocket)

| Direction | Message       | Mobile                   | Server                   | Status                                        |
| --------- | ------------- | ------------------------ | ------------------------ | --------------------------------------------- |
| →         | `PTT_START`   | `comms.startPTT()`       | fan-out to room          | works (mock)                                  |
| →         | `PTT_AUDIO`   | `comms.sendAudioChunk()` | fan-out to room          | works (mock); **crash in real** (`.on()` bug) |
| →         | `PTT_END`     | after audio send         | fan-out to room          | works (mock)                                  |
| →         | `GPS_UPDATE`  | GPSPoller                | write to supabase        | **silently broken** (stub)                    |
| ←         | `PTT_AUDIO`   | decrypt + enqueue        | —                        | works (mock)                                  |
| ←         | `PTT_END`     | flush audio buffer       | —                        | works (mock)                                  |
| ←         | `PRESENCE`    | socket.js subscribes     | **never sent by server** | broken                                        |
| ←         | `FLOOR_GRANT` | comms onMessage          | **never sent by server** | unimplemented                                 |
| ←         | `SYNC_TIME`   | comms onMessage          | hub does echo            | works if implemented                          |

### 6.2 Mobile ↔ Server (REST)

| Action           | Mobile caller            | Endpoint             | Status                         |
| ---------------- | ------------------------ | -------------------- | ------------------------------ |
| Login            | (none — no login screen) | `POST /auth/login`   | server works; mobile not wired |
| Get talkgroups   | (none)                   | `GET /talkgroups`    | server broken (supabase stub)  |
| Get key rotation | (none)                   | `GET /keys/rotation` | server broken                  |

### 6.3 Portal ↔ Server (REST)

All portal API calls go through `fetch` with JWT from localStorage. All depend on server routes that are currently broken (supabase stub), except auth routes.

---

## 7. `docs/` Directory Audit

| File                     | Purpose                       | Accuracy                       |
| ------------------------ | ----------------------------- | ------------------------------ |
| `architecture.md`        | System overview               | Up to date post-Expo migration |
| `tradeoffs.md`           | Decision log                  | Up to date                     |
| `BACKEND_INTEGRATION.md` | Steps 1–8 for real backend    | Current and accurate           |
| `expo-migration.md`      | Why Vite → Expo               | Current                        |
| `expo-monorepo-audit.md` | Structural fixes (Expo)       | Current                        |
| `api-contracts.md`       | (not audited in this session) | —                              |
| `sequence-ptt.md`        | (not audited in this session) | —                              |

---

## 8. Known Drift & Inconsistencies

Listed by severity.

### CRITICAL — will crash or silently corrupt in real mode

| #   | Package | Location           | Issue                                                                                                              | Fix                                                                                                                              |
| --- | ------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| C1  | server  | `db/supabase.ts`   | All non-auth routes use `supabase = {} as any`. Every call throws `TypeError: supabase.from is not a function`.    | Replace all `supabase` imports in routes/talkgroups, routes/devices, routes/keys, ws/hub with Prisma client from `db/client.ts`. |
| C2  | comms   | `RelaySocket.ts`   | `.on('message', ...)` → crash in React Native (browser WebSocket has `.addEventListener` not `.on`).               | Replace all `.on()` calls with `.addEventListener()`. See BACKEND_INTEGRATION.md §Step 2.                                        |
| C3  | mobile  | `Channels.jsx:100` | `socket.emit('list-channels')` — `socket` default export is `null`. Crashes in real mode when `!CONFIG.MOCK_MODE`. | Replace with REST call to `GET /talkgroups` or remove the `socket.emit` block entirely.                                          |
| C4  | server  | (missing)          | Portal `GET /users` returns 404 — route handler not implemented.                                                   | Add `GET /users` route returning `users` from Prisma.                                                                            |

### HIGH — incorrect behaviour, no crash

| #   | Package | Location               | Issue                                                                                                           |
| --- | ------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| H1  | server  | `routes/talkgroups.ts` | `/join` endpoint missing `site` field — Prisma Membership insert will fail when supabase stub is replaced.      |
| H2  | server  | `ws/hub.ts`            | GPS writes go to supabase stub — GPS position tracking silently does nothing.                                   |
| H3  | server  | `ws/hub.ts`            | No PRESENCE broadcast on device connect/disconnect — mobile presence simulation is entirely fake.               |
| H4  | server  | `ws/hub.ts`            | Fan-out sends to all room members **including sender** — in real mode, transmitting device hears its own audio. |
| H5  | server  | `routes/devices.ts`    | No role check on `PATCH /devices/:id/status` — any authenticated user can disable any device.                   |
| H6  | mobile  | `PTTScreen.jsx:41,46`  | Hardcoded `'user123'` passed as device ID to `emitStartTalking`/`emitStopTalking`.                              |
| H7  | portal  | `pages/Talkgroups.tsx` | Response shape assumes Supabase join (`g.talkgroups.name`) — will break when route uses Prisma.                 |

### MEDIUM — gaps in design, not blockers for demo

| #   | Package | Location                   | Issue                                                                                                               |
| --- | ------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| M1  | server  | `services/storeForward.ts` | Store-and-forward implemented but never called from hub.ts.                                                         |
| M2  | server  | `services/keyRotation.ts`  | `rotateGroupKey()` never called; key rotation counter increments are done directly in route.                        |
| M3  | server  | `ws/floorControl.ts`       | `isTimestampValid()` never called; no server-side floor control.                                                    |
| M4  | comms   | `Talkgroup.master_secret`  | Generated and stored but never distributed to mobile clients. KDF flow has no endpoint.                             |
| M5  | mobile  | `store/index.ts`           | Zustand store (`jwt`, `activeTalkgroup`, `signalStatus`, `floorStatus`, `gps`) defined but unused by any component. |
| M6  | mobile  | `App.jsx`                  | `LoginScreen.tsx` exists but not in navigator. Auth flow entirely absent from mobile.                               |
| M7  | mobile  | `Channels.jsx:156`         | Inline PTT button has `// TODO` — no audio I/O wired in Channels (only PTTScreen wires audio).                      |
| M8  | portal  | `App.tsx`                  | No login page — JWT must be manually set in localStorage. Portal is inaccessible without DevTools.                  |
| M9  | mobile  | `audio.js:23`              | Records with `LOW_QUALITY` → m4a/AAC (~12kbps). Memory doc says Opus 8kbps but Opus is not implemented.             |

### LOW — housekeeping

| #   | Location                 | Issue                                                                                                    |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| L1  | `mobile/src/App.web.jsx` | Legacy react-native-web entry — dead code.                                                               |
| L2  | `portal/package.json`    | `@forbiddenlan/comms` listed as dependency but not imported anywhere in portal.                          |
| L3  | `server`                 | No `.env.example` — docker-compose env vars undocumented for new contributors.                           |
| L4  | `mobile`                 | `config.js` falls back to `VITE_*` env vars — these are never injected on native; fallback is confusing. |
| L5  | `server`                 | `@fastify/cors` has no origin restriction — acceptable for hackathon, not production.                    |

---

## 9. Open Questions

1. **What is `entrypoint.sh`?** Referenced in Dockerfile but not read. Likely `prisma migrate deploy && node dist/index.js` — confirm before deploying.

2. **Supabase migration plan?** The stub and schema naming suggest Supabase was planned as the DB. The Prisma schema is correct PostgreSQL. Is the intent to keep Prisma + self-hosted Postgres (as in docker-compose), or to switch to Supabase hosted? This affects whether `supabase.ts` should be reimplemented with `@supabase/supabase-js` or replaced entirely with Prisma queries.

3. **`Membership.site` field purpose?** The schema has `site String` on Membership — does this represent the physical site a user is attached to at the time of joining? It should be populated from the user's assigned Device.site at join time.

4. **EAS Build profile?** `packages/mobile/eas.json` exists. Does it have a `development` profile for custom dev client? If `react-native-webrtc` or native audio modules are added post-hackathon, Expo Go will no longer work and EAS Build with a dev client is required.

5. **Floor control on high-latency links?** As documented in tradeoffs.md, the 50ms collision window is irrelevant at 800ms satellite RTT. Is the intent to redesign floor control for satellite (e.g., TDMA time slots) or accept first-come-first-served?

6. **GPS source for mobile?** DLS-140 GPS is hardware-attached to the satellite modem. For cellular-only deployments, `expo-location` would provide phone GPS. Is this planned?

7. **`/users` endpoint scope?** Should this return all users (admin view) or just the current user's profile? The Portal's Users page shows a table of all users + roles, implying admin-only access.

---

## 10. Architecture Diagram (Current Actual State)

```
┌─────────────────────────────────────────────────────────────────┐
│ packages/mobile (Expo SDK 54, React Native)                      │
│                                                                   │
│  App.jsx                                                          │
│  ├── ChannelContext (current channel — simple state)              │
│  ├── Channels.jsx (hardcoded MOCK_CHANNELS, inline PTT TODO)      │
│  └── PTTScreen.jsx (PTT button → audio.js → comms.js)            │
│                                                                   │
│  utils/comms.js                                                   │
│  ├── ForbiddenLANComms (mock: MockRelaySocket loopback)           │
│  └── Encryption (AES-GCM, hardcoded test key)                     │
│                                                                   │
│  utils/audio.js (expo-av: m4a/AAC recording → base64)            │
│  config.js (EXPO_PUBLIC_* env vars, MOCK_MODE=true default)       │
│  store/index.ts (Zustand — defined, unused)                       │
└───────────────────────┬─────────────────────────────────────────┘
                        │ WebSocket (real mode only — broken: .on() bug)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ packages/server (Fastify, Prisma + Postgres)                     │
│                                                                   │
│  POST /auth/register|login|changepassword  ← Prisma (works)      │
│  GET|POST /talkgroups                      ← supabase stub (broken)│
│  GET|PATCH /devices/:id                   ← supabase stub (broken)│
│  GET|POST /keys                           ← supabase stub (broken)│
│  GET /users                               ← MISSING (404)         │
│                                                                   │
│  WebSocket hub.ts                                                 │
│  ├── JWT auth via ?token=                                         │
│  ├── Fan-out by talkgroup room (Map<string, Set<WebSocket>>)      │
│  ├── GPS_UPDATE → supabase stub (broken)                          │
│  ├── storeForward.ts (implemented, NOT wired)                     │
│  └── floorControl.ts (implemented, NOT wired)                     │
│                                                                   │
│  Postgres (docker-compose, Prisma schema)                         │
│  Tables: User, Device, Talkgroup, Membership, KeyRotation,       │
│          GpsUpdate                                                │
└───────────────────────┬─────────────────────────────────────────┘
                        │ REST (fetch + Bearer JWT)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ packages/portal (Vite + React, admin UI)                         │
│                                                                   │
│  Dashboard → GET /devices                                         │
│  Devices   → GET /devices, PATCH /devices/:id/status             │
│  Talkgroups→ GET /talkgroups, POST /talkgroups                   │
│  Users     → GET /users (404)                                     │
│                                                                   │
│  Auth: JWT in localStorage, no login screen                       │
└─────────────────────────────────────────────────────────────────┘

packages/comms — shared library, imported by mobile + server + portal
  ForbiddenLANComms, RelaySocket, MockRelaySocket, AudioPipeline,
  Encryption, FloorControl, GPSPoller, DLS140Client, types
```

---

## 11. Recommended Fix Order (for next session)

Priority based on blast radius and demo impact.

### Step 1 — Replace supabase stub with Prisma (unblocks all REST routes)

**Files:** `server/src/routes/talkgroups.ts`, `devices.ts`, `keys.ts`, `ws/hub.ts`
**Action:** Replace `import { supabase } from '../db/supabase.js'` with `import prisma from '../db/client.js'`, rewrite all queries in Prisma syntax. Fix `Membership` upsert to include `site`.

### Step 2 — Fix `RelaySocket.ts` `.on()` → `.addEventListener()` (unblocks real WebSocket)

**Files:** `comms/src/RelaySocket.ts`
**Action:** See BACKEND_INTEGRATION.md §Step 2 for exact replacement.

### Step 3 — Add `/users` route to server (unblocks portal Users page)

**Files:** `server/src/routes/auth.ts` or a new `users.ts`
**Action:** `GET /users` → `prisma.user.findMany({ select: { id, username, role } })` (exclude password_hash). Admin-role check.

### Step 4 — Add PRESENCE broadcast to hub (unblocks live user presence)

**Files:** `server/src/ws/hub.ts`
**Action:** On WS connect/disconnect, broadcast `{ type: 'PRESENCE', talkgroup, online: [...deviceIds] }` to room.

### Step 5 — Add LoginScreen to mobile navigator (unblocks real auth)

**Files:** `mobile/src/App.jsx`, `mobile/src/screens/LoginScreen.tsx`
**Action:** Add LoginScreen as initial route; on login call `connectComms(jwt)`, set Zustand `jwt`, navigate to Channels.

### Step 6 — Fix self-echo in hub (correctness for multi-device)

**Files:** `server/src/ws/hub.ts`
**Action:** In fan-out loop, skip `ws === sender`.

### Step 7 — Wire inline PTT in Channels.jsx (audio from Channels screen)

**Files:** `mobile/src/screens/Channels.jsx`
**Action:** Replace `// TODO` in `handlePTTToggle` with `startAudioStream()`/`stopAudioStream()`.

### Step 8 — Add portal login screen

**Files:** `portal/src/pages/Login.tsx` (new), `portal/src/App.tsx`
**Action:** POST `/auth/login` → store JWT in localStorage → redirect to dashboard.
