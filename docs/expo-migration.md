# Expo Migration — Engineering Log

## Context
The frontend team shifted from Capacitor to React Native. We needed a way to test the mobile app natively on a physical iPhone 15 Pro from a Linux development machine. The hackathon judges explicitly rejected PWA/browser-tab approaches — the app must compile and run on the actual device, supporting offline-first and decentralized operation.

## Options Explored

### Option 1: Vite + react-native-web (Browser Preview)
**What it is:** Serve the React Native app as a web page via Vite and open it in Safari on the iPhone.
**Why we rejected it:** The judges require a real native app, not a browser tab. No access to native microphone permissions, no offline capability, no App Store distribution path. This was our original PWA approach that was already rejected.

### Option 2: Expo Development Build (EAS Build / Xcode)
**What it is:** Use `expo prebuild` to generate native `ios/` and `android/` directories, then compile a custom dev client binary via EAS Build (cloud) or Xcode (local Mac).
**Why we rejected it:** EAS Build requires a paid Apple Developer Account ($99/yr) to install on a physical iPhone. Building locally requires a Mac with Xcode, which we don't have (our dev environment is Linux). Neither option is free or accessible from our current setup.

### Option 3: Expo Go (Managed Workflow) ✅ CHOSEN
**What it is:** Strip all custom native C++ dependencies (like `react-native-webrtc`) and replace them with Expo's official managed modules (`expo-av`, `expo-file-system`). The app runs inside the free Expo Go client from the App Store with zero compilation or Apple accounts.
**Why we chose it:** Free, instant, no Mac required, no cloud builds, no developer account. Scan a QR code and the app loads natively on the iPhone over local Wi-Fi in seconds.

## What We Changed

### Removed
| Dependency | Why Removed |
|---|---|
| `react-native-webrtc` | Custom native C++ bindings incompatible with Expo Go |
| `vite`, `@vitejs/plugin-react`, `react-native-web` | No longer needed — Expo handles bundling via Metro |
| `metro-react-native-babel-preset` | Replaced by `babel-preset-expo` |
| `expo-build-properties` | Only needed for Expo Prebuild/EAS, not Managed Expo Go |
| `index.js`, `index.web.js` | Expo uses its own `AppEntry.js` entry point |

### Added
| Dependency | Purpose |
|---|---|
| `expo` (~50.0.14) | Core Expo SDK runtime |
| `expo-av` (~13.10.6) | Native audio recording and playback (replaces `MediaRecorder` + `AudioContext`) |
| `expo-file-system` (~16.0.8) | Write base64 audio chunks to temp files for playback |
| `expo-status-bar` (~1.11.1) | Status bar management |
| `babel-preset-expo` (~10.0.1) | Babel transpilation preset for Expo |

### Rewritten Hooks
- **`useAudioCapture.ts`**: Replaced raw `navigator.mediaDevices.getUserMedia()` and `MediaRecorder` with `Audio.Recording.createAsync()` from `expo-av`. Requests microphone permissions via `Audio.requestPermissionsAsync()`.
- **`useAudioPlayback.ts`**: Replaced raw `AudioContext.decodeAudioData()` with `Audio.Sound.createAsync()` from `expo-av`. Incoming base64 chunks are written to temporary files via `expo-file-system` before playback (Expo cannot play raw memory buffers directly).

### Config Changes
- **`app.json`**: Wrapped in `"expo": { ... }` manifest. Removed `expo-build-properties` plugin (only needed for native builds).
- **`babel.config.js`**: Preset changed from `module:metro-react-native-babel-preset` to `babel-preset-expo`.
- **`package.json`**: Entry point set to `node_modules/expo/AppEntry.js`. Scripts simplified to `expo start`.

## Impact on the Comms Layer
**Zero impact.** The `@forbiddenlan/comms` package is completely platform-agnostic. It accepts base64 audio strings via `sendAudioChunk()` and doesn't care whether they come from `expo-av`, `MediaRecorder`, or a test harness. The transport layer (`RelaySocket`, `MockRelaySocket`, `FloorControl`, `AudioPipeline`) is unchanged.

## Impact on Bandwidth
**Zero additional overhead.** `expo-av` records audio locally on the device. The base64 chunks passed to `sendAudioChunk()` are the same size regardless of whether they originate from `expo-av` or `MediaRecorder`. The satellite link sees identical payloads.

## Tradeoff Summary
| Gained | Lost |
|---|---|
| Free native testing on iPhone from Linux | Cannot use custom native C++ modules (e.g., WebRTC data channels) |
| Instant QR-code deploy cycle (< 5 seconds) | `expo-av` cannot stream raw audio chunks in real-time like `MediaRecorder.ondataavailable` |
| No Apple Developer Account required | Full audio is captured as a file, then sent on PTT release (not true 200ms streaming yet) |
| No Mac required for development | Must migrate to Expo Dev Build if we add future native-only dependencies |

## How to Test
1. Ensure iPhone and Linux machine are on the **same Wi-Fi network**.
2. Download **Expo Go** from the iOS App Store (free, no account needed).
3. From `packages/mobile`, run: `pnpm start`
4. Scan the QR code displayed in the terminal using the iPhone Camera app.
5. The app loads natively on the iPhone in seconds.

## Future Consideration: Real-Time Audio Streaming
`expo-av`'s `Audio.Recording` captures audio to a file, not a stream. For true 200ms chunked Push-to-Talk streaming (matching our comms layer's `enqueueChunk` design), we will eventually need either:
- A native module that exposes raw PCM/Opus frames (requires Expo Dev Build), or
- A polling approach that reads the recording file incrementally during capture.

For the hackathon demo, sending the complete recording on PTT release is functional and demonstrates the full pipeline end-to-end.

---

## Linux-Specific Troubleshooting

### EMFILE: too many open files (Metro Crash)
**Problem:** On Linux (especially Fedora), Metro Bundler watches every file in the monorepo for hot-reload. In a pnpm workspace with hoisted `node_modules` across multiple packages, the number of files easily exceeds the default `inotify` watcher limit (~250K), causing an immediate `EMFILE: too many open files` crash.
**Fix:** Increase the kernel file watcher limit permanently:
```bash
echo "fs.inotify.max_user_watches=1048576" | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
```
This bumps the limit from ~250K to 1 million. Standard fix for any React Native / Metro project on Linux.

### `pnpm ios` fails with "Xcode must be fully installed"
**Problem:** The `pnpm ios` script runs `expo start --ios`, which attempts to launch an iOS Simulator via Xcode. Xcode is a macOS-only application. On Linux, this command will always fail.
**Fix:** On Linux, always use `pnpm start` (plain `expo start`). This launches Metro Bundler and displays a QR code. Scan the QR code from the iPhone using the free Expo Go app. The `--ios` flag is only useful on macOS with Xcode installed.

| Command | Platform | What it does |
|---|---|---|
| `pnpm start` | Any (Linux/Mac/Win) | Starts Metro, shows QR code for Expo Go |
| `pnpm ios` | macOS only | Starts Metro + opens iOS Simulator via Xcode |
| `pnpm android` | Any with Android SDK | Starts Metro + opens Android Emulator |

### Version Compatibility Warnings
Expo SDK 55 expects specific peer dependency versions. If you see warnings like `react@18.2.0 - expected version: 19.2.0`, these are non-blocking for development but should be resolved before production by running:
```bash
npx expo install --fix
```
This auto-aligns all Expo-managed dependencies to their correct versions for the installed SDK.
