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

### One-command local bootstrap (recommended)

```sh
pnpm setup:local
```

This command enables Corepack, activates pinned `pnpm@10.23.0`, installs workspace dependencies, and performs Android environment sanity checks.

See [docs/LOCAL_DEV_BOOTSTRAP.md](docs/LOCAL_DEV_BOOTSTRAP.md) for details.

## Running the Android App

```sh
./run-android.sh  # starts emulator and builds APK
```

See [docs/MOBILE_SETUP_TROUBLESHOOTING.md](docs/MOBILE_SETUP_TROUBLESHOOTING.md) for detailed setup instructions, common issues, and debugging tips.

## UI Development (Mobile App)

**For Maisam & Annie:** See [docs/UI_DEVELOPMENT_GUIDE.md](docs/UI_DEVELOPMENT_GUIDE.md) for:
- Where to put your UI code (screens, components, styling)
- Page flow and navigation structure
- Theme system and styling guide
- React Native basics and common UI tasks
- What NOT to touch (backend integration files)

## Commands
```sh
pnpm setup:local       # First-time local setup (enables Corepack, installs deps)
pnpm dev:server        # start relay server
pnpm dev:mobile        # start mobile app in browser
pnpm dev:web           # start web portal
pnpm dev:docs          # start documentation site (Fumadocs)
pnpm build:comms       # build shared comms library
pnpm build:all         # build everything
pnpm nx graph          # view dependency graph
```

## Architecture
See docs/ for full architecture, sequence diagrams, and API contracts.
