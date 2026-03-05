# Local Dev Bootstrap (Monorepo)

One-command first-time setup for local development.

## Command

```bash
pnpm setup:local        # or: pnpm setup:doctor
```

## Prerequisites

| Tool        | Version   | Why                                      |
| ----------- | --------- | ---------------------------------------- |
| Node.js     | 20+       | Runtime for server, Metro bundler, Nx    |
| npm         | (bundled) | Bootstraps Corepack                      |
| JDK         | 17+       | Gradle builds for Android native modules |
| Android SDK | API 34+   | Expo bare workflow + native Opus codecs  |

The script validates all of these and exits early (or warns) if something is missing.

## What it does (9 steps)

| #   | Step                                                     | Blocking? |
| --- | -------------------------------------------------------- | --------- |
| 1   | Validate Node 20+, npm                                   | Yes       |
| 2   | Enable Corepack, activate `pnpm@10.23.0`                 | Yes       |
| 3   | `pnpm install --frozen-lockfile` + verify Nx             | Yes       |
| 4   | Build `@forbiddenlan/comms` SDK (`packages/comms/dist/`) | Yes       |
| 5   | `prisma generate` for server's `@prisma/client`          | Yes       |
| 6   | Seed `.env` from `.env.example` if missing               | No        |
| 7   | Install Playwright chromium browsers                     | No        |
| 8   | Raise inotify limits on Linux (for Metro/Turbopack)      | No        |
| 9   | Validate Android toolchain + `expo prebuild`             | No        |

Steps 1–5 are blocking — the workspace won't function without them.  
Steps 6–9 are best-effort warnings.

## Why each step matters

- **Step 4 (build comms)**: Mobile depends on `@forbiddenlan/comms` via `workspace:*`. Without prebuilding, Metro can't resolve the compiled JS and you get "module not found" errors on first run.
- **Step 5 (prisma generate)**: The server imports `@prisma/client` which needs a generated client matching the schema. Without this, the server crashes on startup with `Cannot find module '.prisma/client'`.
- **Step 6 (seed .env)**: The mobile app reads `EXPO_PUBLIC_WS_URL` etc. from `.env`. If the file is missing (fresh clone), config.js falls back to `localhost` which won't work on a physical device.
- **Step 7 (Playwright)**: E2E tests (`pnpm test:e2e`) need Chromium. Without it you get `browserType.launch: Executable doesn't exist`.
- **Step 8 (inotify)**: Metro on Linux watches source files via inotify. Default limit (8192) is too low for a monorepo with `node_modules` — causes `ENOSPC: no space left on device` errors.

## Typical first-run flow

```bash
# 1) Clone and bootstrap
git clone <repo-url> && cd TheForbiddenLAN
pnpm setup:local

# 2) Edit .env with the correct server URL
vim packages/mobile/.env
#    EXPO_PUBLIC_WS_URL=ws://134.122.32.45:3000/ws
#    EXPO_PUBLIC_API_URL=http://134.122.32.45:3000

# 3) Start dev
./run-android.sh        # native Android build on device/emulator
pnpm dev:admin          # admin panel in browser at http://localhost:8081
pnpm dev:docs           # documentation site at http://localhost:3000

# Login as admin/admin → admin tabs (Dashboard, Devices, Talkgroups, Users)
# Login as pilot1/test  → PTT screen (existing user flow)

# 4) Run tests
pnpm test:e2e           # Playwright E2E
```

## Environment Variables

### Mobile (`packages/mobile/.env`)

| Variable                 | Example                      | Purpose                                       |
| ------------------------ | ---------------------------- | --------------------------------------------- |
| `EXPO_PUBLIC_WS_URL`     | `ws://134.122.32.45:3000/ws` | WebSocket relay URL                           |
| `EXPO_PUBLIC_API_URL`    | `http://134.122.32.45:3000`  | REST API (login, talkgroups)                  |
| `EXPO_PUBLIC_DLS140_URL` | `http://192.168.111.1:3000`  | DLS-140 SATCOM terminal URL                   |
| `EXPO_PUBLIC_TALKGROUP`  | `alpha`                      | Default talkgroup to join                     |
| `EXPO_PUBLIC_LOOPBACK`   | `false`                      | Echo TX audio locally (single-device testing) |

### Server (`packages/server/.env`)

| Variable            | Example    | Purpose                     |
| ------------------- | ---------- | --------------------------- |
| `POSTGRES_USER`     | `skytalk`  | Postgres username           |
| `POSTGRES_PASSWORD` | `(secret)` | Postgres password           |
| `POSTGRES_DB`       | `skytalk`  | Database name               |
| `JWT_SECRET`        | `(secret)` | HMAC secret for JWT signing |

## Admin Panel

The admin panel is built into `packages/mobile/` using React Native + NativeWind. It runs in the browser via Expo Web.

```bash
pnpm dev:admin          # starts Metro + opens http://localhost:8081
```

Login with an admin account (`admin` / `admin` on the dev server) to see:
- **Dashboard** — user/device/talkgroup stats
- **Devices** — enable/disable devices
- **Talkgroups** — create/delete talkgroups, view members
- **Users** — register new users

Regular users (`pilot1` / `test`) skip the admin tabs and go straight to the PTT screen.

`packages/portal/` (old Vite web admin) is no longer used — the mobile app replaced it.

## Documentation Site

Next.js + Fumadocs app in `packages/docs/`.

```bash
pnpm dev:docs           # http://localhost:3000
```

Add new docs as `.mdx` files in `packages/docs/content/docs/`:

```yaml
---
title: Page Title
description: Short description
---
## Content here
```

## Notes

- If `corepack` is missing, the script installs it globally via npm.
- Android checks are warnings (non-blocking) so web/server-only developers can still bootstrap.
- For detailed Android troubleshooting, see [MOBILE_SETUP_TROUBLESHOOTING.md](./MOBILE_SETUP_TROUBLESHOOTING.md).
- The `run-android.sh` script applies kernel tuning (inotify, ulimit) automatically before launching Metro.

## Troubleshooting

| Problem                                        | Cause                       | Fix                                                                       |
| ---------------------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| `Cannot find module '@forbiddenlan/comms'`     | comms SDK not built         | `pnpm --filter @forbiddenlan/comms build`                                 |
| `Cannot find module '.prisma/client'`          | Prisma client not generated | `cd packages/server && npx prisma generate`                               |
| `ENOSPC: no space left on device`              | inotify limit too low       | `sudo sysctl -w fs.inotify.max_user_watches=2097152`                      |
| `browserType.launch: Executable doesn't exist` | Playwright browsers missing | `npx playwright install --with-deps`                                      |
| `Metro bundler symlink error`                  | PNPM symlinks not resolved  | Check `metro.config.js` has `unstable_enableSymlinks: true`               |
| `OpusEncoder native module not found`          | Native rebuild needed       | `cd packages/mobile && npx expo prebuild --clean && npx expo run:android` |
| Port 3000/8081 in use                          | Previous process lingering  | `lsof -ti:3000 \| xargs kill -9`                                          |

For more, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
