#!/usr/bin/env bash
# ── SkyTalk Monorepo — First-Time Local Setup ────────────────────────────────
# Run:  pnpm setup:local   (or:  ./scripts/setup-local.sh)
#
# What this does:
#   1. Validates Node 20+, enables Corepack, activates pinned pnpm
#   2. Installs all workspace dependencies (pnpm install)
#   3. Builds the comms SDK (required before mobile can resolve @forbiddenlan/comms)
#   4. Generates Prisma client for the server
#   5. Seeds .env files from .env.example where missing
#   6. Installs Playwright browsers for E2E tests
#   7. Tunes kernel inotify limits for Metro/Turbopack
#   8. Validates Android toolchain (non-blocking warnings)
#   9. Runs expo prebuild for mobile native project
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PNPM_VERSION="10.23.0"

green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
red()    { printf "\033[31m%s\033[0m\n" "$1"; }

ensure_command() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    red "Missing required command: $cmd"
    red "$hint"
    exit 1
  fi
}

warn_command() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    yellow "Optional: $cmd not found. $hint"
    return 1
  fi
  return 0
}

print_section() {
  echo
  green "────────────────────────────────────────────────────────────"
  green "  $1"
  green "────────────────────────────────────────────────────────────"
}

# ── 1. Base prerequisites ────────────────────────────────────────────────────
print_section "1/9  Checking base prerequisites"
ensure_command node "Install Node.js 20+ (https://nodejs.org) and retry."
ensure_command npm  "Install npm (usually bundled with Node.js) and retry."

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  red "Node.js 20+ is required. Current: $(node -v)"
  exit 1
fi
green "Node.js $(node -v) ✓"

# ── 2. Corepack + pnpm ──────────────────────────────────────────────────────
print_section "2/9  Enabling Corepack + pnpm"
if ! command -v corepack >/dev/null 2>&1; then
  yellow "corepack not found; installing globally via npm..."
  npm install -g corepack
fi
npm install -g corepack@latest --silent 2>/dev/null || true
corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate
green "pnpm@${PNPM_VERSION} ✓"

# ── 3. Install workspace dependencies ────────────────────────────────────────
print_section "3/9  Installing workspace dependencies"
pnpm install --frozen-lockfile
pnpm -w exec nx --version >/dev/null
green "All workspace packages installed ✓"

# ── 4. Build comms SDK ───────────────────────────────────────────────────────
# The mobile package depends on @forbiddenlan/comms (workspace:*).
# Without building it first, TypeScript resolution fails and Metro can't find
# the compiled JS.
print_section "4/9  Building comms SDK"
pnpm --filter @forbiddenlan/comms build
green "comms SDK built → packages/comms/dist/ ✓"

# ── 5. Prisma generate ──────────────────────────────────────────────────────
# The server uses Prisma ORM. `prisma generate` creates the type-safe client
# from schema.prisma. Without this, the server fails to import @prisma/client.
print_section "5/9  Generating Prisma client"
if [[ -f "packages/server/prisma/schema.prisma" ]]; then
  (cd packages/server && npx prisma generate)
  green "Prisma client generated ✓"
else
  yellow "Prisma schema not found — skipping. Server may not work."
fi

# ── 6. Seed .env files from .env.example ─────────────────────────────────────
print_section "6/9  Seeding .env files"

seed_env() {
  local dir="$1"
  if [[ -f "$dir/.env.example" && ! -f "$dir/.env" ]]; then
    cp "$dir/.env.example" "$dir/.env"
    yellow "Created $dir/.env from .env.example — edit with real values"
  elif [[ -f "$dir/.env" ]]; then
    green "$dir/.env already exists ✓"
  fi
}

seed_env "packages/mobile"
seed_env "packages/server"

# Root .env.example (if any)
if [[ -f ".env.example" && ! -f ".env" ]]; then
  cp .env.example .env
  yellow "Created .env from .env.example"
fi

echo ""
yellow "IMPORTANT: Edit packages/mobile/.env with the correct relay server URL."
yellow "  Current production server: ws://134.122.32.45:3000/ws"
yellow "  See docs/BACKEND_INTEGRATION.md for details."

# ── 7. Playwright browsers (E2E tests) ──────────────────────────────────────
print_section "7/9  Installing Playwright browsers"
if npx playwright --version >/dev/null 2>&1; then
  npx playwright install --with-deps chromium 2>/dev/null || {
    yellow "Playwright browser install failed — E2E tests may not run."
    yellow "Try manually: npx playwright install --with-deps"
  }
  green "Playwright chromium installed ✓"
else
  yellow "Playwright not available — E2E tests require @playwright/test."
fi

# ── 8. Kernel tuning (Linux) ────────────────────────────────────────────────
# Metro and Turbopack use inotify on Linux. Low default limits cause
# ENOSPC errors on large monorepos.
print_section "8/9  Kernel tuning (inotify limits)"
if [[ "$(uname)" == "Linux" ]]; then
  CURRENT_WATCHES=$(cat /proc/sys/fs/inotify/max_user_watches 2>/dev/null || echo 0)
  if [[ "$CURRENT_WATCHES" -lt 524288 ]]; then
    yellow "inotify max_user_watches is $CURRENT_WATCHES (recommended: ≥524288)"
    if sudo -n true 2>/dev/null; then
      sudo sysctl -q -w fs.inotify.max_user_watches=2097152
      sudo sysctl -q -w fs.inotify.max_user_instances=8192
      green "inotify limits raised ✓"
    else
      yellow "Run with sudo to raise limits, or add to /etc/sysctl.conf:"
      yellow "  fs.inotify.max_user_watches=2097152"
      yellow "  fs.inotify.max_user_instances=8192"
    fi
  else
    green "inotify limits OK ($CURRENT_WATCHES watches) ✓"
  fi

  # Raise fd limit for current session
  ulimit -n 65535 2>/dev/null || true
else
  green "Not Linux — skipping inotify tuning"
fi

# ── 9. Android toolchain check ──────────────────────────────────────────────
print_section "9/9  Android toolchain check"

ANDROID_OK=true

if [[ -z "${ANDROID_HOME:-}" ]]; then
  yellow "ANDROID_HOME is not set."
  yellow "  export ANDROID_HOME=\$HOME/Android/Sdk"
  yellow "  export PATH=\$PATH:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator"
  ANDROID_OK=false
else
  green "ANDROID_HOME=$ANDROID_HOME ✓"
fi

warn_command adb "Add \$ANDROID_HOME/platform-tools to PATH." || ANDROID_OK=false
warn_command java "Install JDK 17+ for Gradle builds (sudo dnf install java-17-openjdk-devel)." || ANDROID_OK=false

# Check Java version (Gradle requires JDK 17+)
if command -v java >/dev/null 2>&1; then
  JAVA_VER=$(java -version 2>&1 | head -1 | grep -oP '(?<=")\d+' | head -1)
  if [[ -n "$JAVA_VER" && "$JAVA_VER" -lt 17 ]]; then
    yellow "Java $JAVA_VER detected — Gradle requires JDK 17+."
    ANDROID_OK=false
  else
    green "Java $JAVA_VER ✓"
  fi
fi

# Expo prebuild (generate android/ project if not present or stale)
if [[ "$ANDROID_OK" == "true" ]]; then
  if [[ ! -d "packages/mobile/android" ]]; then
    yellow "Running expo prebuild to generate android/ project..."
    (cd packages/mobile && npx expo prebuild --clean)
    green "expo prebuild complete ✓"
  else
    green "android/ directory exists — run 'npx expo prebuild --clean' to regenerate if native modules changed"
  fi
else
  yellow "Skipping expo prebuild — fix Android toolchain issues above first."
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
green "════════════════════════════════════════════════════════════"
green "  Bootstrap complete!"
green "════════════════════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo ""
echo "  Server (local):     cd packages/server && pnpm dev"
echo "  Mobile (Android):   ./run-android.sh"
echo "  Admin panel (web):  pnpm dev:admin   (opens in browser at localhost:8081)"
echo "  Docs site:          pnpm dev:docs"
echo ""
echo "  E2E tests:          pnpm test:e2e"
echo ""
if [[ "$ANDROID_OK" == "false" ]]; then
  yellow "  ⚠  Android toolchain has issues — see warnings above."
  yellow "     Run android-setup.sh for guided Android SDK installation."
fi
