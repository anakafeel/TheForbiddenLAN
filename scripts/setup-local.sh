#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PNPM_VERSION="10.23.0"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
red() { printf "\033[31m%s\033[0m\n" "$1"; }

ensure_command() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    red "Missing required command: $cmd"
    red "$hint"
    exit 1
  fi
}

print_section() {
  echo
  green "==> $1"
}

print_section "Checking base prerequisites"
ensure_command node "Install Node.js 20+ and retry."
ensure_command npm "Install npm (usually included with Node.js) and retry."

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  red "Node.js 20+ is required. Current: $(node -v)"
  exit 1
fi

print_section "Enabling Corepack"
if ! command -v corepack >/dev/null 2>&1; then
  yellow "corepack not found; installing globally via npm..."
  npm install -g corepack
fi

# Update Corepack to latest version for best pnpm compatibility
yellow "Updating Corepack to latest version..."
npm install -g corepack@latest --silent

corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate

green "Corepack is enabled and pnpm@${PNPM_VERSION} is active"

print_section "Installing workspace dependencies"
pnpm install --frozen-lockfile

print_section "Validating workspace"
pnpm -w exec nx --version >/dev/null

# Validate Fumadocs docs package
if [[ ! -d "packages/docs" ]]; then
  yellow "Warning: packages/docs directory not found. Documentation site may not be available."
else
  green "Documentation site package found (packages/docs)"
fi

green "Workspace dependencies installed successfully"

print_section "Android toolchain check (optional)"
if [[ -z "${ANDROID_HOME:-}" ]]; then
  yellow "ANDROID_HOME is not set. Android builds may fail until set."
  yellow "Expected example: export ANDROID_HOME=\$HOME/Android/Sdk"
else
  green "ANDROID_HOME set: $ANDROID_HOME"
fi

if command -v adb >/dev/null 2>&1; then
  green "adb found: $(command -v adb)"
else
  yellow "adb not found in PATH. Add \$ANDROID_HOME/platform-tools to PATH for Android dev."
fi

if command -v emulator >/dev/null 2>&1; then
  green "emulator found: $(command -v emulator)"
else
  yellow "Android emulator not found in PATH. Add \$ANDROID_HOME/emulator to PATH if needed."
fi

print_section "Done"
green "Local bootstrap complete."
echo "Next commands:"
echo "  pnpm dev:mobile   # browser UI"
echo "  ./run-android.sh  # Android app"
