# SkyTalk — Saim's Comms Layer Demo Guide
**Your personal cheat sheet. March 7, 2026.**

---

## Your Domain

You own `packages/comms/` — the entire transport SDK that sits between the mobile UI and the relay server. Everything audio and network lives here. The mobile app calls your code. Your code calls the server.

```
packages/comms/src/
├── ForbiddenLANComms.ts   ← The main class. Entry point from the mobile app.
├── RelaySocket.ts         ← WebSocket client (control plane)
├── UdpSocket.ts           ← UDP socket (audio plane)
├── AudioPipeline.ts       ← FEC grouping, encryption, chunk dispatch
├── FloorControl.ts        ← PTT arbitration state machine
├── Encryption.ts          ← AES-GCM-256 wrapper
├── DLS140Client.ts        ← REST client for the satellite router's local API
├── GPSPoller.ts           ← Polls DLS-140 for GPS, sends GPS_UPDATE over relay
├── types.ts               ← All shared message types (MessageType, AudioChunk, etc.)
└── index.ts               ← Barrel export
```

---

## How the Mobile App Uses Your Code

The mobile app (`packages/mobile`) imports `ForbiddenLANComms` and uses the `useComms()` hook. Here's the full call chain:

```
App boots
  └─► useComms() hook (mobile/src/utils/comms.js)
        └─► new ForbiddenLANComms({ relayUrl, dls140Url, deviceId })
              └─► new RelaySocket()      // WebSocket shell, not yet connected
              └─► new UdpSocket()        // UDP shell, not yet connected
              └─► new FloorControl()     // state machine, idle
              └─► new GPSPoller()        // idle
              └─► new DLS140Client()     // REST client, idle

User logs in → comms.connect(jwt)
  └─► RelaySocket.connect(relayUrl, jwt)
        └─► ws = new WebSocket(relayUrl + "?token=" + jwt)
        └─► on 'open':
              emit('connect')             → ForbiddenLANComms re-joins talkgroup
              send SYNC_TIME              → server responds with serverTime
              schedule 60s resync timer
        └─► on 'message':
              parse JSON → emit(msg.type, msg) → ForbiddenLANComms handlers
        └─► on 'close':
              handleReconnect() with exponential backoff (1s, 2s, 4s... max 30s)

  └─► UdpSocket.connect(relayUrl, port, deviceId)   [triggered on 'connect' event]
        └─► dgram.createSocket('udp4')
        └─► socket.bind(0)   [ephemeral port]
        └─► send UDP_REGISTER {type, userId}
        └─► schedule 25s keep-alive timer (re-sends UDP_REGISTER)

User joins talkgroup → comms.joinTalkgroup(id)
  └─► relay.send({ type: 'JOIN_TALKGROUP', talkgroup: id, ... })
  └─► this.activeTalkgroup = id
```

---

## PTT Transmission — Your Code's Path

```
User presses PTT button
  └─► comms.startPTT(talkgroupId)
        └─► sessionId = Math.random() * 0xFFFFFFFF | 0   (4-byte int)
        └─► this.isTransmitting = true
        └─► relay.send(PTT_START { talkgroup, sender, sessionId, timestamp })
              ↑ timestamp = Date.now() + this.serverTimeOffset  (clock-drift corrected)
        └─► start 60s watchdog timer (auto-kills hot mic)
        └─► wait for FLOOR_GRANT from server before audio flows

Server → FLOOR_GRANT received
  └─► this.floorGranted = true
  └─► this.audio = new AudioPipeline(relay, udp, sessionId, talkgroup, deviceId, encryption)
  └─► audio.startRecording()

Native mic emits Opus frames (from Kotlin OpusEncoderModule)
  └─► comms.sendAudioChunk(base64OpusFrame)
        └─► AudioPipeline.enqueueChunk(base64OpusFrame)
              └─► encrypt(chunk) via Encryption.ts (AES-GCM-256)
              └─► push to fecBuffer[]
              └─► if fecBuffer.length >= 4: sendFecGroup()
                    └─► XOR all 4 chunks → parity chunk
                    └─► send 5 messages: PTT_AUDIO × 4 + PTT_AUDIO_PARITY × 1
                          └─► via UdpSocket.send() (AudioPipeline.useUdp === true)
                          └─► else: relay.send() fallback

User releases PTT
  └─► comms.stopPTT()
        └─► this.isTransmitting = false
        └─► this.floorGranted = false
        └─► audio.stopRecording()
        └─► relay.send(PTT_END { talkgroup, sender, sessionId })
        └─► clear watchdog timer
```

---

## PTT Reception — Your Code's Path

```
UDP datagram arrives (other device transmitting)
  └─► UdpSocket 'message' event
        └─► JSON.parse → emit(msg.type, msg)

ForbiddenLANComms 'PTT_AUDIO' handler
  └─► if (this.isTransmitting) return;   ← HALF-DUPLEX: drop while TX
  └─► deduplicate by sessionId+chunk (both UDP and WebSocket may deliver it)
  └─► decrypt via Encryption.ts
  └─► emit 'PTT_AUDIO' event → mobile app's comms.js handler
        └─► mobile feeds base64 Opus to OpusDecoderModule.kt
        └─► Kotlin decodes → AudioTrack plays

PTT_END arrives
  └─► audio stops, floor released
  └─► FloorControl.release(talkgroup)
```

---

## Your Key Files Explained

### `RelaySocket.ts` — The WebSocket Shell

Thin wrapper around the `ws` library (shimmed to the browser's native WebSocket via Metro for RN). Key things:

- **`connect(url, jwt)`** — opens `ws://host?token=jwt`. JWT goes in the query string, not a header (WebSocket handshake doesn't support custom headers reliably across RN implementations).
- **`on(type, handler)`** — typed event emitter. Handlers register for specific `MessageType` strings, or `'*'` for all messages.
- **`send(msg)`** — `JSON.stringify` + `ws.send()`.
- **`handleReconnect()`** — exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max). Currently hard-capped at 5 attempts (you may want to make this unlimited — satellite links can drop for minutes during orbital handoffs).
- **Periodic SYNC_TIME** — every 60s, sends another clock sync to correct drift over long sessions.

> **Current limitation:** The reconnect handler doesn't re-join the active talkgroup. `ForbiddenLANComms` listens for `'connect'` and does it, but only if `activeTalkgroup` was already set.

### `UdpSocket.ts` — The Audio Fast Lane

Uses `react-native-udp` (a native module — not available on web). Key things:

- **`connect(url, port, userId)`** — parses host from WS URL, creates UDP socket, binds to ephemeral port 0 (OS assigns), sends `UDP_REGISTER`.
- **`UDP_REGISTER` keep-alive every 25s** — critical on SATCOM. Iridium Certus CGN NAT mappings expire in ~30s without traffic. Without this, the server would try to fan out audio to a dead NAT port.
- **`txCount` / `rxCount`** — logged at first 3 packets then every 100th. Useful for debugging whether audio is actually flowing.
- **`_transport: 'udp'` tag** — injected on every received message so the mobile app can dedup (UDP and WebSocket both deliver PTT_AUDIO; the first one wins, the duplicate is dropped).

### `AudioPipeline.ts` — FEC + Encryption + Dispatch

This is where you added application-level FEC on top of the Opus codec-level FEC.

**Two-layer FEC:**
1. **Opus INBAND FEC** (in the native C++ encoder) — configured via `OPUS_SET_INBAND_FEC(1)`. Each encoded frame contains enough redundancy to reconstruct the *previous* frame. Handles individual dropped packets.
2. **XOR parity FEC** (your code in AudioPipeline) — groups 4 chunks, computes XOR parity, sends as 5th chunk. If any one of the 4 data chunks is lost, it can be reconstructed from `parity XOR remaining_3`. Handles burst loss situations.

**FEC overhead:** 1 parity per 4 data = 20% overhead. At 6 kbps Opus → effectively 7.2 kbps equivalent. Still fits budget.

**Minimum latency from FEC grouping:** The pipeline buffers chunks until it has 4 before flushing. At 16.7 fps (60ms frames), that's `4 × 60ms = 240ms` additional pipeline latency before any audio sends. Trade-off: burst loss recovery vs first-frame-to-wire latency.

**`AudioPipeline.useUdp` static flag** — controls whether `enqueueChunk` sends via UDP or falls back to WebSocket. Currently always `true`. The intent was to wire this to `DLS140Client.getStatus().activeLink` so satellite → UDP, cellular → WebSocket. **This is not wired yet.** See the distributed architecture doc.

### `FloorControl.ts` — The Arbitration State Machine

```
PTT_START received → arbitrate(msg)
  └─► push {sender, timestamp} into pending[talkgroup]
  └─► start 50ms timer (collision window)
  
Timer fires → pickWinner(talkgroup)
  └─► find candidate with lowest timestamp
  └─► tiebreak: lexically smallest sender UUID
  └─► floors.set(talkgroup, { holder: winner.sender, ... })
```

**Important:** The server also runs this (or a similar) algorithm. `FloorControl.ts` is the *client-side* arbitration class. In the current build, the server is authoritative — it sends `FLOOR_GRANT` / `FLOOR_DENY` and your code trusts those. `FloorControl.ts` is used on the server side in `hub.ts`. On the client you just wait for `FLOOR_GRANT`.

**`setFloor(talkgroup, holder, timestamp)`** — called when `FLOOR_GRANT` arrives from server. Syncs local state.

**`release(talkgroup)`** — called on `PTT_END` / `FLOOR_RELEASED`. Clears floor + pending candidates + timer.

### `types.ts` — Message Contract

The canonical type definitions for everything over the wire. Key design decisions embedded here:

```typescript
// AudioChunk strips sender, talkgroup, timestamp, seq
// from PTTMessage — saves ~56 bytes per chunk on the 22kbps satellite link
export interface AudioChunk extends Omit<PTTMessage, 'sender' | 'talkgroup' | 'timestamp' | 'seq'> {
  type: 'PTT_AUDIO';
  chunk: number;
  data: string;   // base64-encoded Opus frame (AES-GCM encrypted)
}
```

The server routes PTT_AUDIO by mapping `sessionId → talkgroup` (seeded at PTT_START). This is why we can strip `talkgroup` from every audio chunk and save ~12 bytes per packet.

### `DLS140Client.ts` — The Hardware Bridge

REST client for the DLS-140's local API (`http://192.168.1.1:8080`). Fetches:
- GPS position (lat/lng/alt)
- Signal bars (Iridium Certus signal strength 0–5)
- Active link type (`satellite` / `cellular`)
- Firewall profile (can set to `unrestricted` to allow return satellite traffic)

The mobile `DashboardScreen` and `PTTScreen` display this data in real-time via `GPSPoller`.

---

## The Clock Drift Problem (SYNC_TIME)

Floor arbitration uses GPS timestamps to pick the winner when two devices press PTT simultaneously. If Phone A's clock is 200ms ahead of Phone B's, Phone A always wins arbitration — unfairly.

**Your fix:** On WebSocket `connect`, send:
```json
{ "type": "SYNC_TIME", "clientTime": 1709820000000 }
```
Server replies:
```json
{ "type": "SYNC_TIME", "clientTime": 1709820000000, "serverTime": 1709820000482 }
```
You calculate:
```typescript
const rtt = Date.now() - msg.clientTime;           // ~900ms on SATCOM
this.serverTimeOffset = msg.serverTime - msg.clientTime - rtt / 2;
// ≈ serverTime - clientTime - 450ms
```
All subsequent `PTT_START` timestamps use `Date.now() + this.serverTimeOffset` — everyone agrees on server-relative time.

---

## Half-Duplex Protection

If you receive audio while transmitting, two things happen:
1. **Audio corruption** — your outgoing and their incoming Opus frames interleave at the decoder on other devices.
2. **Link saturation** — you're consuming the 22 kbps uplink both directions simultaneously.

```typescript
// ForbiddenLANComms.ts PTT_AUDIO handler
if (this.isTransmitting) return;  // drop all incoming audio while transmitting
```

The `isTransmitting` flag is set on `startPTT()` and cleared on `stopPTT()`.

---

## PTT Watchdog

```typescript
private readonly MAX_TX_MS = 60000;

// On PTT_START:
this.watchdogTimer = setTimeout(() => {
  console.warn('[ForbiddenLANComms] PTT watchdog fired — forcing stopPTT');
  this.stopPTT();
}, this.MAX_TX_MS);
```

If PTT_END never sends (network drop, UI crash, user walks away), the floor auto-releases after 60s client-side + 65s server-side (server watchdog has 5s margin). A hot mic on Iridium Certus costs real money.

---

## The Bandwidth Math (Your Numbers)

At **6 kbps Opus, 60ms frames, 16.7 fps:**

| What | Bytes/frame | Wire kbps |
|---|---|---|
| Raw Opus | 42 | 5.6 |
| + AES-GCM (12B IV + 16B tag) | 70 | 9.3 |
| + Base64 (+33%) | 96 | 12.8 |
| + JSON frame (`{type,sessionId,chunk,data}`) | **159** | **21.2** |

22 kbps budget − 21.2 = **800 bps headroom** for GPS heartbeats and WebSocket control.

**Strip fields that matter:** Before you stripped `talkgroup`, `timestamp`, `seq`, `sender` from `AudioChunk`, each packet was ~215 bytes (35.9 kbps) — over budget by 63%. The field stripping alone brought it from over-budget to viable.

---

## Bugs You Hit and Fixed

### The Transport Swap Bug
`ForbiddenLANComms.setTransportMode()` was wired up but internally the code always set `AudioPipeline.useUdp = true` regardless of the mode parameter. So audio always went UDP even on cellular. This was intentional during development (cellular RTT is low enough that UDP works fine), but the transport selection based on `DLS140Client.getStatus().activeLink` is still not wired in production.

### The Reconnect Talkgroup Bug
After WebSocket reconnect, `JOIN_TALKGROUP` was never re-sent. The server drops all socket state on disconnect — the `rooms` map entry for your old socket is removed. Your new socket arrives as a stranger.

**Fix:** In `ForbiddenLANComms.ts`, the `'connect'` event handler re-sends:
```typescript
this.relay.on('connect', () => {
  if (this.activeTalkgroup) {
    this.relay.send({ type: 'JOIN_TALKGROUP', talkgroup: this.activeTalkgroup, ... });
  }
  this.relay.send({ type: 'SYNC_TIME', clientTime: Date.now() });
  // Re-register UDP
  this.udp.connect(...).catch(...);
});
```

### The SATCOM Login Timeout Bug
HTTP fetch for login had a 60s timeout. Over SATCOM with 1,500ms RTT and 15% packet loss, a TLS handshake + auth crypto + JWT sign can take 30–45 seconds. The fetch was timing out and showing "Server error" when the server was actually processing fine.

**Fix:** Increased to 90s in `LoginScreen.tsx`.

### The UDP Host Parsing Bug
`UdpSocket.connect()` was given the full relay URL: `ws://134.122.32.45:3000/ws`. Naively doing `new URL(url).hostname` failed in React Native's non-standard URL parser. The host was being parsed as `""` so UDP packets were sent to `0.0.0.0`.

**Fix:**
```typescript
this.host = url
  .replace(/^wss?:\/\//, '')
  .replace(/^https?:\/\//, '')
  .replace(/\/.*$/, '')          // strip path first
  .replace(/:\d+$/, '');         // then strip port
```

---

## What's Working vs. What Isn't

| Feature | Status |
|---|---|
| WebSocket connect / auth / reconnect | ✅ Working |
| UDP socket + 25s keep-alive | ✅ Working |
| PTT_START / FLOOR_GRANT / FLOOR_DENY / PTT_END | ✅ Working |
| PTT_AUDIO via UDP | ✅ Working |
| Half-duplex (drop RX while TX) | ✅ Working |
| Clock drift correction (SYNC_TIME) | ✅ Working |
| Talkgroup re-join after reconnect | ✅ Working |
| PTT watchdog (60s auto-release) | ✅ Working |
| Application-level XOR FEC (AudioPipeline) | ✅ Implemented, needs E2E test |
| AES-GCM-256 encryption | ✅ Implemented, stub key (not E2E with key exchange yet) |
| `setTransportMode()` actually selecting UDP vs WebSocket | ⚠️ Ignored — always UDP |
| `DLS140Client.getStatus().activeLink` wired to transport | ❌ Not yet |
| FLOOR_RELEASED causing `FloorControl.release()` | ✅ Working |
| Codec2 fallback at < 2 signal bars | ❌ Not implemented (future) |
| Group key exchange for true E2E encryption | ❌ Not implemented (design in distributed-architecture.md) |

---

## Common Judge Questions — Your Answers

**Q: How does floor control work?**
"PTT_START goes over WebSocket — guaranteed delivery. Server maintains a floor map per talkgroup. If the floor is free, server sends `FLOOR_GRANT` and fans out the `PTT_START` to all members. If busy, it sends `FLOOR_DENY` back to the requester. Every `PTT_AUDIO` frame is validated against the current floor holder — frames from non-holders are dropped by the server. We also use a 50ms collision window so if two people press simultaneously, the lowest GPS timestamp wins deterministically."

**Q: Why UDP and not just TCP?**
"On a 1,000ms round-trip satellite link, TCP retransmission causes a 2–3 second audio freeze per dropped packet. We hit this in our first live satellite test — the audio sounded like a voicemail. UDP means a dropped packet is a brief click, not a freeze, because Opus FEC reconstructs the missing frame from the next one."

**Q: Does encryption work?**
"AES-GCM-256 is implemented in `Encryption.ts` and wired through `AudioPipeline`. The payload is encrypted before base64 encoding. What's not implemented yet is group key exchange — right now everyone uses a stub shared key. True E2E means each talkgroup gets a pre-provisioned AES key distributed by the admin during device provisioning."

**Q: What happens if the satellite link drops mid-call?**
"The client side: UDP socket can't reach the server. No PTT_END gets through. The server watchdog fires after 65 seconds and force-releases the floor. When the link comes back up, `RelaySocket` reconnects with exponential backoff and re-joins the talkgroup automatically. On the RX side: the listeners just hear audio up to the dropout, then silence."

**Q: How do you prevent multiple phones from talking at once?**
"Server-authoritative floor control. Only one device can hold the floor per talkgroup at any time. The server enforces it — it validates the sessionId on every `PTT_AUDIO` frame against the floor holder map and silently drops frames from devices that don't hold the floor. There's no way for a client to bypass this."

---

## Demo Checklist (Comms Layer Perspective)

Before demo:
- [ ] Server running at `134.122.32.45:3000` (check `pm2 status` on the droplet)
- [ ] Both phones logged in — check server logs for `[hub] joined talkgroup`
- [ ] UDP registered — check server logs for `[hub] UDP_REGISTER: userId=... from ...`
- [ ] Both phones in same talkgroup

During demo:
- [ ] Press PTT → server logs should show `PTT_START ... FLOOR_GRANT ... PTT_AUDIO fanned to N peers`
- [ ] Other phone hears audio → confirms UDP path is working
- [ ] Try to interrupt (second phone hits PTT while first is transmitting) → server logs `FLOOR_DENY`
- [ ] Release PTT → `PTT_END ... FLOOR_RELEASED`

Server log patterns to show judges:
```
[hub] joined talkgroup 'alpha' — userId=xxx (1 online)
[hub] UDP_REGISTER: userId=xxx from 70.33.239.14:54321 (total: 2)
[hub] PTT_START from xxx — floor free → FLOOR_GRANT, fanned to 1 peer(s)
[hub] PTT_AUDIO chunk 1 from xxx — fanned to 1 peer(s) via UDP
[hub] PTT_END from xxx — FLOOR_RELEASED, fanned to 1 peer(s)
```

---

## If Something Breaks During Demo

| Symptom | Likely Cause | Quick Fix |
|---|---|---|
| One phone can't hear the other | UDP registration failed | Check server for `UDP_REGISTER` log. Restart app on that phone. |
| Audio sounds like a voicemail | WebSocket being used instead of UDP | Check `AudioPipeline.useUdp === true`. Server may have blocked UDP. |
| Floor never releases | Watchdog didn't fire | Wait 65s. If still stuck: server restart → `pm2 restart all` on droplet. |
| Login hangs | SATCOM link is < 1 bar | Wait for signal or switch to cellular (toggle on DLS-140 admin page). |
| No audio at all | Talkgroup not joined | Check server logs. App may have not sent `JOIN_TALKGROUP` after reconnect. |
| "Connection refused" on second phone | `usesCleartextTraffic` or server down | Test server with `curl http://134.122.32.45:3000/health` from phone browser. |

---

*You own the layer that makes the walkie-talkie actually work. Everything else is UI.*
