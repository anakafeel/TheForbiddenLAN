# UDP Audio Migration — 2026-03-05

> **Quick Reference:** See "Quick Reference: Local vs Production" section below for easy switching between local and production servers.

**Date:** 2026-03-05  
**Status:** Completed  
**Issue:** Audio not working over UDP on local server  
**Root Cause:** Multiple bugs in deviceId bridging and missing sender field

---

## Summary

Successfully migrated PTT audio from WebSocket to UDP. The fixes were all in the codebase — no changes needed to Shri's backend infrastructure.

### What Was Fixed

| Issue | Location | Fix |
|-------|----------|-----|
| Missing `sender` field in PTT_AUDIO | `AudioPipeline.ts` | Added `sender: deviceId` to message |
| deviceId/userId bridging race | `hub.ts` | Fixed bridging logic to run on every message |
| Decoder initialization race | `comms.js`, `opusDecoder.js` | Added promise guards |

---

## Root Causes Identified

### 1. Missing sender in PTT_AUDIO

The client was sending audio chunks without including the sender's device ID. This made it impossible for the server to verify sender identity during session mismatches.

**Fix:** Added `sender` field to PTT_AUDIO message in `AudioPipeline.ts`:

```typescript
const msg = {
  type: 'PTT_AUDIO',
  talkgroup: this.talkgroup,
  sessionId: this.sessionId,
  sender: this.deviceId,  // ADDED
  chunk: this.chunk++,
  data: payload,
};
```

### 2. deviceId/userId Bridging Race

The server uses two different identity systems:
- **JWT userId**: Database UUID (e.g., `a5d8c11b-...`)
- **deviceId**: Random string (e.g., `dev-k7xm2p9a`)

UDP registration used deviceId, but relay lookups used JWT userId. The bridging logic only ran once on first message, causing failures when message ordering varied.

**Fix:** Changed bridging to run on every message with a `sender` field in `hub.ts`:

```typescript
if (msg.sender && typeof msg.sender === 'string') {
  const existingUser = socketUser.get(socket);
  if (existingUser) {
    existingUser.senderDeviceId = msg.sender;
    // ... bridge UDP registration
  }
}
```

### 3. Decoder Initialization Race

Multiple concurrent audio frames could trigger parallel decoder initialization, causing:
- "native decoder initialized" logged multiple times
- "Call initialize() before decode()" errors
- Some frames dropped

**Fix:** Added promise guard in both `comms.js` and `opusDecoder.js`:

```typescript
let _decoderInitPromise = null;

async function _ensureDecoderReady() {
  if (_decoderReady) return true;
  
  // If init is in progress, wait for it
  if (_decoderInitPromise) {
    return _decoderInitPromise;
  }
  
  _decoderInitPromise = (async () => {
    await initOpusDecoder();
    _decoderReady = true;
  })();
  
  return _decoderInitPromise;
}
```

---

## Files Modified

| File | Change |
|------|--------|
| `packages/comms/src/AudioPipeline.ts` | Added `deviceId` param, `sender` field |
| `packages/comms/src/ForbiddenLANComms.ts` | Pass `deviceId` to AudioPipeline |
| `packages/server/src/ws/hub.ts` | Improved bridging, added logging |
| `packages/mobile/src/utils/comms.js` | Decoder init race guard |
| `packages/mobile/src/utils/opusDecoder.js` | Decoder init race guard |

---

## Verification

### Server Logs to Watch

```
[hub] UDP_REGISTER: userId=dev-xxxx from 192.168.x.x:port
[hub] Bridged UDP endpoint: dev-xxxx → JWT userId xxx
[hub] UDP PTT_AUDIO received: session=0x... sender=dev-xxxx
[hub] UDP relay #1: chunk=0 → dev-yyyy
[hub] PTT_AUDIO relay: chunk=0 → UDP:1 WS:1
```

### Mobile Logs to Watch

```
[UdpSocket] ✅ Connected — target 192.168.2.133:3000
[AudioPipeline] TX chunk #1 via UDP
[comms] RX chunk decoded & playing (stream=true)
```

---

## Quick Reference: Local vs Production

### The 3 Files to Change

| File | What to Change |
|------|----------------|
| `packages/mobile/.env` | `EXPO_PUBLIC_WS_URL` and `EXPO_PUBLIC_API_URL` |
| `packages/mobile/.env.local` | Same as above |
| `packages/mobile/src/config.js` | Fallback defaults in `WS_URL` and `API_URL` |

### Local Server URLs
```
WS_URL: ws://192.168.2.133:3000/ws
API_URL: http://192.168.2.133:3000
```

### Production Server URLs
```
WS_URL: ws://134.122.32.45:3000/ws
API_URL: http://134.122.32.45:3000
```

> **Note:** Replace `192.168.2.133` with your machine's local IP address.

---

## Prerequisites (One-Time Setup)

### 1. Install Missing Dependencies

If you get `Cannot find module 'react-native-worklets'` error:

```bash
pnpm add react-native-worklets
```

### 2. Start Postgres (if not running)

```bash
# Check if running
docker ps | grep skytalk-pg

# Start if stopped
docker start skytalk-pg

# Or create if doesn't exist
docker run -d --name skytalk-pg --network host \
  -e POSTGRES_USER=skytalk -e POSTGRES_PASSWORD=skytalk123 -e POSTGRES_DB=skytalk \
  postgres:16-alpine
```

---

## Workflow A: Testing Locally

### Step 1: Configure Mobile for Local

Edit `.env`, `.env.local`, and `config.js` to use `192.168.2.133` (your local IP).

### Step 2: Start Local Server

```bash
cd packages/server
JWT_SECRET=local-dev-secret-change-in-prod \
DATABASE_URL=postgresql://skytalk:skytalk123@127.0.0.1:5432/skytalk \
PORT=3000 \
npx tsx src/index.ts
```

Expected output:
```
[hub] UDP server listening on 0.0.0.0:3000
```

### Step 3: Build & Run Mobile

```bash
cd packages/mobile

# If Metro is already running, just build:
npx expo run:android --device

# If Metro isn't running, start it first in one terminal:
npx expo start --clear
# Then build in another terminal:
npx expo run:android --device
```

---

## Workflow B: Testing Production

### Step 1: Ensure Shri Has Deployed

Tell Shri to deploy the code changes to production server first.

### Step 2: Configure Mobile for Production

Edit `.env`, `.env.local`, and `config.js` to use `134.122.32.45`.

### Step 3: Build & Run Mobile

```bash
cd packages/mobile
npx expo run:android --device
```

The app will connect to Shri's production server.

---

## Troubleshooting

### "404 Red Screen" Error

**Cause:** App can't reach the server.

**Fix:** 
- If testing locally, ensure local server is running
- If testing production, ensure Shri has deployed the code
- Check the URL is correct (includes `/ws` for WebSocket)

### "Cannot read 'clipboard' of null"

**Fix:** Run `pnpm add react-native-worklets`

### White Screen / Stuck on Loading

**Cause:** Metro bundler not running or app can't connect to it.

**Fix:**
```bash
# Kill all processes
pkill -9 -f "node|expo|metro"

# Start fresh
cd packages/mobile
npx expo start --clear
# Then in another terminal:
npx expo run:android --device
```

### Metro Bundle Error

**Fix:**
```bash
rm -rf packages/mobile/.expo
cd packages/mobile
npx expo prebuild --clean
npx expo run:android --device
```

---

## Local Testing

### Start Local Server

```bash
# Start Postgres (if not running)
docker start skytalk-pg  # or: docker run -d --name skytalk-pg --network host -e POSTGRES_USER=skytalk -e POSTGRES_PASSWORD=skytalk123 -e POSTGRES_DB=skytalk postgres:16-alpine

# Start the server
cd packages/server
JWT_SECRET=local-dev-secret-change-in-prod \
DATABASE_URL=postgresql://skytalk:skytalk123@127.0.0.1:5432/skytalk \
PORT=3000 \
npx tsx src/index.ts
```

Expected output:
```
[hub] UDP server listening on 0.0.0.0:3000
```

### Configure Mobile for Local Testing

Edit `packages/mobile/.env`:

```bash
# Point to local server
EXPO_PUBLIC_WS_URL=ws://192.168.2.133:3000/ws
EXPO_PUBLIC_API_URL=http://192.168.2.133:3000
```

> **Note:** Replace `192.168.2.133` with your machine's local IP address.

### Rebuild Mobile App

```bash
cd packages/mobile
npx expo run:android --device
```

### Switch Back to Production

After local testing, revert to production server:

```bash
# Edit .env to point to production
EXPO_PUBLIC_WS_URL=ws://134.122.32.45:3000/ws
EXPO_PUBLIC_API_URL=http://134.122.32.45:3000

# Rebuild
npx expo run:android --device
```

---

## Tradeoffs

### What Was Accepted

1. **Dual delivery from server**: Server sends audio via both UDP and WebSocket. Client deduplicates by `sessionId + chunk`. This ensures reliability if UDP is blocked by NAT.

2. **Keep-alive pings**: UDP needs 25-second keep-alive to maintain NAT mapping on Iridium Certus.

3. **No delivery guarantee**: UDP can drop packets. Relies on Opus FEC for concealment. Acceptable for voice PTT.

### What Was Rejected

- **WebSocket for audio**: Rejected due to TCP head-of-line blocking causing store-and-forward behavior on satellite links.
- **QUIC/WebTransport**: Not yet stable in React Native / Fastify.

---

## Common Bug Fixes

### "Call initialize() before decode()"

**Symptom:** Logs show decoder errors on incoming frames  
**Cause:** Race condition in decoder initialization  
**Fix:** Already fixed with promise guard (see above)

### "UDP PTT_AUDIO: DROPPED — no talkgroup"

**Symptom:** Audio chunks arriving before PTT_START processed  
**Cause:** Race condition, session not yet mapped  
**Fix:** Already handled in hub.ts with talkgroup recovery from message

### "NO UDP endpoint for peer"

**Symptom:** Server can't find peer's UDP address  
**Cause:** deviceId/userId bridging failed  
**Fix:** Already fixed with improved bridging logic

### "Cannot read property 'createSocket' of null"

**Symptom:** UDP socket fails to connect  
**Cause:** Running in Expo Go instead of dev build  
**Fix:** Run `npx expo run:android --device` not `npx expo start`

---

## Deployment

1. **Test locally first** with two devices or loopback mode
2. **Push changes** to GitHub
3. **Shri deploys** to production server (134.122.32.45)
4. **Verify** with production server URL in .env

### Production Server URL

Change in `.env.local` and `.env`:
```
EXPO_PUBLIC_WS_URL=ws://134.122.32.45:3000/ws
EXPO_PUBLIC_API_URL=http://134.122.32.45:3000
```

---

## Related Docs

- `docs/ADR-001-udp-audio-transport.md` — Architecture decision record
- `docs/AUDIO_DEBUG_HANDOFF.md` — Previous debug session
- `docs/UDP-MIGRATION-IMPLEMENTATION.md` — Implementation guide
