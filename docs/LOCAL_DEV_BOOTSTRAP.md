# Local Dev Bootstrap (Monorepo)

This repo now includes a one-command first-time setup for local development.

## Command

Run from repo root:

```bash
pnpm setup:local
```

Alias (same behavior):

```bash
pnpm setup:doctor
```

## What it does

The script runs `scripts/setup-local.sh` and performs:

1. Checks for required base tools:
   - `node`
   - `npm`
2. Enforces Node.js 20+
3. Updates Corepack to the latest version (ensures compatibility with pnpm 10.23.0)
4. Enables Corepack (`corepack enable`)
5. Activates pinned pnpm version (`pnpm@10.23.0`)
6. Installs workspace dependencies (`pnpm install --frozen-lockfile`)
7. Verifies Nx is available
8. Runs Android toolchain sanity checks:
   - `ANDROID_HOME` presence
   - `adb` in `PATH`
   - `emulator` in `PATH`

## Why this improves dev experience

- Removes manual Corepack/pnpm setup drift between developers
- Uses the exact pinned package manager version from the repo
- Gives first-time contributors one clear entry command
- Catches common Android env issues early with actionable warnings

## Typical first-run flow

```bash
# 1) bootstrap monorepo tooling and dependencies
pnpm setup:local

# 2) start browser-based mobile UI dev
pnpm dev:mobile

# 3) run native Android build
./run-android.sh
```

## Notes

- The script automatically updates Corepack to the latest version before activating pnpm. This ensures compatibility with pnpm 10.23.0 and prevents issues with older Corepack versions bundled with Node.js.
- If `corepack` is not installed, the script installs it globally via npm.
- Android checks are warnings (non-blocking) so web/server developers can still bootstrap successfully.
- For detailed Android troubleshooting, see [MOBILE_SETUP_TROUBLESHOOTING.md](./MOBILE_SETUP_TROUBLESHOOTING.md).

## CI Validation

The repo includes a GitHub Actions workflow (`.github/workflows/bootstrap-check.yml`) that verifies `pnpm setup:local` stays healthy on every push/PR that touches:
- `scripts/setup-local.sh`
- `package.json`
- `pnpm-lock.yaml`

The workflow tests against Node.js 20 and 22 on Ubuntu to catch regressions early.
