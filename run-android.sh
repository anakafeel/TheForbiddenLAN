#!/usr/bin/zsh
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/build-tools/36.0.0

# Raise the open file descriptor limit for this shell session.
# Metro's FallbackWatcher opens one inotify watch per directory — monorepos
# easily exceed the default Linux limit of 1024. 65535 covers even large pnpm workspaces.
ulimit -n 65535

cd packages/mobile
npx expo run:android
