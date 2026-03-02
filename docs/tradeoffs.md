# Design Tradeoffs
## Floor Control: Optimistic vs Server-side Grant
Chose optimistic GPS timestamp arbitration. Avoids 1–3s round-trip at satellite latency.
## Relay Architecture: Hybrid Centralized Relay vs Pure P2P Mesh
**Problem**: Iridium NAT prevents direct P2P between DLS-140 units, making a pure decentralized mesh impossible across remote sites.
**Decision**: We chose a **Hybrid Approach** with a central DigitalOcean relay. While we lose offline local-mesh capabilities if the internet drops, we prioritize extreme low-bandwidth optimizations (like `sessionId` compression) to ensure the fragile 22kbps satellite link to the centralized server never saturates.
## Codec: Opus vs Codec2
Adaptive. Opus 8kbps default, Codec2 2400bps fallback when signal < 2 bars.

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

## Expo Go (Managed) vs Expo Development Build (EAS Build)
**Problem:** Standard Expo Go only ships a pre-compiled set of native libraries. Our original `react-native-webrtc` dependency required custom C++/Objective-C bindings **not included** in Expo Go, which would crash with a `NativeModule not found` error. EAS Build (cloud compile) solves this but requires a paid Apple Developer Account ($99/yr) and cloud wait times.
**Decision:** We removed `react-native-webrtc` entirely and replaced our audio capture/playback hooks with Expo's official `expo-av` and `expo-file-system` modules. This makes the app a pure **Managed Expo** project that runs directly in the free Expo Go client — no Apple account, no Mac, no cloud builds.
**Tradeoff:** We lose access to WebRTC data channels and raw PCM streaming. `expo-av` records to a file rather than streaming 200ms chunks in real-time. For the hackathon demo this is acceptable (audio is sent on PTT release). If real-time streaming is needed later, we must migrate to an Expo Dev Build with a custom native audio module. See `docs/expo-migration.md` for the full decision log.

## Hybrid Relay Clarification: Centralized DO Relay vs True Decentralized Mesh
**Problem:** The stated long-term goal is a "decentralized" architecture. However, `RelaySocket.ts` always connects to the DigitalOcean WebSocket relay. If the satellite/internet link drops, phones on the same local helicopter Wi-Fi network cannot communicate with each other at all.
**Decision:** This is by design — we use a **Hybrid Approach**. The DigitalOcean relay is the single mandatory dependency for standard operation. True local-mesh capability (deploying a micro-relay on the edge DLS-140 device) is a future phase. For the hackathon, the priority is strict bandwidth optimization over the DO relay so the 22kbps satellite link never saturates.
**Tradeoff:** Zero offline local-mesh capability today. If internet drops, all comms cease. Acceptable for hackathon scope. Future mitigation: run a lightweight Node.js relay binary on the DLS-140 device itself and point `VITE_WS_URL` to `ws://192.168.X.X:3000`.

## MockRelaySocket: Single-Device Loopback vs Multi-Device Testing
**Problem:** `MockRelaySocket.ts` simulates the server by echoing all messages back to the originating device after a 50ms delay. Its state lives entirely in local JS memory on a single device. If two engineers load the app on two different phones both using `MockRelaySocket`, they will never hear each other — messages are echoed back to themselves only.
**Decision:** `MockRelaySocket` is intentionally scoped to single-device loopback testing of the audio pipeline, floor control, and UI state. For multi-device integration testing before the real satellite link, engineers should run the lightweight local relay (`packages/relay` or equivalent Node.js relay script) on a laptop connected to the same Wi-Fi, and point both phones at `ws://192.168.X.X:3000`.
**Tradeoff:** No multi-device mock is built in; this requires a real (even if local) relay process. Acceptable because standing up a Node.js relay is trivial and tests the real code path rather than a more complex multi-device mock shim.

## AES-GCM Overhead vs 22kbps Satellite Budget
**Problem:** Every AES-GCM encrypted payload carries a 12-byte IV and a 16-byte authentication tag — 28 bytes of overhead before the Base64 encoding multiplier (~1.37x). The `sessionId` optimization saves ~30 bytes per audio chunk. AES-GCM encryption can negate that saving entirely, potentially pushing each Opus frame over the ~100-byte budget that keeps the 22kbps link (~2,750 bytes/sec total) from saturating with multiple concurrent talkers.
**Decision:** Encryption overhead must be **measured** before the satellite integration test. Encrypt a representative 20ms Opus frame at 8kbps (roughly 20 bytes raw) and log the Base64 output length. If the encrypted payload consistently exceeds 100 bytes, the design must fall back to: encrypt the session key once at `PTT_START`, then transmit Opus `PTT_AUDIO` chunks **unencrypted** over the relay for that session.
**Tradeoff:** Unencrypted audio chunks over the DO relay expose voice content to anyone with relay access. This is acceptable for a hackathon demo but must be hardened before production. The alternative (per-chunk encryption at the cost of link saturation) renders the product non-functional in the field, which is a worse outcome.
