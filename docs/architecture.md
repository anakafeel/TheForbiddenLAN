# SkyTalk Architecture
See SkyTalk_Master_Guide.docx for full details.
## Layers
1. Device Layer — DLS-140 local REST API (GPS, signal, routing)
2. Transport Layer — DigitalOcean WebSocket relay server
3. Application Layer — Mobile app + web portal

The **Relay Server is a dumb authenticated router**—it authenticates clients on connect and then performs pure fan-out of messages by talkgroup ID. It does **not** process floor control logic, buffer audio, store GPS in a database, or manage presence beyond active WebSocket connections.

**Floor Control logic is entirely client-side.** Every client runs a deterministic arbitration algorithm comparing GPS timestamps to pick the winner. The relay just passes the `PTT_START` messages.

## Mobile App Build Targets

The mobile package (`packages/mobile`) is an **Expo SDK 50** project. `expo/AppEntry.js` is the universal entry point, which auto-discovers `src/App.tsx` (or `App.jsx`).

| Target | Command | Notes |
|--------|---------|-------|
| Android (Emulator or USB) | `expo start --android` | Requires a custom **Expo Development Build** (EAS) because `react-native-opus` and `react-native-live-audio-stream` use custom C++ bindings not in standard Expo Go |
| Native project generation | `expo prebuild --clean` | Generates the `./android/` directory from `app.json` plugins before building. The `./ios` directory can be ignored on Linux. |

### Why Expo Development Build (not Expo Go)
The Opus 60ms streaming architecture requires custom native C++ libraries that cannot be run inside the free Expo Go app. To test the app, you must build it natively using Android Studio or the CLI. See `docs/tradeoffs.md` for the full rationale on why iOS is dropped for this phase.

### Previous Vite / Bare React Native Setup
Prior to the Expo migration, the package used Vite + `react-native-web` for browser-based dev testing, with `index.js` / `index.web.js` as entry points. These have been removed. Browser-based testing of the comms layer can still be done via the relay test scripts in `packages/comms/src/test-comms.ts`.

## Resilience and Testing Architecture
- **Auto-Reconnect**: The `RelaySocket` implements an exponential backoff reconnect strategy starting at 1s, doubling each attempt, capped at 30s maximum interval. **Unlimited retries** — the app must never permanently give up reconnecting because satellite links drop regularly during orbital handoffs.
- **Local Loopback**: To avoid burning satellite data or requiring the external relay during frontend development, the architecture includes a `MockRelaySocket` implementation. It simulates server RTT latency (50ms) and provides local loopback echo of messages, allowing frontend engineers to build React Native views completely offline.
