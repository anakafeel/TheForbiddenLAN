## Floor Control: Optimistic vs Server-side Grant
**Decision**: Fully client-side deterministic arbitration. Each client runs the same GPS timestamp comparison algorithm and reaches the same winner independently. Relay fans out PTT_START messages only — no server involvement in arbitration. Eliminates 1000–3000ms round-trip penalty entirely.
**Problem**: Iridium NAT prevents direct P2P between DLS-140 units, making a pure decentralized mesh impossible across remote sites.
**Decision**: We chose a **Hybrid Approach** with a central DigitalOcean relay. While we lose offline local-mesh capabilities if the internet drops, we prioritize extreme low-bandwidth optimizations (like `sessionId` compression) to ensure the fragile 22kbps satellite link to the centralized server never saturates.
## Codec: Opus vs Codec2
Adaptive. Opus **6kbps** default (changed from 8kbps — see AES-GCM Overhead section below), Codec2 2400bps fallback when signal < 2 bars.

## Clock Drift: SYNC_TIME vs Raw Timestamps
**Problem:** Relying solely on raw device GPS timestamps for floor control means devices with slightly skewed clocks will always win or lose arbitration unfairly.
**Decision:** We implemented NTP-like synchronization. We send a `SYNC_TIME` ping on connection to calculate a `serverTimeOffset`.
**Tradeoff:** Adds a tiny amount of overhead on initial connection, but ensures all clients agree on a relative "server time" when arbitrating the 50ms collision window without requiring an external NTP server dependency.

## Bandwidth: Strict Half-Duplex over Satellite Link
**Problem:** The Iridium satellite uplink is only 22kbps. If a user receives audio while transmitting, the link saturates, causing severe packet loss and application crashes.
**Decision:** We added an `isTransmitting` flag to the comms library and drop incoming `PTT_AUDIO` messages locally while the mic is open.
**Tradeoff:** Users cannot hear others trying to talk over them (no full-duplex), but it protects the fragile satellite hardware link from catastrophic saturation.

## Bandwidth Optimization: `sessionId` vs `sender` UUID
**Problem:** Long JWTs and 36-character Device UUIDs (`sender`) attached to every single 200ms audio chunk eat up massive amounts of bandwidth over a 22kbps link.
**Decision:** We omit the `sender` UUID entirely from Opus audio chunks and instead generate a randomized 4-byte `sessionId` integer on each `PTT_START`.
**Tradeoff:** Slightly more complex server state (must map `sessionId` back to a user if needed), but saves ~30 bytes per audio chunk. In satellite comms, every byte counts and this drastically reduces overhead.

## Platform Agnosticism: React Native Audio Pipeline
**Problem:** The shift from Capacitor (Web) to React Native meant we lost access to the browser's native `MediaRecorder` API in the comms package.
**Decision:** We re-architected `AudioPipeline.ts` to be a pure state machine and sequencer. It no longer captures audio directly. Instead, it exposes `enqueueChunk(base64OpusData)`.
**Tradeoff:** The mobile frontend developers must now handle native hardware microphone bindings using external libraries (e.g., `react-native-audio-recorder-player`), but the comms package remains purely platform-agnostic and focused solely on transport.

## Web Dev Environment: Vite + react-native-web vs Metro Web

**Question:** If Annie wrote the frontend in React Native so it runs everywhere, why is Vite involved at all?

**Answer:** Vite is not replacing React Native — it is only the dev server for the browser target. The same `.jsx` source files that Vite bundles for the browser are the exact same files Metro bundles for iOS/Android. Nothing in Annie's code changes between targets.

The trick is `react-native-web`: a library that re-implements every React Native primitive as a DOM equivalent (`View` → `<div>`, `Text` → `<span>`, `Pressable` → `<div onPointerDown>`, `StyleSheet` → CSS-in-JS, etc.). `vite.config.js` redirects the `react-native` import to `react-native-web` at bundle time:

```js
alias: { 'react-native': path.resolve(__dirname, 'node_modules/react-native-web') }
```

So the three build paths from the same source are:

| Target | Build tool | Command |
|--------|-----------|---------|
| Browser (dev/testing) | Vite + react-native-web | `pnpm dev:mobile` |
| Android | Metro + Gradle | `pnpm android` |
| iOS | Metro + Xcode | `pnpm ios` |

There are two App entry points: `App.web.jsx` (web — uses manual state navigation because React Navigation's native modules don't exist in a browser) and `App.jsx` (native — uses `@react-navigation/native` stack navigator). All screen and component files are shared between both.

**Why Vite instead of the React Native CLI's built-in `--platform web` (Webpack)?**
The RN CLI web mode is noticeably slower to start and harder to configure inside an NX monorepo. Vite cold-starts in under 2 seconds, has first-class HMR, and NX's `@nx/vite` executor integrates cleanly with the workspace tooling already in use.

**Tradeoff:** Maintaining two App entry points (`App.jsx` vs `App.web.jsx`) and the Vite alias config adds a small amount of setup overhead. The benefit is that the full PTT + comms integration can be developed and tested entirely in a browser — no physical device, no Metro bundler, no simulator required — while the same source ships to real hardware unchanged.

## Hot Mic Protection: PTT Watchdog
**Problem:** Network drops or UI glitches could result in a "PTT_END" never firing, causing a device to continuously broadcast indefinitely over the expensive satellite connection.
**Decision:** Added a 60-second `pttWatchdog` timeout that automatically stops recording.
**Tradeoff:** Users holding the button for over 60 seconds will be abruptly cut off and must repress the button, but it prevents "hot mics" from burning through thousands of dollars of satellite airtime.

## Expo Go (Managed) vs Expo Development Build (Android Only)
**Problem:** Standard Expo Go only ships a pre-compiled set of native libraries. Our architecture requires `react-native-live-audio-stream` and `react-native-opus` custom C++ bindings for 60ms real-time chunk streaming. These are **not included** in Expo Go.
**Decision:** We transitioned to an **Expo Development Build (EAS)**. However, because our primary engineering environment is Fedora Linux, compiling the iOS Dev Build locally is impossible (requires macOS/Xcode). We therefore **dropped iOS support** for the current development phase and mandate Android testing.
**Tradeoff:** We lose the ability to test on iPhones locally. Engineers must use physical Android devices or the Android Studio emulator. This allows us to maintain the strict 60ms / 6kbps Opus streaming requirement for the 22kbps satellite link without paying for Apple Developer accounts or waiting for EAS Cloud iOS build queues.

## Hybrid Relay Clarification: Centralized DO Relay vs True Decentralized Mesh
**Problem:** The stated long-term goal is a "decentralized" architecture. However, `RelaySocket.ts` always connects to the DigitalOcean WebSocket relay. If the satellite/internet link drops, phones on the same local helicopter Wi-Fi network cannot communicate with each other at all.
**Decision:** This is by design — we use a **Hybrid Approach**. The DigitalOcean relay is the single mandatory dependency for standard operation. True local-mesh capability (deploying a micro-relay on the edge DLS-140 device) is a future phase. For the hackathon, the priority is strict bandwidth optimization over the DO relay so the 22kbps satellite link never saturates.
**Tradeoff:** Zero offline local-mesh capability today. If internet drops, all comms cease. Acceptable for hackathon scope. Future mitigation: run a lightweight Node.js relay binary on the DLS-140 device itself and point `VITE_WS_URL` to `ws://192.168.X.X:3000`.

## MockRelaySocket: Single-Device Loopback vs Multi-Device Testing
**Problem:** `MockRelaySocket.ts` simulates the server by echoing all messages back to the originating device after a 50ms delay. Its state lives entirely in local JS memory on a single device. If two engineers load the app on two different phones both using `MockRelaySocket`, they will never hear each other — messages are echoed back to themselves only.
**Decision:** `MockRelaySocket` is intentionally scoped to single-device loopback testing of the audio pipeline, floor control, and UI state. For multi-device integration testing before the real satellite link, engineers should run the lightweight local relay (`packages/relay` or equivalent Node.js relay script) on a laptop connected to the same Wi-Fi, and point both phones at `ws://192.168.X.X:3000`.
**Tradeoff:** No multi-device mock is built in; this requires a real (even if local) relay process. Acceptable because standing up a Node.js relay is trivial and tests the real code path rather than a more complex multi-device mock shim.

## Store-and-Forward / Redis
**Problem:** Satellite link reliability dropouts during handoff.
**Decision:** Best-effort delivery. Missed audio during a handoff dropout is not replayed — consistent with walkie-talkie behaviour. V2: client-side jitter buffer with local replay. We removed the Redis store-and-forward system entirely.

## AES-GCM Overhead vs 22kbps Satellite Budget

**Problem:** Total bandwidth budget calculation — including all protocol layers.

**Measured per-packet breakdown at 60ms frames, 6kbps Opus** (validated by `test-opus-pipeline.ts`):

| Layer | Bytes/frame | bps @ 16.7fps | % of 22kbps |
|---|---|---|---|
| Raw Opus audio | 42 | 5,600 | 25.5% |
| + AES-GCM (12B IV + 16B tag) | 70 | 9,333 | 42.4% |
| + Base64 encoding | 96 chars | 12,800 | 58.2% |
| + JSON framing (type+sessionId+chunk+data keys) | **159 bytes total** | **21,200** | **96.4%** |

**Headroom: 800 bps** — reserved for GPS heartbeats and PTT signalling control messages.

**Why 6kbps, not 8kbps:** The full protocol stack (AES-GCM 28B overhead → Base64 +33% inflation → JSON field names 63B/frame) means 8kbps Opus consumes ~24.9 kbps on the wire at worst-case CBR, blowing the 22kbps budget by ~13%. At 6kbps, worst-case is 21.2 kbps — 800 bps under budget. Opus at 6kbps retains excellent voice intelligibility (the quality cliff is below 4kbps). 6kbps CBR is the safe default; 8kbps is acceptable on strong cellular links where the satellite uplink is not the bottleneck.

**Note on field stripping:** AudioChunk messages strip `talkgroup`, `timestamp`, and `seq` fields that were previously sent on every frame. Those fields alone added ~56 bytes/packet (9,333 bps at 16.7fps). The server hub routes PTT_AUDIO via a `sessionId → talkgroup` map seeded at PTT_START — no per-chunk talkgroup field needed.

**Budget guidance:**
- Opus 6kbps + all overhead: ~21.2 kbps — fits 22kbps satellite uplink with 800 bps headroom ✓
- Opus 8kbps + all overhead: ~24.9 kbps — use only on cellular/strong satellite (> 3 bars) links
- Codec2 2400bps + all overhead: ~9.4 kbps — safe for weak satellite signal (< 2 bars)
- GPS_UPDATE heartbeats (~120 bytes each) at 10s interval: +96 bps — negligible
- Keep PTT sessions under 60s (watchdog enforced) to prevent link saturation

**Future path:** A binary WebSocket frame format (1B type, 4B sessionId, 3B chunk, raw Opus, 28B AES tag = ~96 bytes/frame) would reduce audio stream to ~12.8 kbps — well within budget with headroom for control messages. Tracked as post-hackathon optimisation.

## pnpm Workspaces + Metro Bundler Symlink Resolution
**Problem:** Metro bundler's default configuration doesn't follow symlinks, causing "Unable to resolve `expo-modules-core`" errors when using pnpm workspaces. pnpm's virtual store (`.pnpm/` directory) uses symlinks extensively to deduplicate packages. When Expo tries to import `expo-modules-core`, Metro can't follow the symlink chain through the virtual store.
**Decision:** Enable Metro's experimental `unstable_enableSymlinks` flag and add workspace `node_modules/` to `watchFolders`. Implement a smart ignore function that only watches Expo source files in `.pnpm/expo-*/node_modules/*/src/` to avoid opening 600k+ file handles for the entire node_modules tree.
**Tradeoff:**  
- **Memory overhead:** Metro now tracks ~200MB more file paths in memory
- **Startup time:** Metro cold start increases by ~2-3 seconds
- **inotify limits (Linux):** Requires increasing `fs.inotify.max_user_watches` from 8192 to 524288 to avoid "EMFILE: too many open files" errors
- **Benefits:** Keeps pnpm's ~3GB disk space savings and 2-3x faster install times compared to npm/yarn. Strict dependency isolation catches phantom dependencies early.

Alternative would be switching to npm/yarn with flat `node_modules`, which works with Metro out of the box but loses all pnpm benefits. For a monorepo with 3+ packages and shared dependencies, pnpm's advantages outweigh the Metro configuration complexity.

See [MOBILE_SETUP_TROUBLESHOOTING.md](./MOBILE_SETUP_TROUBLESHOOTING.md#issue-1-metro-bundler-cant-resolve-expo-modules-core) for implementation details.

## Web Crypto API Polyfill: Pass-Through for MVP vs Real AES-GCM
**Problem:** React Native's Hermes JavaScript engine doesn't implement the Web Crypto API (`crypto.subtle`). The `@forbiddenlan/comms` package uses `crypto.subtle.importKey()`, `encrypt()`, and `decrypt()` for AES-GCM audio encryption. Without this API, the app crashes immediately on initialization with "Property 'crypto' doesn't exist".
**Decision:** For MVP/hackathon testing, implement a **pass-through crypto polyfill** that mimics the Web Crypto API interface but performs no actual encryption. The polyfill prepends the IV to the data buffer (for API compatibility) but doesn't encrypt/decrypt the payload.
**Tradeoff:**  
- ⚠️ **SECURITY CRITICAL:** Audio is transmitted in plaintext. This is acceptable ONLY for:
  - Local testing with `MockRelaySocket` (no network transmission)
  - Hackathon demo environment with trusted network
  - **NOT acceptable for production deployment**
- **Time savings:** Implementing real AES-GCM (using `@noble/ciphers` or `react-native-quick-crypto`) would require 1-2 days for integration and testing
- **Testing:** Audio pipeline, PTT signaling, floor control, and UI can all be tested and demoed without encryption
- **Architecture:** Since encryption is end-to-end (relay server just forwards encrypted blobs), the pass-through approach unblocks all other development work

**Production Path Forward:**  
Replace `packages/mobile/src/shims/setup-crypto.js` with a real AES-GCM implementation:
- Option 1: `@noble/ciphers` (pure JS, 8KB gzipped, audited)
- Option 2: `react-native-quick-crypto` (native bindings, faster but requires custom native build)
- Option 3: `crypto-browserify` + `@aws-crypto/aes-gcm` (browser-compatible fallback)

Test with actual DLS-140 satellite hardware to verify performance doesn't degrade the 60ms chunk pipeline. Add key rotation testing once encryption is live.

See [MOBILE_SETUP_TROUBLESHOOTING.md](./MOBILE_SETUP_TROUBLESHOOTING.md#issue-2-crypto-doesnt-exist--cryptosubtle-is-undefined) for polyfill implementation details.
