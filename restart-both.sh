#!/usr/bin/zsh
echo "Stopping all node processes to clear Metro ports..."
killall node || true

echo "\nCleaning Android build cache..."
cd packages/mobile
./gradlew clean -p android || true
rm -rf node_modules/.cache/metro

echo "\nReady to rebuild! Please run ./run-emulator.sh in one terminal and ./run-physical.sh in another."
