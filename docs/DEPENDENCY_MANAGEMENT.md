# Managing Dependencies & Adding to Corepack

This guide explains how to add new dependencies to the monorepo and ensure they're properly integrated with Corepack and the local bootstrap script.

## Adding Dependencies

### For a Specific Package

To add a dependency to a specific workspace package (e.g., `packages/mobile`):

```bash
pnpm add dependency-name --filter @forbiddenlan/mobile
```

Or with `--save-dev` for dev dependencies:

```bash
pnpm add -D dependency-name --filter @forbiddenlan/mobile
```

### For Root Workspace

To add a dependency to the root workspace (shared across all packages):

```bash
pnpm add -W dependency-name
```

For dev dependencies in root:

```bash
pnpm add -W -D dependency-name
```

## Important: Update Corepack & Bootstrap Script

Once you add new dependencies, you may need to update:

### 1. Corepack Configuration

If the new dependency requires a specific version of npm/yarn/pnpm, update `packageManager` in root `package.json`:

```json
{
  "packageManager": "pnpm@10.23.0"
}
```

Currently pinned to **pnpm@10.23.0**. Only change this if you have a specific reason (e.g., migrating to new package manager version).

Corepack will automatically use this pinned version. The bootstrap script (`scripts/setup-local.sh`) enforces this when you run `pnpm setup:local`.

### 2. Bootstrap Script Changes

If your new dependency has special setup requirements, add validation to `scripts/setup-local.sh`:

**Example:** If adding a tool that needs environment configuration:

```bash
print_section "Checking new tool setup"
if ! command -v newtool >/dev/null 2>&1; then
  yellow "Warning: newtool not found in PATH. Some features may not work."
  yellow "Install it via: apt install newtool"
else
  green "newtool found: $(command -v newtool)"
fi
```

### 3. Node.js Version Requirements

If the new dependency requires Node.js > 20, update the version check in `scripts/setup-local.sh`:

Current minimum: **Node.js 20**

```bash
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  red "Node.js 22+ is required for this feature. Current: $(node -v)"
  exit 1
fi
```

## Verifying Your Changes

After adding dependencies, test the bootstrap:

```bash
# Clear everything and re-test bootstrap
rm -rf node_modules
pnpm setup:local
```

This will:
- Update Corepack to latest version
- Activate the pinned pnpm version
- Install all new dependencies
- Validate workspace integrity

## Adding Dependencies for Fumadocs Documentation

If you need to add new packages for the **documentation site** (`packages/docs`), add them to:

1. **`packages/docs/package.json`** — For packages/docs-specific dependencies
2. **Root `package.json` dependencies** — If shared (e.g., React, Next.js, Tailwind, Fumadocs core)

Example: Adding a Fumadocs plugin to the docs site:

```bash
# Add Fumadocs plugin to docs package
pnpm add fumadocs-plugin-name --filter @forbiddenlan/docs
```

Then test:

```bash
pnpm setup:local
pnpm dev:docs  # Must start without errors on http://localhost:3000
```

**Current Fumadocs Stack (packages/docs):**
- `next@16.1.6` — React framework
- `fumadocs-core@14.2.9` — Core Fumadocs library
- `fumadocs-mdx@14.2.9` — MDX integration for content
- `fumadocs-ui@14.2.9` — Pre-built UI components
- `tailwindcss@4.0.0` — Styling framework

## Common Fumadocs Operations

### Add a Fumadocs Plugin

```bash
# Install plugin for the docs package
pnpm add fumadocs-plugin-openapi --filter @forbiddenlan/docs
```

Then update `packages/docs/source.config.ts` to register it.

### Update Fumadocs Version

All Fumadocs packages must be updated together. Update both:
- Root: `package.json` (fumadocs-* dependencies)
- Docs: `packages/docs/package.json` (if specific versions differ)

```bash
# Update all Fumadocs packages in docs
pnpm update fumadocs-core fumadocs-mdx fumadocs-ui --filter @forbiddenlan/docs
```

## CI Validation

The CI workflow (`.github/workflows/bootstrap-check.yml`) automatically tests `pnpm setup:local` on:
- Node 20 and Node 22
- Every push to main/develop/master
- When `scripts/setup-local.sh` or `package.json` changes

If your new dependency breaks setup, CI will catch it before merge.

## Common Patterns

### Adding a Linter/Formatter

```bash
# Add to root for all packages to use
pnpm add -W -D prettier eslint
```

### Adding a CLI Tool

```bash
# Add to root as a dev dependency
pnpm add -W -D @types/node
```

### Adding a Framework to Mobile App

```bash
# Add to mobile package
pnpm add tanstack-query --filter @forbiddenlan/mobile
```

### Adding a Server Dependency

```bash
# Add to server package
pnpm add fastify --filter @forbiddenlan/server
```

## Troubleshooting

### "pnpm install" fails after adding dependency

Clear pnpm cache and retry:

```bash
pnpm install --no-frozen-lockfile
```

The lockfile will be auto-updated. Commit the updated `pnpm-lock.yaml`.

### Corepack complains about version mismatch

This shouldn't happen if you only edit `package.json` normally. If it does:

```bash
corepack prepare pnpm@10.23.0 --activate
```

### Bootstrap script fails on new dependency

Edit `scripts/setup-local.sh` to add appropriate validation or warnings for your specific dependency.

## Summary

- **Add dependencies normally** with `pnpm add` to specific packages or root
- **Only update Corepack version** if you change `packageManager` in root `package.json`
- **Update bootstrap script** only if new dependencies need special setup
- **Test with `pnpm setup:local`** to ensure changes work in fresh clone scenario
- **CI will validate** your changes automatically on PR

See [LOCAL_DEV_BOOTSTRAP.md](./LOCAL_DEV_BOOTSTRAP.md) for more on the bootstrap system.
