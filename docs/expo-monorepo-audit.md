# Expo Monorepo Audit — Engineering Log

**Date:** 2026-03-02
**Context:** Post-migration audit of Expo SDK 54 integration inside the Nx + PNPM monorepo.
See [`expo-migration.md`](./expo-migration.md) for why Expo was chosen over alternatives.

---

## Why This Audit Was Needed

The Expo migration (Vite → Expo Go) introduced correct _package-level_ Expo config but left several
structural errors at the _monorepo_ level. These were not caught during migration because `expo start`
appeared to work locally in one session, but contained latent failures:

- `nx serve mobile` silently ran Vite (dead executor), not Expo.
- A root-level `app.json` stub was staged, which would cause any fresh `expo` CLI invocation
  from the repo root to detect the wrong project root.
- `@forbiddenlan/comms` resolution depended on a pre-built `dist/` that was never reliably present.
- A dangerous env var (`EXPO_NO_SYMLINK_RESOLUTION=1`) existed in `.env.metro` that, if sourced,
  would silently break the entire workspace dependency graph.

---

## Problems Found and Fixed

### 1. Root `app.json` — Deleted

**File:** `/app.json` (monorepo root, was untracked/staged)

**Content it had:**
```json
{ "expo": { "extra": { "eas": { "projectId": "f3bbbbfc-..." } } } }
```

**Why it was wrong:**
Expo CLI walks up the directory tree from the current working directory to find the nearest
`app.json` containing an `"expo"` key. The root stub satisfied that condition before
`packages/mobile/app.json` was reached. This made the monorepo root the detected Expo project
root, causing `expo start` (run from root or by CI/EAS) to look for `index.js` at the repo root
rather than inside `packages/mobile/`.

The EAS `projectId` it contained is already present in the correct location:
`packages/mobile/app.json` under `expo.extra.eas.projectId`.

**Fix:** Deleted the root `app.json`.

---

### 2. Root `eas.json` — Deleted

**File:** `/eas.json` (monorepo root, was staged as new file)

**Why it was wrong:**
EAS CLI applies the same project root detection logic as Expo CLI. With `eas.json` at the repo
root, `eas build` run from anywhere above `packages/mobile/` would target the wrong root — where
there is no `app.json` (after fix #1), no `index.js`, and no bundler entry point. EAS builds
would fail with a confusing "no entry point found" error rather than a clear config mismatch.

`packages/mobile/eas.json` is the correct and only location. EAS must be run from there:
```bash
cd packages/mobile && eas build --profile development
```

**Fix:** Deleted the root `eas.json`.

---

### 3. `packages/mobile/project.json` — Nx Targets Replaced

**Why it was wrong:**
The `serve` and `build` Nx targets used `@nx/vite:dev-server` and `@nx/vite:build` executors.
Vite was removed during the Expo migration. `nx serve mobile` (called by `pnpm dev:mobile`) was
silently invoking Vite instead of `expo start`, and failing or producing a browser bundle
with no connection to the native app.

**Fix:** Replaced all targets with `nx:run-commands` calling Expo CLI directly:

| Nx Target | Command | Notes |
|---|---|---|
| `nx serve mobile` | `expo start` | Metro + QR code for Expo Go |
| `nx run mobile:android` | `expo start --android` | Requires Android SDK on host |
| `nx run mobile:ios` | `expo start --ios` | macOS + Xcode only |
| `nx run mobile:export` | `expo export --platform all` | Static bundle; depends on `^build` (comms must be built first) |
| `nx run mobile:lint` | ESLint | Unchanged |

All targets set `cwd: packages/mobile` so Expo CLI resolves config from the correct project root.

---

### 4. `packages/mobile/metro.config.js` — Three Additions

#### 4a. `unstable_enableSymlinks: true`

PNPM creates symlinks for `workspace:*` dependencies. Without this flag, Metro on Linux may not
follow those symlinks reliably, causing `@forbiddenlan/comms` to appear unresolvable even though
`packages/mobile/node_modules/@forbiddenlan/comms → packages/comms` exists on disk.

#### 4b. `unstable_enablePackageExports: true`

`packages/comms/package.json` has an `"exports"` field. Without this flag, Metro ignores `exports`
and falls back to `"main": "./dist/index.js"`. This would require a pre-built dist. With this flag,
Metro respects the exports map (future-proofing for condition-based exports).

#### 4c. `@forbiddenlan/comms` source redirect in `resolveRequest`

```js
if (moduleName === "@forbiddenlan/comms") {
  return { type: "sourceFile", filePath: path.resolve(commsRoot, "src/index.ts") };
}
```

**Why:** `packages/comms` has `"type": "module"` and its TypeScript config inherits
`"module": "ESNext"` from the root, so `dist/index.js` is an ES module. Metro can process ESM
via Babel transformation, but only if `dist/` exists. In dev, `dist/` may be absent or stale.

By redirecting to `packages/comms/src/index.ts`, Metro processes the TypeScript source directly
using `babel-preset-expo`'s TypeScript plugin. This eliminates the requirement to run
`pnpm build:comms` before every `expo start`. All `ws` and Node built-in imports originating from
inside `packages/comms/src/` are still caught by the existing shim branches — `resolveRequest` is
global and intercepts all requires regardless of the calling file's location.

**Tradeoff:** The `export` Nx target (`expo export`) still has `dependsOn: ["^build"]` because
static bundle generation for production should use the compiled and type-checked dist, not raw
source. Source redirect is intentionally dev-only via Metro. Production builds go through EAS.

---

### 5. `packages/mobile/.env.metro` — `EXPO_NO_SYMLINK_RESOLUTION=1` Removed

**Why it was wrong:**
PNPM uses filesystem symlinks for all `workspace:*` packages. This variable, if set in the
environment before `expo start`, tells Metro not to resolve symlinks — breaking the only path
Metro has to reach `packages/comms`.

**Important:** `.env.metro` is not a standard dotenv filename. Expo CLI auto-loads `.env`,
`.env.local`, and `.env.<NODE_ENV>` — not `.env.metro`. This file is a _manual_ env file that
must be sourced explicitly (`source packages/mobile/.env.metro`) before running `expo start` if
the environment variables inside are desired. It has never been auto-applied.

Because of this, `EXPO_NO_SYMLINK_RESOLUTION=1` had no runtime effect in practice. However it
was removed to prevent accidental `source .env.metro` usage from breaking resolution, and to
avoid confusion for anyone reading the file.

The remaining variables in `.env.metro` (`WATCHMAN_DISABLE=1`, `NODE_OPTIONS`, `RCT_METRO_MAX_WORKERS=1`)
are safe to apply manually when debugging file-watcher or memory issues on Linux.

---

## Tradeoffs

| Decision | Gain | Cost |
|---|---|---|
| Source redirect for `@forbiddenlan/comms` | No pre-build step before `expo start`; comms changes hot-reload instantly | Metro transforms TypeScript on every bundle; marginally slower first bundle vs pre-compiled dist |
| `unstable_enableSymlinks` | PNPM workspace deps always resolve correctly | Flag is marked `unstable_`; behaviour could change in a Metro major version |
| `unstable_enablePackageExports` | Respects `exports` field in all packages | Flag is marked `unstable_`; may cause subtle resolution changes if a dependency has a malformed exports map |
| Deleted root `app.json` | Expo/EAS CLI detects correct project root | Anyone who runs `expo` from the monorepo root without `cd packages/mobile` will now get "no app.json found" rather than a silent wrong-root run |
| `nx:run-commands` instead of `@nx/expo` plugin | No additional Nx plugin dependency; full control over Expo CLI flags | Nx cannot infer project graph from Expo config; `dependsOn` must be maintained manually |

---

## Architecture: What Owns What

```
TheForbiddenLAN/                ← monorepo root; owns: nx.json, pnpm-workspace.yaml, .npmrc
├── packages/
│   ├── comms/                  ← pure TypeScript library; no Expo knowledge
│   │   └── src/index.ts        ← Metro resolves here directly (source redirect)
│   └── mobile/                 ← Expo app; owns ALL Expo config
│       ├── app.json            ← single source of truth for Expo project config
│       ├── eas.json            ← single source of truth for EAS build profiles
│       ├── metro.config.js     ← monorepo-aware Metro config
│       ├── babel.config.js     ← babel-preset-expo
│       ├── index.js            ← registerRootComponent entry
│       └── project.json        ← Nx targets: serve/android/ios/export/lint
```

No Expo config lives at the monorepo root. EAS must be run from `packages/mobile/`.

---

## How to Run (Current State)

### Check inotify limit first (Linux, one-time)
```bash
cat /proc/sys/fs/inotify/max_user_watches
# If below 524288, set it permanently:
echo "fs.inotify.max_user_watches=1048576" | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
```

### Start Metro for Expo Go (recommended for dev)
```bash
# From monorepo root:
pnpm dev:mobile          # → nx serve mobile → expo start from packages/mobile/

# Or directly:
cd packages/mobile && npx expo start
```

Scan the QR code in the terminal with:
- **iOS**: Camera app → tap the Expo Go banner
- **Android**: Expo Go app → Scan QR code

Phone and machine must be on the **same Wi-Fi network**.

### Clear Metro cache (if you see stale module errors)
```bash
cd packages/mobile && npx expo start --clear
```

### EAS Build (custom dev client / production)
```bash
cd packages/mobile
eas build --profile development    # custom dev client (needed if native deps are added)
eas build --profile production     # production binary
```

Do NOT run `eas build` from the monorepo root — root `eas.json` has been deleted precisely
to prevent this.

---

## What Is Not Affected

- `packages/comms` build (`pnpm build:comms` / `nx build comms`) — unchanged; still required
  for non-Metro consumers (server, tests). Metro bypasses it via source redirect.
- Web portal (`packages/portal` or equivalent) — no changes outside `packages/mobile/`.
- Nx caching — lint, test, and comms build targets unchanged and still cache correctly.
- `.npmrc` `shamefully-hoist=true` — confirmed correct; required for Metro's flat `node_modules`
  assumption. Do not remove.
