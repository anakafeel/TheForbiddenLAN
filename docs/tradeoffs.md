# Design Tradeoffs
## Floor Control: Optimistic vs Server-side Grant
Chose optimistic GPS timestamp arbitration. Avoids 1–3s round-trip at satellite latency.
## Relay Architecture: P2P vs Central Server
Chose central relay. Iridium NAT prevents direct P2P between DLS-140 units.
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

## Hot Mic Protection: PTT Watchdog
**Problem:** Network drops or UI glitches could result in a "PTT_END" never firing, causing a device to continuously broadcast indefinitely over the expensive satellite connection.
**Decision:** Added a 60-second `pttWatchdog` timeout that automatically stops recording.
**Tradeoff:** Users holding the button for over 60 seconds will be abruptly cut off and must repress the button, but it prevents "hot mics" from burning through thousands of dollars of satellite airtime.
