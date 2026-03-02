#!/bin/bash
# Android Studio & SDK Setup guide for Fedora Linux
# Run this file or follow the manual steps inside to get your emulator running.

echo "==========================================================="
echo "   SkyTalk Native Android Setup (Fedora + Niri)            "
echo "==========================================================="

echo ""
echo "Step 1: Install Android Studio"
echo "We recommend using the official JetBrains Toolbox or Flatpak to install Android Studio on Fedora."
echo "  flatpak install flathub com.google.AndroidStudio"
echo ""

echo "Step 2: Install the Android SDK"
echo "Open Android Studio, go to Tools -> SDK Manager."
echo "Ensure the following are checked and installed under 'SDK Tools':"
echo "  - Android SDK Build-Tools"
echo "  - Android Emulator"
echo "  - Android SDK Platform-Tools"
echo ""

echo "Step 3: Export Android Variables"
echo "You need to add the Android SDK to your PATH so Expo can find it."
echo "Add these lines to your ~/.bashrc or ~/.zshrc:"
echo ""
echo '  export ANDROID_HOME=$HOME/Android/Sdk'
echo '  export PATH=$PATH:$ANDROID_HOME/emulator'
echo '  export PATH=$PATH:$ANDROID_HOME/platform-tools'
echo ""
echo "After adding them, run: source ~/.bashrc"
echo ""

echo "Step 4: Create an Emulator"
echo "In Android Studio, open the Device Manager and create a new Virtual Device (e.g., Pixel 7 API 34)."
echo "Start the emulator."
echo ""

echo "Step 5: Run the native build!"
echo "Once the emulator is running on your screen, run:"
echo ""
echo "  cd packages/mobile"
echo "  npx expo prebuild --clean"
echo "  npx expo run:android"
echo ""
echo "This will compile the native C++ Opus codecs and launch the app."
