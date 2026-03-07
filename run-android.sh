#!/usr/bin/zsh
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/build-tools/36.0.0

# ── Kernel tuning ────────────────────────────────────────────────────────────
# Watchman is disabled in metro.config.js (watcher.watchman.enabled = false).
# Metro uses FallbackWatcher (Node.js native fs.watch) instead, which respects
# the ignore regex in metro.config.js *before* opening any fds — so only ~10
# src dirs get watched.
#
# Raise inotify limits and file descriptor limit as a safety net.
echo "🔧 Tuning inotify limits for Metro..."
sudo sysctl -q -w fs.inotify.max_user_instances=8192 2>/dev/null
sudo sysctl -q -w fs.inotify.max_user_watches=2097152 2>/dev/null

# Also raise open file descriptor limit (separate resource)
ulimit -n 65535 2>/dev/null

# ── Clear stale Watchman state ───────────────────────────────────────────────
# If Watchman is installed, clear any poisoned state from previous runs so it
# doesn't interfere (even though Metro won't use it, Expo CLI may probe it).
if command -v watchman &>/dev/null; then
  watchman watch-del-all &>/dev/null
  watchman shutdown-server &>/dev/null
fi

# ── Source Metro env vars ────────────────────────────────────────────────────
# NODE_OPTIONS and RCT_METRO_MAX_WORKERS from .env.metro
if [[ -f packages/mobile/.env.metro ]]; then
  set -a
  source packages/mobile/.env.metro
  set +a
fi

# ── Clean stale CMake cache (needed after adding new native modules) ─────────
# If the CMake cache pre-dates the pnpm lockfile, nuke it so Gradle's codegen
# step runs before C++ compilation (avoids "EventEmitters.h not found" errors).
MOBILE_ANDROID_CXX="packages/mobile/android/app/.cxx"
LOCKFILE="pnpm-lock.yaml"
if [[ -d "$MOBILE_ANDROID_CXX" && "$LOCKFILE" -nt "$MOBILE_ANDROID_CXX" ]]; then
  echo "🔧 Native modules changed — cleaning stale CMake cache..."
  rm -rf "$MOBILE_ANDROID_CXX" packages/mobile/android/app/build
  echo "   Running expo prebuild to regenerate autolinking..."
  (cd packages/mobile && npx expo prebuild --platform android --no-install 2>&1 | grep -E "✔|✗|Error" || true)
fi

# ── Kill stale Metro on port 8081 ────────────────────────────────────────────
# If a dead/orphaned Metro process is still bound to 8081, Expo CLI will print
# "Skipping dev server" and NOT start a fresh one. The installed APK then opens
# to a white screen because it can't load the JS bundle.
echo "🔧 Clearing any stale Metro process on port 8081..."
OLD_PID=$(lsof -ti :8081 2>/dev/null)
if [[ -n "$OLD_PID" ]]; then
  echo "   Killing PID $OLD_PID"
  kill -9 "$OLD_PID" 2>/dev/null || true
  sleep 1
fi

# ── Ensure adb reverse is set up ─────────────────────────────────────────────
# Forward device:8081 → host:8081 so the physical device can reach Metro.
echo "🔧 Setting up adb reverse tunnel (8081)..."
adb reverse tcp:8081 tcp:8081 2>/dev/null || true

cd packages/mobile
npx expo run:android "$@"
