# TheForbiddenLAN — Satellite PTT System
SKYTRAC Hackathon 2026

## Packages
- `@forbiddenlan/comms`  — Saim. Communication layer: DLS-140 API client, WebSocket relay, audio pipeline, floor control, GPS polling
- `@forbiddenlan/server` — Shri. Fastify relay server on DigitalOcean. Auth, talkgroup management, WebSocket hub, key rotation
- `@forbiddenlan/mobile` — Maisam + Annie. Capacitor + React PTT mobile app
- `@forbiddenlan/portal` — Maisam + Annie. React web portal for device/talkgroup management

## Setup (first time)

This repo pins pnpm via `"packageManager"` in `package.json`. Corepack reads that
field and installs the exact version automatically so everyone gets the same toolchain.

```sh
corepack enable   # one-time, system-wide — activates corepack shims
pnpm install      # corepack intercepts and uses pnpm@10.23.0 automatically
```

No global `npm install -g pnpm` needed. If corepack isn't available, upgrade Node to 20+.

## Commands
```sh
pnpm dev:server        # start relay server
pnpm dev:mobile        # start mobile app in browser
pnpm dev:portal        # start web portal
pnpm build:comms       # build shared comms library
pnpm build:all         # build everything
pnpm nx graph          # view dependency graph
```

## Architecture
See docs/ for full architecture, sequence diagrams, and API contracts.
