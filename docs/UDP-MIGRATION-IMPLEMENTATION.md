# UDP Audio Migration — Claude Implementation Guide

## Context & Goal
The PTT audio is causing "store-and-go" behaviour because it currently runs over WebSocket (TCP). Engineers flagged this. We need to move audio permanently to UDP so it behaves like a real walkie-talkie: transmitted in real-time, dropped packets cause a brief Opus FEC-concealed click rather than a freeze.

**Control messages stay on WebSocket.** Only PTT_AUDIO moves to UDP.

## Pre-Read This Before Starting

The codebase already has 90% of the plumbing. Do NOT rewrite things from scratch.

| Already exists | What it does |
|---|---|
| `UdpSocket.ts` | Opens a UDP socket, send/receive JSON, keep-alive pings |
| `hub.ts` `startUdpServer()` | UDP listener on the server, already fans out PTT_AUDIO to peers |
| `AudioPipeline.ts` `useUdp` static flag | Already toggles between WS and UDP per-chunk |
| `ForbiddenLANComms.ts` `setTransportMode()` | Already calls `AudioPipeline.useUdp = true` |

**The only actual change needed:** Make `useUdp = true` the permanent default. Remove the UI toggle that switches it on/off. The UDP audio channel should always be active regardless of Cellular or SATCOM mode.

---

## File-by-File Changes

### 1. `packages/comms/src/AudioPipeline.ts`

**Current state (line 14):**
```typescript
public static useUdp = false;
```

**Change to:**
```typescript
public static useUdp = true;
```

**That is the only change to this file.** Do not touch anything else.

---

### 2. `packages/comms/src/ForbiddenLANComms.ts`

**Current `setTransportMode` method (lines 249–252):**
```typescript
setTransportMode(mode: 'cellular' | 'satcom'): void {
  AudioPipeline.useUdp = mode === 'satcom';
  console.log(`[ForbiddenLANComms] Transport mode set to ${mode.toUpperCase()} (UDP ${AudioPipeline.useUdp ? 'enabled' : 'disabled'})`);
}
```

**Change to:**
```typescript
setTransportMode(mode: 'cellular' | 'satcom'): void {
  // UDP is always enabled for audio — the mode flag now only controls
  // whether satellite visibility prediction is active (for NORAD UI).
  // Audio always goes over UDP on both cellular and SATCOM.
  AudioPipeline.useUdp = true;
  console.log(`[ForbiddenLANComms] Network mode set to ${mode.toUpperCase()} — audio always routes via UDP`);
}
```

**Do NOT remove this method.** The PTTScreen.jsx calls it and we want the method signature to stay identical.

---

### 3. `packages/mobile/src/screens/PTTScreen.jsx`

Find the toggle that switches between Cellular and SATCOM and remove the label implication that it controls the audio protocol. The toggle can remain (it still controls the satellite predictor UI), but update the label:

**Find:** Any text label that says "Cellular" / "SATCOM" in context of "audio mode" or "transport mode"  
**Change label to:** "SATCOM Link" (the toggle now just means "I'm on the SATCOM router, show me satellite predictions")

> [!NOTE]
> Do NOT remove the `setTransportMode` call from the toggle handler. It still needs to run to control the satellite predictor.

---

### 4. `packages/server/src/ws/hub.ts`

**Already correct.** The server already:
- Runs `startUdpServer()` with a UDP listener
- Has `udpClients` map (userId → remote UDP address)
- `fanOut()` already prefers UDP for audio messages (see the `isAudio` flag)

**The only thing to verify:** `startUdpServer` is called on server startup. Check `packages/server/src/index.ts`.

**In `packages/server/src/index.ts`**, look for: `startUdpServer` or the UDP port config. Ensure it is called with the same port as the WebSocket server (default: `3000`).

If it is not already there, add to `index.ts`:
```typescript
import { startUdpServer } from './ws/hub.js';
// ...after fastify setup:
startUdpServer({ port: 3000 });
```

**Do not change anything else in hub.ts.**

---

### 5. `packages/comms/src/UdpSocket.ts`

**Already correct.** Do NOT change this file except for one optional reliability improvement:

The current `send()` method fires-and-forgets. This is correct for audio. But the keep-alive ping re-sends `UDP_REGISTER` every 25 seconds. This is good. Leave it.

**Optional but recommended — add a sequence number to audio sends** for jitter buffer ordering (do this only if there is time):
```typescript
private audioSeq = 0;

sendAudio(msg: object): void {
  const frame = { ...msg, _udpSeq: this.audioSeq++ };
  this.send(frame);
}
```

And call `udp.sendAudio(msg)` from `AudioPipeline.ts` instead of `udp.send(msg)`. This is purely additive and non-breaking.

---

## What NOT to Touch

| File | Why |
|------|-----|
| `RelaySocket.ts` | WebSocket for control — do not touch |
| `FloorControl.ts` | Logic is correct — do not touch |
| `hub.ts` PTT_START / PTT_END handling | These stay on WebSocket correctly |
| `hub.ts` floor control | Do not touch |
| Any auth/JWT code | Do not touch |
| `satellite predictor` / NORAD code | Unrelated — do not touch |
| `OpusFECEncoder` / CMakeLists | Unrelated — do not touch |

---

## Verification Checklist

After making changes, verify each step:

### Step 1: Server UDP port is open
```bash
# Start the server
cd packages/server && npm run dev
# Confirm UDP is listening:
# You should see: "[hub] UDP server listening on 0.0.0.0:3000"
```

### Step 2: Build and install on device
```bash
npx expo run:android --variant release --device
```

### Step 3: Functional test (two phones OR loopback)
1. Open PTTScreen on both phones
2. Phone A: press and hold PTT — speak  
3. Phone B: audio should arrive in ~800ms (SATCOM) or ~50-80ms (cellular), **no stutter**
4. Observe `adb logcat | grep UdpSocket` — should see TX/RX log lines during PTT
5. If audio is choppy: check that Opus FEC is active (initEncoder was called)

### Step 4: Confirm no regression
1. Regular text messages still work
2. Talkgroup join/leave still works
3. Floor control (blocking walk-ons) still works
4. The SATCOM mode toggle still shows/hides satellite count

---

## Compatibility with Shri's Future Distributed Backend

**Zero changes needed on the mobile client when Shri ships the new architecture.**

Shri's `distributed-architecture.md` explicitly states PTT_START/AUDIO/END are in "Role 1: Relay" and stay unchanged. The UDP sidecar in `hub.ts` taps into the same fan-out logic. When Shri's backend ships, only `hub.ts`'s room-map fan-out needs to be replaced with a message queue publish — the UDP socket listener code is untouched.

---

## Summary of Changes (4 lines total)

```diff
// AudioPipeline.ts line 14
- public static useUdp = false;
+ public static useUdp = true;

// ForbiddenLANComms.ts line 250
- AudioPipeline.useUdp = mode === 'satcom';
+ AudioPipeline.useUdp = true;

// PTTScreen.jsx — update toggle label only (no logic change)
// index.ts — confirm startUdpServer({ port: 3000 }) is called (add if missing)
```
