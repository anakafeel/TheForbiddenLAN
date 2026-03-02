# Switching from Mock Mode to Shri's Real Backend

This doc covers exactly what needs to change when Shri's relay server is live.
Nothing in Annie's UI components changes. The entire switch is env vars + one function call.

---

## Prerequisites

- Shri's server is running and exposes:
  - `POST /auth/login` → returns `{ jwt: "..." }`
  - WebSocket relay at a known URL (e.g. `ws://10.0.0.5:3001`)
- You know the server IP/hostname and port

---

## Step 1 — Create `.env.local` in `packages/mobile/`

This file is gitignored so it won't be committed. It overrides `.env` locally.

```bash
cp packages/mobile/.env.example packages/mobile/.env.local
```

Edit `.env.local`:

```env
VITE_MOCK_MODE=false
VITE_WS_URL=ws://<shri-server-ip>:<port>      # e.g. ws://10.0.0.5:3001
VITE_API_URL=http://<shri-server-ip>:<port>   # e.g. http://10.0.0.5:3001
VITE_DLS140_URL=http://192.168.111.1:3000      # leave as-is if DLS-140 is on same LAN
VITE_TALKGROUP=alpha                           # or whatever talkgroup Shri uses
```

Leave `VITE_MOCK_JWT` and `VITE_DEVICE_ID` commented out (not needed in real mode).

---

## Step 2 — Call `connectComms(jwt)` after login

Find where login happens in the app. Currently Annie's `App.web.jsx` has no login screen —
add the call wherever Shri's auth flow lives (new login screen, ChannelContext, or useAuth hook).

The call looks like this:

```js
import { connectComms } from '../utils/socket';
import { CONFIG } from '../config';

// After a successful login POST:
const res  = await fetch(`${CONFIG.API_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
const { jwt } = await res.json();

await connectComms(jwt);    // ← this is the only new line needed
// then navigate to Channels / PTT screen as normal
```

`connectComms(jwt)` is idempotent — safe to call once, will no-op on repeat calls.

---

## Step 3 — Rebuild comms if Shri updated the package

```bash
cd packages/comms && pnpm build
```

Then restart the dev server:

```bash
pnpm dev:mobile   # from repo root
```

---

## Step 4 — Verify in browser console

On page load you should see:

```
[MockRelaySocket] Connecting to mock server...    ← should NOT appear in real mode
[ForbiddenLANComms] Time offset synced: Xms       ← should appear
[comms] initialized — LIVE mode | device: dev-xxxx | talkgroup: alpha | relay: ws://...
```

Hold PTT:

```
[comms] PTT start — device: dev-xxxx
[comms] mic capture started (audio/webm;codecs=opus)
[comms] PTT_AUDIO sending, encrypted bytes: XXXX    ← every 200ms
```

Other devices on the same talkgroup should hear audio after you release PTT
(half-duplex filter active in real mode — you won't hear your own voice back,
which is correct PTT radio behaviour).

---

## What does NOT need to change

| File | Status |
|------|--------|
| `App.web.jsx` | No changes |
| `PTTScreen.jsx` | No changes |
| All other UI components | No changes |
| `utils/audio.js` | No changes |
| `utils/socket.js` — `emitStartTalking`, `emitStopTalking` | No changes |
| `@forbiddenlan/comms` package | No changes (unless Shri updates it) |

---

## Encryption note

Currently using a hardcoded test key (`deadbeef...`).
When Shri's key rotation is ready, replace the `encryption.init()` call in
`utils/comms.js` with:

```js
// Replace:
await encryption.init();

// With (once Shri provides KDF):
const key = await shriKDF(masterSecret, CONFIG.TALKGROUP, rotationCounter);
await encryption.init(key);
```

`Encryption.init(hexKey)` already accepts an optional key argument — no other changes needed.

---

## Rollback to mock mode

Delete or empty `packages/mobile/.env.local` — `.env` defaults (`VITE_MOCK_MODE=true`) take over immediately on next `pnpm dev:mobile`.
