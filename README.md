# TheForbiddenLAN — Satellite PTT System
SKYTRAC Hackathon 2026 

## Packages
- `@skytalk/comms`  — Saim. Communication layer: DLS-140 API client, WebSocket relay, audio pipeline, floor control, GPS polling
- `@skytalk/server` — Shri. Fastify relay server on DigitalOcean. Auth, talkgroup management, WebSocket hub, key rotation
- `@skytalk/mobile` — Maisam + Annie. Capacitor + React PTT mobile app
- `@skytalk/portal` — Maisam + Annie. React web portal for device/talkgroup management

## Commands
  pnpm dev:server        # start relay server
  pnpm dev:mobile        # start mobile app in browser
  pnpm dev:portal        # start web portal
  pnpm build:comms       # build shared comms library
  pnpm build:all         # build everything
  pnpm nx graph          # view dependency graph

## Architecture
See docs/ for full architecture, sequence diagrams, and API contracts.
