# SkyTalk Architecture
See SkyTalk_Master_Guide.docx for full details.
## Layers
1. Device Layer — DLS-140 local REST API (GPS, signal, routing)
2. Transport Layer — DigitalOcean WebSocket relay server
3. Application Layer — Mobile app + web portal

## Resilience and Testing Architecture
- **Auto-Reconnect**: The `RelaySocket` implements an exponential backoff reconnect strategy (up to 30s delays, max 5 attempts) to handle the intermittent nature of satellite internet.
- **Local Loopback**: To avoid burning satellite data or requiring the external DigitalOcean relay during frontend development, the architecture includes a `MockRelaySocket` implementation. It simulates server RTT latency (50ms) and provides local loopback echo of messages, allowing frontend engineers to build React Native views completely offline.
