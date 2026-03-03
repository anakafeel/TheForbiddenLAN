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

# 4) (optional) start documentation site
pnpm dev:docs
```

Documentation site runs on `http://localhost:3000` and displays all markdown docs from `packages/docs/content/docs` using Fumadocs.

## Documentation Site

The documentation site is a separate Next.js + Fumadocs app located in `packages/docs/`.

**Start the docs site:**
```bash
pnpm dev:docs
```

**Access at:** http://localhost:3000

**Adding new docs:**
1. Create `.mdx` files in `packages/docs/content/docs/`
2. Structure follows directory hierarchy (e.g., `content/docs/guides/setup.mdx` becomes `/docs/guides/setup`)
3. Each file needs frontmatter:
```yaml
---
title: Page Title
description: Short description
---

## Content here
```

## Notes

- The script automatically updates Corepack to the latest version before activating pnpm. This ensures compatibility with pnpm 10.23.0 and prevents issues with older Corepack versions bundled with Node.js.
- If `corepack` is not installed, the script installs it globally via npm.
- Android checks are warnings (non-blocking) so web/server developers can still bootstrap successfully.
- For detailed Android troubleshooting, see [MOBILE_SETUP_TROUBLESHOOTING.md](./MOBILE_SETUP_TROUBLESHOOTING.md).

## Troubleshooting

If `pnpm setup:local` fails or you encounter issues with dev servers, check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for solutions:

- **inotify watch limit** / Turbopack crashes when running `pnpm dev:docs`
- **Port already in use** (3000, 3001, 8081)
- **Metro bundler failures** with symlink errors
- **Android build hangs** or NDK/SDK errors
- **Dependency conflicts** or lock file issues
- **Node.js version mismatch**
- And many more...

Each issue includes the root cause, step-by-step solution, and prevention tips.

## CI Validation

The repo includes a GitHub Actions workflow (`.github/workflows/bootstrap-check.yml`) that verifies `pnpm setup:local` stays healthy on every push/PR that touches:
- `scripts/setup-local.sh`
- `package.json`
- `pnpm-lock.yaml`

The workflow tests against Node.js 20 and 22 on Ubuntu to catch regressions early.
