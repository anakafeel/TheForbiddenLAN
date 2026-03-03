# What We Built — SkyTalk Backend Server

**Date:** 2026-03-02
**Owner:** Shri (infra/devops)
**Package:** `packages/server`

This is a plain-language account of how the backend server was built, what it does, the problems we ran into, and how things work under the hood. Written for a future reader who inherits this code.

---

## The Goal

Build a relay server that:

- Handles user auth (register, login, JWT issuance)
- Manages talkgroups and device records in a Postgres database
- Relays push-to-talk audio and presence over WebSocket to all members of a talkgroup
- Exposes a REST API for the mobile app and web admin portal to consume

The server runs on a DigitalOcean droplet and is reachable by client devices through the internet. Because the satellite link (Iridium Certus via DLS-140) is carrier-grade NAT with no inbound port forwarding, every client connects outbound to this server — nothing connects directly device-to-device.

---

## The Stack

### Fastify
HTTP framework for Node.js. We chose it over Express because it has native TypeScript support and built-in plugins for JWT and WebSocket. Everything is structured as a Fastify plugin — routes are registered via `app.register()`, which lets them be isolated into separate files.

### TypeScript
Same language as the rest of the monorepo. Compiled to plain JavaScript before running. `tsc` handles the build; `tsx` is used in development to run TypeScript directly without a compile step.

### Prisma
ORM (Object-Relational Mapper) — a TypeScript library that lets you query Postgres using generated type-safe functions instead of writing raw SQL. The schema lives in `prisma/schema.prisma`. After any schema change, two commands are needed:
- `npx prisma generate` — regenerates the TypeScript client from the schema
- `npx prisma db push` — syncs the schema to the actual Postgres database (creates/alters tables)

### Postgres 16
The actual database. Runs in Docker. Holds all persistent state: users, devices, talkgroups, memberships, key rotation history, GPS updates.

### Docker Compose
Orchestrates two containers: one for Postgres and one for the Node.js server. On startup, the server container runs `prisma db push` (via `entrypoint.sh`) to ensure the schema is in sync, then starts the server.

### JWT (`@fastify/jwt`)
JSON Web Tokens — the auth mechanism. When a user logs in or registers, the server signs a token containing their user ID, username, and role. The client sends that token in the `Authorization: Bearer <token>` header on every protected request. The server verifies the signature and reads the claims — no database lookup needed to auth a request.

---

## Database Schema

Six tables. All defined in `prisma/schema.prisma`.

**Device** — a physical satellite radio. Has a serial number, site, and active flag.

**User** — someone who logs in. Linked 1:1 to a Device (nullable — admin users may not have a device). Stores username and bcrypt-hashed password. Role is `"admin"` or `"user"`.

**Talkgroup** — a channel. Stores a 32-byte `master_secret` (used as input to a key derivation function so clients can compute encryption keys). Also stores a `rotation_counter` that increments when the key is rotated.

**Membership** — join table between users and talkgroups. Composite primary key of `(user_id, talkgroup_id)`. Also stores the user's `site` at time of joining.

**KeyRotation** — audit log. Every time a talkgroup key is rotated, a row is written here with the new counter value and timestamp.

**GpsUpdate** — location history. Each GPS position from a device is stored as a new row. The latest one is retrieved with `findFirst` ordered by `updated_at desc`.

---

## How Auth Works

Registration (`POST /auth/register`):
1. Accepts `username`, `password`, and optionally `deviceSerial` and `site`.
2. If `deviceSerial` is provided, looks up or creates the device record and links it to the new user.
3. Hashes the password with bcrypt (cost 10).
4. Creates the user with role `"user"` by default.
5. Signs and returns a JWT containing `{ sub: userId, username, role }`.

Login (`POST /auth/login`):
1. Looks up the user by username.
2. Compares the submitted password against the stored hash using `bcrypt.compare`.
3. Signs and returns a JWT.

**Important:** The register route always creates users as role `"user"`. To make someone an admin, either:
- Run the seed script (`npx tsx prisma/seed.ts`) which creates admin/admin as role admin.
- Or update the row directly: `UPDATE "User" SET role = 'admin' WHERE username = 'admin';`

The seed script uses `upsert` with `update: { role: 'admin' }` so re-running it will fix the role on an existing admin user.

---

## How the REST Routes Work

All protected routes use a Fastify `onRequest` hook that calls `req.jwtVerify()`. If the token is missing or invalid, the request gets a 401 before reaching the handler.

Admin-only routes additionally check `(req.user as any).role !== 'admin'` and return 403 if the caller is a regular user.

**Talkgroups (`src/routes/talkgroups.ts`)**
- `GET /` — returns talkgroups the calling user is a member of (via Membership join)
- `POST /` — admin only. Creates a talkgroup with a random 32-byte `master_secret`.
- `POST /:id/join` — upserts a Membership row. The `site` is pulled from the user's linked device. Defaults to `"unknown"` if no device is linked.
- `DELETE /:id/leave` — deletes the Membership row.
- `GET /:id/members` — returns the users who are members of a talkgroup.
- `DELETE /:id` — admin only. Deletes the talkgroup (cascades to memberships).

**Devices (`src/routes/devices.ts`)**
- `GET /` — admin only. Lists all devices.
- `PATCH /:id/status` — admin only. Sets the `active` flag to true or false.
- `GET /:id/gps` — returns the most recent GPS update for a device.
- `POST /:id/gps` — stores a new GPS update.

**Keys (`src/routes/keys.ts`)**
- `GET /rotation?talkgroupId=x` — returns the current `rotation_counter` for a talkgroup.
- `POST /rotate` — admin only. Atomically increments the counter and writes a `KeyRotation` audit log entry, all in a single Prisma `$transaction`.

**Users (`src/routes/users.ts`)**
- `GET /` — admin only. Returns all users (id, username, role, created_at, device_id). Never returns `password_hash`.

---

## The Supabase Migration — Why Most Routes Were Broken

The project started with a plan to use Supabase (managed Postgres) but switched to self-hosted Postgres + Prisma. The auth routes (`src/routes/auth.ts`) were migrated to Prisma early. Everything else was left with this stub:

```typescript
// src/db/supabase.ts
export const supabase = {} as any;
```

Routes imported this and called `supabase.from('talkgroups').select()`. Since `supabase = {}`, calling `.from()` on it throws `TypeError: supabase.from is not a function` at runtime. The code compiled fine with no errors because TypeScript sees `{} as any` as valid for anything.

The fix for every broken route was the same pattern:
1. Delete the `import { supabase }` line.
2. Add `import prisma from '../db/client.js'`.
3. Rewrite every query using the Prisma API.

---

## How the WebSocket Hub Works

Clients connect to `ws://server:3000/ws?token=<jwt>`. The server verifies the JWT on connect and closes the socket with code 1008 if invalid.

Three in-memory Maps track state:
- `rooms` — maps talkgroup ID → Set of active WebSocket connections in that talkgroup
- `socketUser` — maps WebSocket → `{ userId, deviceId }` for the connected client
- `socketRooms` — maps WebSocket → Set of talkgroup IDs the client has joined

When a client sends `JOIN_TALKGROUP`, the socket is added to the room and `PRESENCE` is broadcast to all sockets in the room (including the joining socket itself), listing every online user ID.

When a client sends `PTT_START`, `PTT_AUDIO`, `PTT_END`, or `TEXT_MSG`, the message is fanned out to all other sockets in the talkgroup — the sender does not receive their own message back (self-echo prevention).

When a client disconnects, the socket is removed from all rooms and `PRESENCE` is broadcast with the updated member list.

**No floor arbitration on the server.** The server blindly relays PTT messages. Floor control (who gets to speak when two people key up at the same time) is resolved client-side using a deterministic algorithm: if two `PTT_START` messages arrive within 50ms, the client with the lower GPS timestamp wins. Tiebreaker: lexicographically smaller UUID. This avoids the satellite round-trip (800–1500ms) that server-granted floor control would require.

---

## A Bug We Hit: `@fastify/websocket` SocketStream

This took a while to find. The hub was written assuming the WebSocket handler receives a raw `ws.WebSocket` as its first argument:

```typescript
app.get('/ws', { websocket: true }, async (socket, req) => {
  socket.on('message', ...)  // never fired
  if (s.readyState === 1) s.send(msg)  // never true — readyState was undefined
})
```

We added debug logging and discovered `readyState: undefined`. A raw `ws.WebSocket` always has `readyState` as a number (0–3). `undefined` meant the `socket` parameter was not the raw WebSocket — it was a `SocketStream`, a Node.js Duplex stream wrapper that `@fastify/websocket` v8 passes as the connection object. The actual WebSocket is at `connection.socket`.

The fix:
```typescript
app.get('/ws', { websocket: true }, async (connection, req) => {
  const socket: WebSocket = (connection as any).socket;
  // now socket.readyState, socket.on('message'), socket.send() all work correctly
})
```

---

## Seed Script

`prisma/seed.ts` creates the initial development data:
- User: `admin` / `admin` — role admin
- User: `pilot1` / `test` — role user
- Talkgroup: `Ground Ops` — with a random 32-byte master_secret
- Both users added as members of Ground Ops

Run it after the server is up:
```bash
docker compose exec server npx tsx prisma/seed.ts
```

The seed uses `upsert` (not `create`) so it's safe to run multiple times without errors.

---

## Deployment Process

The server runs on a DigitalOcean droplet (Ubuntu, 2 vCPU, 4GB RAM). Process:

1. Push code changes to the `main` branch.
2. SSH into the droplet, pull the latest code.
3. From `packages/server/`: `docker compose up --build -d`
4. Docker builds the image (TypeScript compile + prisma generate), starts the containers. The Postgres container starts first (healthcheck), then the server container runs `prisma db push` and starts listening on port 3000.

The `.env` file in `packages/server/` on the droplet holds the real credentials. It is not in source control. Required vars:
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `JWT_SECRET`
- `DATABASE_URL` — must match the above: `postgresql://<user>:<pass>@db:5432/<db>`

---

## Tools Used for Testing

**curl** — HTTP test client. Used to test every REST endpoint directly from the droplet shell.

Things that bit us with curl:
- Backslash line continuation (`\`) only works when it is the very last character before a newline. A space after the backslash breaks it silently. When in doubt, just write the full curl command on one line.
- The `$JWT` variable is per-shell. Zellij panes are separate shells — the variable set in pane A doesn't exist in pane B. Re-run the login command in each new pane.

**wscat** — WebSocket CLI client. Installed via `npm install -g wscat`. Used to test the WebSocket hub interactively.

Connect: `wscat -c "ws://localhost:3000/ws?token=$JWT"`

Received messages appear prefixed with `< `. Sent messages are prefixed with `> `. If a sent message gets no response when one is expected, check the server logs with `docker compose logs server -f` — errors in the message handler will appear there.

**zellij** — terminal multiplexer (similar to tmux). Used on the droplet to keep multiple panes open simultaneously: one for server logs, one for admin wscat, one for pilot1 wscat. This made WebSocket fan-out testing straightforward.

---

## Files Changed / Created

| File | What |
|------|------|
| `src/routes/auth.ts` | Was already on Prisma. No changes. |
| `src/routes/talkgroups.ts` | Rewritten — supabase → Prisma. Added `DELETE /:id/leave` and `DELETE /:id`. |
| `src/routes/devices.ts` | Rewritten — supabase → Prisma. Added `POST /:id/gps`. Added admin checks. |
| `src/routes/keys.ts` | Rewritten — supabase → Prisma. Replaced `supabase.rpc()` with `$transaction`. |
| `src/routes/users.ts` | Created — new `GET /users` admin endpoint. |
| `src/services/keyRotation.ts` | Rewritten — supabase → Prisma. |
| `src/ws/hub.ts` | Rewritten — GPS writes using Prisma, self-echo prevention, explicit JOIN/LEAVE, PRESENCE broadcast on connect/disconnect, TEXT_MSG fan-out. Fixed SocketStream API bug. |
| `src/index.ts` | Added `userRoutes` registration. |
| `prisma/seed.ts` | Created — admin, pilot1, Ground Ops talkgroup. |

---

## What Isn't Done Yet

- **nginx + SSL** — teammates are currently hitting the server over plain HTTP. nginx reverse proxy and a Let's Encrypt cert are the next infra step.
- **Store-and-forward** — `src/services/storeForward.ts` has buffer logic implemented but it isn't wired into the hub. Needed for devices that go offline mid-transmission.
- **Key distribution** — the server stores `master_secret` per talkgroup and increments `rotation_counter` on rotate, but no endpoint distributes derived keys to clients. The KDF inputs are available; the client-side key derivation flow isn't implemented yet.
