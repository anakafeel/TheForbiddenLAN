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

cd packages/mobile
npx expo run:android
