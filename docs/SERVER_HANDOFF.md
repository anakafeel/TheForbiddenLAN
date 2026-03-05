# Server Work — Session Handoff

**Last updated**: 2026-03-04
**Branch**: shri
**Working directory**: packages/server

---

## How to use this file

Open a new Claude Code chat in `TheForbiddenLAN/` and say:

> "Read docs/SERVER_HANDOFF.md and pick up where the last session left off. Work in packages/server."

Claude Code auto-loads `CLAUDE.md` (project instructions, stack decisions, interface contracts, DB schema). This file adds session-specific state on top of that.

---

## Two plans exist — know the difference

### Plan A: v1 REST + Prisma (CLAUDE.md, "WHAT TO DO NEXT" section)
- **Status**: IN PROGRESS — this is what we're building right now
- **Goal**: Get a working server with all REST endpoints + WebSocket hub so teammates (Saim, Maisam, Annie) can build against it
- **Steps 1–8** are defined in CLAUDE.md under "WHAT TO DO NEXT"
- This is the **hackathon deliverable**

### Plan B: v2 Distributed Architecture (docs/distributed-architecture.md)
- **Status**: PROPOSED — not started, depends on v1 being done first
- **Goal**: Replace REST CRUD with operation-log + device-side SQLite for offline support and signed admin ops
- **Do NOT start this until Plan A Steps 1–7 are complete and curl-tested**
- Read the full doc at `docs/distributed-architecture.md` before starting

---

## Current progress (Plan A)

| Step | Description | Status |
|------|-------------|--------|
| 1 | Verify auth works (curl-test register/login) | NOT STARTED |
| 2 | Migrate talkgroups.ts to Prisma + add missing routes | NOT STARTED |
| 3 | Migrate devices.ts to Prisma + add missing route + admin checks | NOT STARTED |
| 4 | Migrate keys.ts to Prisma + fix keyRotation.ts | NOT STARTED |
| 5 | Add GET /users route (admin-only) | NOT STARTED |
| 6 | Write seed script (prisma/seed.ts) | NOT STARTED |
| 7 | Fix WebSocket hub (GPS, self-echo, JOIN/LEAVE, PRESENCE, TEXT_MSG, PTT) | NOT STARTED |
| 8 | nginx + SSL on droplet | NOT STARTED |

**Update this table as you complete steps.** Whoever picks this up should start from the first NOT STARTED step.

---

## The one thing to know

The root cause of most breakage is `src/db/supabase.ts` — it exports `{} as any`. Files that import it compile but crash at runtime. The fix pattern for every broken file:

1. Delete the `import { supabase } from '../db/supabase'` line
2. Add `import { prisma } from '../db/client'`
3. Rewrite queries from `supabase.from('table').select()` to `prisma.table.findMany()` etc.

Auth routes (`src/routes/auth.ts`) are already migrated. Everything else still uses the stub.

---

## Files that need work

### Broken (supabase stub — runtime crash)
- `src/routes/talkgroups.ts` — all routes
- `src/routes/devices.ts` — all routes
- `src/routes/keys.ts` — all routes
- `src/services/keyRotation.ts`
- `src/ws/hub.ts` — GPS_UPDATE handler only

### Missing (not implemented)
- `DELETE /talkgroups/:id/leave`
- `DELETE /talkgroups/:id`
- `POST /devices/:id/gps`
- `GET /users` (new route file needed)
- Admin role checks on: `GET /devices`, `PATCH /devices/:id/status`, `POST /talkgroups`
- Hub: explicit JOIN/LEAVE_TALKGROUP, PRESENCE broadcast, self-echo fix, TEXT_MSG fan-out

### Working (don't touch unless needed)
- `src/index.ts`
- `src/db/client.ts`
- `src/routes/auth.ts`
- `prisma/schema.prisma`
- `docker-compose.yml`, `Dockerfile`, `entrypoint.sh`

---

## Key rules (from CLAUDE.md, repeated here for emphasis)

- **NO git commands** — Shri commits manually, doesn't want Claude in the git log
- **NO Supabase** — we use Prisma + Postgres directly
- **NO Express** — we use Fastify
- **Work in packages/server only** — ignore other packages
- **Interface contracts are locked** — don't change REST paths or WebSocket message formats without team discussion
- **Floor control is client-side** — server just relays PTT_START, never grants/denies floor
- **Explain TS/Prisma/Fastify concepts** — Shri is infra/devops, not a JS dev
