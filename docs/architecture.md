# SkyTalk Architecture
See SkyTalk_Master_Guide.docx for full details.
## Layers
1. Device Layer — DLS-140 local REST API (GPS, signal, routing)
2. Transport Layer — DigitalOcean WebSocket relay server
3. Application Layer — Mobile app + web portal

## Mobile App Build Targets

The mobile package (`packages/mobile`) produces three build targets from the same React Native source:

- **Browser** — Vite + `react-native-web` aliasing. Entry: `index.web.js` → `App.web.jsx`. Used for development, comms integration testing, and the web client. Run with `pnpm dev:mobile`.
- **Android** — Metro + Gradle. Entry: `index.js` → `App.jsx`.
- **iOS** — Metro + Xcode. Entry: `index.js` → `App.jsx`.

See `docs/tradeoffs.md` — *Web Dev Environment: Vite + react-native-web vs Metro Web* for the full rationale.

## Resilience and Testing Architecture
- **Auto-Reconnect**: The `RelaySocket` implements an exponential backoff reconnect strategy (up to 30s delays, max 5 attempts) to handle the intermittent nature of satellite internet.
- **Local Loopback**: To avoid burning satellite data or requiring the external DigitalOcean relay during frontend development, the architecture includes a `MockRelaySocket` implementation. It simulates server RTT latency (50ms) and provides local loopback echo of messages, allowing frontend engineers to build React Native views completely offline.
