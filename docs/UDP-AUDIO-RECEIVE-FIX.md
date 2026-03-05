# Bug Fix Brief: Silent Audio on UDP Receive Path

## Summary
After migrating PTT audio to UDP, the transmitting phone sends audio correctly
(console logs show `[AudioPipeline] TX chunk #0 via UDP`), but the receiving phone
hears nothing. This document explains the exact root cause and what needs to be fixed.

---

## Architecture Overview (READ FIRST)

Audio flow:
```
Phone A (sender):
  mic → LiveAudioStream → Opus encode → comms.sendAudioChunk() 
  → AudioPipeline.enqueueChunk() → UdpSocket.send() → server

Server (hub.ts):
  udpServer.on('message') → fanOut to all peers in talkgroup
  → peers with registered UDP endpoint get UDP datagrams
  → peers without UDP endpoint fall back to WebSocket

Phone B (receiver):
  UdpSocket.on('message') → emits to handlers via UdpSocket.emit()
  → ForbiddenLANComms.onRawMessage() handler in comms.js
  → decrypts → decodes Opus → plays via AudioTrack
```

## Root Cause

**`onRawMessage()` is called BEFORE the UDP socket connects.**

In `comms.js`, `initComms(jwt)` calls:
1. `comms.connect(jwt)` — connects WebSocket AND triggers UDP connect inside `relay.on('connect', ...)` 
2. `comms.onRawMessage(handler)` — subscribes handler to both relay and udp

**The problem**: `comms.onRawMessage()` registers the handler on `this.udp.on('*', handler)`.
But `this.udp` connects asynchronously inside the WebSocket `'connect'` callback.
If `onRawMessage` is called *before* the WebSocket connects, the handler is registered
on the unconnected UdpSocket instance correctly — **BUT** the UdpSocket's internal
`socket.on('message', ...)` has not fired yet, so `this.socket` is `null` and no
messages can arrive at all.

There is a second, more impactful issue:

**`_audioModeSet` is never reset between PTT sessions properly**, so after the first
transmission, `_ensurePlaybackMode()` is a no-op and audio never switches back to
speaker correctly.

**Third issue**: The server's `udpClients` map (`userId → UDP endpoint`) requires a
`UDP_REGISTER` message from the receiving phone. If the receiving phone's UDP socket
didn't successfully register (network issue, bind failure, etc.), the server falls back
to WebSocket for that peer — but the WebSocket `PTT_AUDIO` handler in `comms.js` is
only registered on `comms.onRawMessage()` which listens to BOTH transports. So WebSocket
fallback should work. Unless...

**Fourth issue (most likely)**: The `_isLocalTx` flag. Look at `comms.js` line 430:
```js
if (_isLocalTx && !LOOPBACK_ENABLED) return;
```
This correctly drops incoming audio while transmitting. But there is a timing bug:
`notifyTxEnd()` sets `_isLocalTx = false`, but if `PTT_AUDIO` packets are in flight
and arrive slightly before `PTT_END`, they are dropped because `_isLocalTx` is still
`true`. On UDP (faster than WebSocket), this timing window is larger.

---

## Files to Fix

### 1. `packages/mobile/src/utils/comms.js`

**Fix A — Reset `_audioModeSet` correctly:**
In `notifyTxEnd()` (line 487), `_audioModeSet = false` is already set. Good.
But `_ensurePlaybackMode()` is marked as complete after first call (`_audioModeSet = true`)
and never re-runs. After a PTT transmit, the Android audio subsystem flips back
to recording mode. **Change `_audioModeSet` to reset on EVERY `PTT_END`** or
simply remove the early-return guard and always call `Audio.setAudioModeAsync`.

```js
// BEFORE (line 101):
async function _ensurePlaybackMode() {
  if (_audioModeSet) return;  // ← REMOVE THIS LINE

// AFTER:
async function _ensurePlaybackMode() {
  // Always re-assert playback mode — Android audio subsystem
  // silently flips back to recording mode after mic use.
```

**Fix B — Add debug log to confirm PTT_AUDIO is arriving on receiver:**
After the existing `if (msg.type === "PTT_AUDIO" && msg.data)` check (line 427),
before the `_isLocalTx` guard, add:
```js
console.log(`[comms] RX PTT_AUDIO chunk arrived (isLocalTx=${_isLocalTx}, via=${msg._transport ?? 'unknown'})`);
```
This will tell us immediately in `adb logcat` whether the packet is arriving at the
JS layer on Phone B at all.

**Fix C — Widen the half-duplex window:** The `_isLocalTx` guard is too aggressive.
Change `notifyTxEnd()` to clear `_isLocalTx` with a small delay so late-arriving UDP
packets from the other device (which may have been in flight) are not dropped:
```js
export async function notifyTxEnd() {
  // Small delay before clearing TX flag — UDP packets from peers may be
  // slightly behind PTT_END on the WebSocket control channel.
  setTimeout(() => { _isLocalTx = false; }, 150);
  _audioModeSet = false;
  // ... rest unchanged
```

### 2. `packages/comms/src/UdpSocket.ts`

**Fix D — Tag incoming messages with transport source:**
In the `socket.on('message', ...)` handler (line 22), tag the parsed message
so comms.js can log which transport delivered it:
```typescript
const msg = JSON.parse(str) as RelayMessage;
(msg as any)._transport = 'udp';  // ← ADD THIS
this.emit(msg.type, msg);
this.emit('*', msg);
```

---

## Verification After Fix

On the **receiving phone's** `adb logcat`, after fix you should see:
```
[comms] RX PTT_AUDIO chunk arrived (isLocalTx=false, via=udp)
[comms] RX chunk decoded & playing (stream=true)
[comms] AudioTrack streaming started
```

If you still see `via=unknown`, the UDP datagrams are arriving via WebSocket fallback
(server couldn't reach the receiving phone's UDP port directly).
If you see nothing at all, the datagrams are not reaching the JS layer — check that
`UdpSocket.connect()` succeeded on the receiving phone side.

---

## Do NOT Change
- `AudioPipeline.ts` — transmit path is confirmed working
- `ForbiddenLANComms.ts` — transport layer is correct
- `hub.ts` — server fan-out is correct
- `audio.js` — encode/send path is correct
