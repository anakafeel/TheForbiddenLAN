#!/usr/bin/zsh
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/build-tools/36.0.0

# ── Check if physical device is connected ───────────────────────────────────
echo "📱 Checking for connected physical devices..."
if ! adb devices | grep -q "R58T41T27TR"; then
  echo "❌ Device R58T41T27TR not found!"
  echo "\nConnected devices:"
  adb devices
  echo "\n💡 Make sure your phone is:"
  echo "   1. Plugged in via USB"
  echo "   2. Has USB Debugging enabled (Settings > Developer Options)"
  echo "   3. Has authorized this computer (check phone for prompt)"
  exit 1
fi

# Expo CLI derives physical device name from "model:" field in `adb devices -l`
# (uses underscores, e.g. SM_A225M, NOT getprop which uses hyphens SM-A225M)
PHYSICAL_NAME=$(adb devices -l 2>/dev/null | grep "R58T41T27TR" | grep -oP 'model:\K\S+')
if [[ -z "$PHYSICAL_NAME" ]]; then
  echo "❌ Could not resolve physical device model name from adb devices -l"
  echo "Falling back to getprop (with hyphen→underscore conversion)..."
  PHYSICAL_NAME=$(adb -s R58T41T27TR shell getprop ro.product.model 2>/dev/null | tr -d '\r' | tr '-' '_')
fi
if [[ -z "$PHYSICAL_NAME" ]]; then
  echo "❌ Could not resolve physical device model name for Expo --device"
  exit 1
fi

# ── Kernel tuning ────────────────────────────────────────────────────────────
echo "🔧 Tuning inotify limits for Metro..."
sudo sysctl -q -w fs.inotify.max_user_instances=8192 2>/dev/null
sudo sysctl -q -w fs.inotify.max_user_watches=2097152 2>/dev/null
ulimit -n 65535 2>/dev/null

# ── Clear stale Watchman state ───────────────────────────────────────────────
if command -v watchman &>/dev/null; then
  watchman watch-del-all &>/dev/null
  watchman shutdown-server &>/dev/null
fi

# ── Source Metro env vars ────────────────────────────────────────────────────
if [[ -f packages/mobile/.env.metro ]]; then
  set -a
  source packages/mobile/.env.metro
  set +a
fi

echo "✅ Device found. Building for R58T41T27TR ($PHYSICAL_NAME)..."
cd packages/mobile
export ANDROID_SERIAL=R58T41T27TR
npx expo run:android --device "$PHYSICAL_NAME" --port 8081
