# SkyTalk Architecture
See SkyTalk_Master_Guide.docx for full details.
## Layers
1. Device Layer — DLS-140 local REST API (GPS, signal, routing)
2. Transport Layer — DigitalOcean WebSocket relay server
3. Application Layer — Mobile app + web portal

## Mobile App Build Targets

The mobile package (`packages/mobile`) is an **Expo SDK 50** project. `expo/AppEntry.js` is the universal entry point, which auto-discovers `src/App.tsx` (or `App.jsx`).

| Target | Command | Notes |
|--------|---------|-------|
| iOS (device) | `expo start --ios` | Requires a custom **Expo Development Build** — standard Expo Go is incompatible due to `react-native-webrtc` native bindings |
| Android | `expo start --android` | Same requirement as iOS |
| Native project generation | `expo prebuild` | Generates `ios/` and `android/` directories from `app.json` plugins before building |

### Why Expo Development Build (not Expo Go)
`react-native-webrtc` requires C++/Objective-C native bindings that are not included in the standard Expo Go binary. We use `expo-build-properties` in `app.json` to enforce a minimum iOS deployment target of 13.0 for WebRTC compatibility. See `docs/tradeoffs.md` — *Expo Go vs Expo Development Build* for the full rationale.

### Previous Vite / Bare React Native Setup
Prior to the Expo migration, the package used Vite + `react-native-web` for browser-based dev testing, with `index.js` / `index.web.js` as entry points. These have been removed. Browser-based testing of the comms layer can still be done via the relay test scripts in `packages/comms/src/test-comms.ts`.

## Resilience and Testing Architecture
- **Auto-Reconnect**: The `RelaySocket` implements an exponential backoff reconnect strategy (up to 30s delays, max 5 attempts) to handle the intermittent nature of satellite internet.
- **Local Loopback**: To avoid burning satellite data or requiring the external DigitalOcean relay during frontend development, the architecture includes a `MockRelaySocket` implementation. It simulates server RTT latency (50ms) and provides local loopback echo of messages, allowing frontend engineers to build React Native views completely offline.
