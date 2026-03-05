# Audio Pipeline Debug Handoff

**Date:** 2026-03-05  
**Written for:** Any AI or engineer picking up this codebase  
**Project:** TheForbiddenLAN (SkyTalk) — push-to-talk radio app over satellite  
**Repo structure:** Nx monorepo — `packages/server`, `packages/comms`, `packages/mobile`

---

## System Overview (What You Need to Know)

SkyTalk is a walkie-talkie app. Users press a PTT button, their mic audio is captured as 16kHz mono PCM, encoded to Opus at 16kbps CBR (60ms frames), optionally AES-GCM-256 encrypted, and sent to a relay server. The server fans out the audio to all other users in the same talkgroup. Receivers decode Opus back to PCM and play it through the speaker in real time.

Two transport paths exist:
- **WebSocket (WS):** TCP-based, reliable, higher overhead. Path: mobile → WS → server hub.ts `PTT_AUDIO` case → `fanOut()` → WS to peers
- **UDP:** Lossy but lower latency and bandwidth. Path: mobile → UDP datagram → server hub.ts `udpServer.on('message')` → UDP datagram to peers

The goal is UDP-only to save bandwidth on the satellite link (Iridium Certus, 22kbps uplink).

**Server:** Fastify + @fastify/websocket + Prisma + Postgres 16. Production at `134.122.32.45:3000` (DigitalOcean droplet, maintained by Shri).  
**Mobile:** Expo SDK 50 bare workflow. Native Kotlin modules for Opus encoding/decoding and AudioTrack streaming. Requires `expo run:android` (NOT `expo start`/Expo Go).  
**Comms library:** `packages/comms` — TypeScript classes (ForbiddenLANComms, RelaySocket, UdpSocket, AudioPipeline, FloorControl).

---

## Issue #1: Audio Packets Not Relayed (Server-Side Silent Drop)

### Symptom
Sender's phone shows TX chunks being sent. Server receives them (visible in UDP logs). But no audio arrives at the receiver. Receiver logs show `frames=0`. No errors anywhere.

### Root Cause
The server's UDP `PTT_AUDIO` handler in `packages/server/src/ws/hub.ts` had multiple guard conditions that silently returned without logging:

```typescript
// ORIGINAL BROKEN CODE (pseudocode)
if (parsed.type === 'PTT_AUDIO') {
  const tg = sessionTalkgroup.get(parsed.sessionId);
  if (!tg) return;                       // ← silent drop #1
  const holder = talkgroupFloor.get(tg);
  if (!holder) return;                    // ← silent drop #2
  if (holder.sessionId !== parsed.sessionId) return; // ← silent drop #3
  // ... relay logic
}
```

Three scenarios caused drops:
1. **`sessionTalkgroup` miss:** UDP audio arrived before the WS `PTT_START` message was processed (race condition), or the server restarted and the in-memory map was cleared. `sessionTalkgroup` had no entry for the `sessionId`, so `tg` was `undefined`.
2. **No floor holder:** `talkgroupFloor` didn't have an entry for the talkgroup because `PTT_START` wasn't processed yet or the floor was auto-released by the watchdog timer.
3. **Session ID mismatch:** The mobile app generates a new random `sessionId` on each PTT press. If the user releases and re-presses PTT quickly, the `sessionId` in the UDP audio packet doesn't match the `sessionId` stored in the floor holder record.

All three cases did a bare `return` with zero logging, making the problem invisible.

### Fix Applied (in hub.ts)

**File:** `packages/server/src/ws/hub.ts`, lines 57–135

1. **Talkgroup fallback recovery:** If `sessionTalkgroup.get(sessionId)` misses, the handler now checks `parsed.talkgroup` (AudioPipeline includes the talkgroup field on every chunk). If found, it self-heals the map:
   ```typescript
   if (!tg && parsed.talkgroup) {
     tg = parsed.talkgroup;
     sessionTalkgroup.set(parsed.sessionId, tg);
     console.warn(`[hub] UDP PTT_AUDIO: recovered tg from message: ${tg}`);
   }
   ```

2. **Session mismatch recovery:** Instead of dropping audio when `holder.sessionId !== parsed.sessionId`, the handler now checks if the sender's UDP address matches the floor holder's registered address. If it matches (same device, new session), the session is updated:
   ```typescript
   const holderUdp = udpClients.get(holder.senderId);
   const senderMatch = holderUdp && holderUdp.address === rinfo.address && holderUdp.port === rinfo.port;
   if (senderMatch) {
     sessionTalkgroup.set(parsed.sessionId, tg);
     holder.sessionId = parsed.sessionId;
   }
   ```

3. **Comprehensive logging on every guard:** Every `return` now logs what happened and why, with the chunk number and session ID in hex.

### Fix Status
- **Local server:** Fixed and running (PID 2148025 on 192.168.2.133:3000)
- **Production server (134.122.32.45):** NOT DEPLOYED. Shri needs to pull and rebuild. Until then, production still silently drops UDP audio.

---

## Issue #2: userId vs deviceId Mismatch (UDP Relay Lookup Failure)

### Symptom
Server receives UDP audio, finds the talkgroup, finds the floor holder, but when it tries to look up the receiver's UDP endpoint to relay the audio, the lookup fails. The receiver never gets the datagram.

### Root Cause
Two different identity systems are in use:
- **JWT `userId`** (e.g., `a5d8c11b-...`): Database UUID, used by WS auth and stored in `socketUser`
- **`CONFIG.DEVICE_ID`** (e.g., `dev-k7xm2p9a`): Random string generated on app startup, used by `UDP_REGISTER` and sent as `sender` in `PTT_START`

When the mobile app calls `UDP_REGISTER`, it sends `{ type: 'UDP_REGISTER', userId: CONFIG.DEVICE_ID }`. The server stores this in `udpClients` keyed by `CONFIG.DEVICE_ID`. But when trying to relay audio to a peer, the server looks up by JWT `userId`. These are different strings, so the lookup returns `undefined`.

### Fix Applied (in hub.ts)

**File:** `packages/server/src/ws/hub.ts`

1. **`deviceIdToSocket` reverse map:** New `Map<string, WebSocket>` that maps `CONFIG.DEVICE_ID` → WebSocket. Populated when the server sees a `sender` field on any WS message (especially `PTT_START`).

2. **Bridge on PTT_START and on any message with `sender`:** When the server sees `msg.sender` (the CONFIG.DEVICE_ID), it looks up the existing UDP registration for that ID and copies it to the JWT userId key:
   ```typescript
   const existingUdp = udpClients.get(msg.sender);
   if (existingUdp && existingUser.userId !== msg.sender) {
     udpClients.set(existingUser.userId, existingUdp);
   }
   ```

3. **Dual lookup on relay:** When relaying to a peer, the server tries `senderDeviceId` first, then falls back to JWT `userId`:
   ```typescript
   const peerUdp = (user.senderDeviceId ? udpClients.get(user.senderDeviceId) : undefined)
     || udpClients.get(user.userId);
   ```

### Fix Status
- Same as Issue #1 — fixed locally, not on production.

---

## Issue #3: Mobile App Hitting Wrong Server

### Symptom
After setting up the local server at `192.168.2.133:3000`, the mobile app's logs still showed `relay: ws://134.122.32.45:3000/ws` (the production server).

### Root Cause
Expo loads environment files in this order: `.env.local` → `.env`. The `.env.local` file takes precedence. We updated `.env` to point at the local server but `.env.local` still had the production URLs. Additionally, Expo bakes env vars at build time (not runtime), so Metro cache also retained old values.

### Fix Applied

**Files:**
- `packages/mobile/.env.local` — Changed all URLs from `134.122.32.45` to `192.168.2.133`
- `packages/mobile/.env` — Changed all URLs from `134.122.32.45` to `192.168.2.133`
- `packages/mobile/src/config.js` — Changed fallback defaults from `134.122.32.45` to `192.168.2.133` (in case env vars are undefined)

### Fix Status
- Files are updated. User needs to rebuild with `npx expo start --clear` or `npx expo run:android --device` to pick up the new values.

### Revert Instructions (to go back to production)
Change all three files back to `134.122.32.45`:
- `.env.local`: `EXPO_PUBLIC_WS_URL=ws://134.122.32.45:3000/ws`, `EXPO_PUBLIC_API_URL=http://134.122.32.45:3000`
- `.env`: same
- `config.js`: change defaults back to `"ws://134.122.32.45:3000/ws"` and `"http://134.122.32.45:3000"`

---

## Issue #4: Expo Go Cannot Load Native Modules

### Symptom
Running `npx expo start` shows these errors:
```
Cannot read property 'createSocket' of null
OpusFECEncoder native module not found
```

### Root Cause
`npx expo start` runs the app in **Expo Go**, a pre-built sandbox app that does not include custom native modules. This project uses:
- `react-native-udp` — native UDP socket (Kotlin/Java)
- Custom `OpusFECEncoder` — native Opus encoder (Kotlin)
- Custom `AudioStreamPlayer` — native AudioTrack streaming (Kotlin)

These are compiled into the app binary during `expo run:android` but do NOT exist in Expo Go.

### Fix
Must use `npx expo run:android --device` (builds native code and installs the full APK on a connected device) instead of `npx expo start` (which uses Expo Go).

If no Android device is connected via USB/ADB, use `npx expo run:android` which targets the default emulator. For a physical device over WiFi, ensure `adb connect <phone-ip>:5555` first.

### Fix Status
- User has been informed but hasn't done the rebuild yet.

---

## Issue #5: Dual-Send Workaround (Historical — Now Reverted)

### Context
Before Issues #1 and #2 were fixed on the server, UDP audio was being silently dropped. As a workaround, AudioPipeline was modified to send every audio chunk via BOTH UDP and WebSocket simultaneously:

```typescript
// DUAL-SEND WORKAROUND (now reverted)
if (AudioPipeline.useUdp) {
  this.udp.send(msg);
}
this.relay.send(msg);  // always send via WS too
```

This worked because the production server's WS `PTT_AUDIO` handler (the `case 'PTT_AUDIO'` in the socket message switch) was functional — it correctly looked up the session, checked the floor holder by socket identity (not by userId string), and called `fanOut()`. Audio flowed through WS while UDP was broken.

### Current State
AudioPipeline has been reverted to UDP-only:
```typescript
if (AudioPipeline.useUdp) {
  this.udp.send(msg);
} else {
  this.relay.send(msg);
}
```

**If the production server hub.ts is NOT updated** and you need audio to work on production, re-add the dual-send:
```typescript
// In packages/comms/src/AudioPipeline.ts, enqueueChunk()
if (AudioPipeline.useUdp) {
  this.udp.send(msg);
}
// Always send via WS as backup — server deduplicates
this.relay.send(msg);
```

---

## Current File States (Modified Files)

| File | What Changed | Revert Needed for Production? |
|------|-------------|-------------------------------|
| `packages/server/src/ws/hub.ts` | UDP handler rewritten with fallback recovery, session mismatch recovery, userId↔deviceId bridging, comprehensive logging, server-authoritative floor control | No — this is the target state for production too. Deploy it. |
| `packages/comms/src/AudioPipeline.ts` | Reverted to UDP-only (removed dual WS send) | Maybe — if hub.ts isn't deployed to production, re-add dual-send |
| `packages/mobile/.env.local` | URLs point to `192.168.2.133` (local) | Yes — change back to `134.122.32.45` |
| `packages/mobile/.env` | URLs point to `192.168.2.133` (local) | Yes — change back to `134.122.32.45` |
| `packages/mobile/src/config.js` | Fallback defaults point to `192.168.2.133` | Yes — change back to `134.122.32.45` |
| `packages/comms/src/ForbiddenLANComms.ts` | Added `sender: this.config.deviceId` in JOIN_TALKGROUP | No — needed for userId bridging |
| `packages/comms/src/UdpSocket.ts` | Added `_transport: 'udp'` tag on received messages | No — diagnostic only |
| `packages/mobile/src/utils/comms.js` | Removed `_audioModeSet` guard, added diagnostic logging, simplified half-duplex guard | No — these are improvements |

---

## Local Dev Server Setup (Currently Running)

- **Server process:** PID 2148025, native Node.js (not Docker), TCP+UDP on port 3000
- **Postgres:** Docker container `skytalk-pg` with `--network host` on port 5432
- **Database credentials:** `skytalk` / `skytalk123` / database `skytalk`
- **JWT secret:** `local-dev-secret-change-in-prod`
- **Seed data:** `admin/admin` (role admin), `pilot1/test` (role user), talkgroup "Ground Ops"
- **Host machine:** Fedora 42, IP `192.168.2.133`, firewall port 3000 TCP+UDP open

### To restart the server:
```bash
kill 2148025  # or whatever the current PID is
cd packages/server
JWT_SECRET=local-dev-secret-change-in-prod \
DATABASE_URL=postgresql://skytalk:skytalk123@127.0.0.1:5432/skytalk \
PORT=3000 \
npx tsx src/index.ts &
```

### To restart Postgres:
```bash
docker start skytalk-pg
# or if the container doesn't exist:
docker run -d --name skytalk-pg --network host \
  -e POSTGRES_USER=skytalk -e POSTGRES_PASSWORD=skytalk123 -e POSTGRES_DB=skytalk \
  postgres:16-alpine
```

### To re-seed the database:
```bash
cd packages/server
DATABASE_URL=postgresql://skytalk:skytalk123@127.0.0.1:5432/skytalk npx tsx prisma/seed.ts
```

---

## Remaining Steps to Get UDP-Only Working Locally

1. **Rebuild the mobile app** with native modules:
   ```bash
   cd packages/mobile
   npx expo run:android --device
   ```
   This compiles native Kotlin modules (Opus, AudioStreamPlayer, react-native-udp) into the APK and bakes the corrected `.env.local` URLs into the JS bundle.

2. **Verify the app points at the local server.** Look for this in Metro/logcat:
   ```
   relay: ws://192.168.2.133:3000/ws
   ```
   If it still says `134.122.32.45`, the env vars weren't picked up. Clear Metro cache: `npx expo start --clear`.

3. **Log in on both devices:**
   - Device A: `admin` / `admin`
   - Device B: `pilot1` / `test`
   These are LOCAL database credentials — production DB has different users.

4. **Join the same talkgroup** ("Ground Ops" from seed data) on both devices.

5. **Press PTT on Device A** and speak. Watch the server terminal for:
   ```
   [hub] FLOOR_GRANT: dev-xxxx on <talkgroup-uuid>
   [hub] UDP relay #1: chunk=0 → dev-yyyy (192.168.x.x:port)
   ```

6. **Listen on Device B.** If audio plays, UDP-only is working.

### If audio doesn't play, check these in order:

1. **Server logs:** Are `[hub] UDP relay` lines appearing? If not, the server is dropping audio — check the `[hub] UDP PTT_AUDIO: DROPPED` warnings.
2. **UDP registration:** After login + talkgroup join, does the server log `[hub] UDP_REGISTER: userId=...`? If not, `UdpSocket.connect()` failed (native module issue).
3. **Bridging:** Does the server log `[hub] Bridged UDP endpoint: dev-xxxx → JWT userId ...`? If not, the server can't map the receiver's deviceId to their UDP address. Check that `sender` field is present on `PTT_START`.
4. **Receiver native modules:** Is `OpusFECEncoder native module not found` or `createSocket null` in logcat? If yes, the app was built with Expo Go, not a dev build.
5. **Firewall:** `sudo firewall-cmd --list-ports` should show `3000/tcp` and `3000/udp`.
6. **Network:** Can Device B reach the server? `adb shell ping 192.168.2.133` from the phone.

---

## Possible Remaining Issues (Not Yet Encountered But Plausible)

### A. NAT Traversal on Cellular/Satellite
The UDP keep-alive interval is 25 seconds. Some carrier-grade NATs (especially satellite: Iridium Certus) may have shorter UDP mapping timeouts (as low as 15s). If audio works on WiFi but not on satellite, try reducing the keep-alive interval in `UdpSocket.ts`:
```typescript
this.keepAliveTimer = setInterval(() => {
  this.send(registerMsg);
}, 15000);  // was 25000
```

### B. UDP Packet Size Exceeding MTU
Each audio chunk is a JSON object containing base64-encoded Opus data. A 60ms Opus frame at 16kbps is ~120 bytes raw, ~160 bytes base64, plus JSON overhead ≈ 250–350 bytes per packet. This is well under the typical 1500-byte Ethernet MTU and even the ~296-byte Iridium SBD limit (but we're using Certus streaming, not SBD, so MTU is standard). Should not be an issue, but if it is, consider switching from JSON to a binary protocol (msgpack or raw TLV).

### C. Opus Decoder State Corruption
The Opus decoder is stateful. If a packet is lost (UDP is lossy), the decoder may produce artifacts. The native module uses FEC (Forward Error Correction) — `OpusFECEncoder` / `OpusFECDecoder`. If FEC isn't working, you'll hear clicking/popping on packet loss. Check that `decodeOpusFrame()` in `packages/mobile/src/utils/opusDecoder.js` is passing the `fec` parameter correctly.

### D. Floor Watchdog Auto-Release
The server auto-releases the floor after 65 seconds (`FLOOR_WATCHDOG_MS`). The client has a 60-second max TX timer (`MAX_TX_MS`). If there's clock drift or network delay, the server might release the floor while the client is still transmitting, causing the last few seconds of audio to be dropped. Check server logs for `[hub] floor watchdog: auto-releasing`.

### E. Dual Registration Race
If a user has two app instances (e.g., hot-reload created a second instance), both send `UDP_REGISTER` with different ephemeral ports. The server stores only the latest registration, so one instance's audio will be dropped. Symptom: audio works intermittently. Fix: ensure only one app instance runs per device. Kill the Metro bundler and restart cleanly.

### F. Android Audio Mode (Half-Duplex)
After the mic records (TX), Android's audio subsystem may stay in recording mode, causing playback to route to the earpiece instead of the speaker, or to be silent entirely. `comms.js` has `_ensurePlaybackMode()` which calls `Audio.setAudioModeAsync({ allowsRecordingIOS: false })` to reset this. If playback is silent after TX, check if this function is being called before decoding starts. This was previously gated behind an `_audioModeSet` flag that prevented re-assertion — that flag was removed in this session.

---

## Key Architecture Decisions

1. **Server-authoritative floor control:** The server (not the client) decides who holds the floor. `PTT_START` is a request; the server responds with `FLOOR_GRANT` or `FLOOR_DENY`. Audio from non-holders is dropped. This prevents walk-ons (two people talking simultaneously).

2. **In-memory state:** `rooms`, `socketUser`, `sessionTalkgroup`, `talkgroupFloor`, `udpClients` are all in-memory Maps. A server restart loses all state — clients must re-join talkgroups and re-register UDP. There is no persistence layer for real-time state.

3. **UDP+WS dual delivery from server:** Even when the client sends UDP-only, the server's UDP handler relays via BOTH UDP and WS to receivers (see hub.ts lines 120–130). This is intentional — it guarantees delivery if the receiver's UDP is blocked by NAT. The client deduplicates by `sessionId + chunk` number.

4. **AudioPipeline transport is client-side only:** `AudioPipeline.useUdp` controls whether the SENDER uses UDP or WS. The SERVER always delivers via both. So "UDP-only" means TX is UDP-only; RX is always dual-path from the server.
