# What We Built — Mock PTT Integration Session

This doc is a plain-language summary of everything done to connect Annie's frontend to Saim's comms layer in mock mode, with no backend server required.

---

## The Goal

Get the Push-to-Talk button in Annie's app to actually record your voice, send it through the comms layer, and play it back — all locally, no server, no hardware, no Shri's backend needed yet.

---

## What We Started With

- Annie had a working UI: screens, PTT button, channel list, all looking correct.
- Under the hood, the PTT button was calling fake/empty functions that did nothing real.
- Saim had built a full comms package (`@forbiddenlan/comms`) that handles WebSocket relay, encryption, PTT floor control, and signal polling — but it wasn't connected to the UI.

---

## What We Did, Step by Step

### 1. Deleted a conflicting config file

There were two Vite config files: `vite.config.js` (correct one, Annie's) and `vite.config.ts` (a duplicate that was quietly breaking things). Vite was loading the `.ts` one, which was missing the React Native → web aliases. Deleted the `.ts` one.

### 2. Created a comms singleton (`utils/comms.js`)

A single file that:

- Creates one shared instance of `ForbiddenLANComms` (Saim's library)
- Creates one shared `Encryption` instance (AES-256 key for encrypting audio)
- Handles all audio playback
- Exposes one function: `initComms(jwt)` — call it once to connect everything

### 3. Replaced the fake socket functions (`utils/socket.js`)

The old version had placeholder functions. The new version:

- Has the exact same function names so no UI code needed changing
- `emitStartTalking()` → tells the comms layer to start a PTT transmission
- `emitStopTalking()` → tells it to stop and send PTT_END
- In mock mode, auto-initializes on import (no login needed)
- In real mode, waits for `connectComms(jwt)` to be called after Shri's login

### 4. Replaced the fake audio functions (`utils/audio.js`)

The old version just called `getUserMedia` and did nothing with it. The new version:

- Opens the microphone
- Uses `MediaRecorder` to capture audio in 200ms chunks
- Encrypts each chunk
- Sends each chunk through the comms layer via `comms.sendAudioChunk()`

### 5. Fixed the dev server crashing (EMFILE error)

On Linux, the dev server was crashing immediately with "too many open files." This is a system limit on how many files can be watched at once. Fixed by switching Vite to polling mode instead of file watching — small performance tradeoff, but it works.

### 6. Fixed loopback — couldn't hear yourself

The comms library has a rule: don't play incoming audio while you're transmitting (this protects the satellite link from overloading in real use). But in mock mode, the fake relay echoes your own audio back to you — and the half-duplex rule was blocking that echo.

Fixed by adding a `onRawMessage()` method to the comms library that bypasses the filter. In mock mode we use that. In real mode we use the normal `onMessage()` which keeps the filter active.

NEED TO REPLACE IN ACTUAL ( NON MOCK MODE )

### 7. Fixed audio playback — only hearing first chunk

Audio was being sent and received correctly, but only the first ~200ms was audible. The rest was silent.

The reason: `MediaRecorder` doesn't produce a series of complete audio files. It produces one stream split into chunks where only the first chunk contains the file header. Chunks 2, 3, 4... are meaningless without chunk 1 in front of them. Trying to play each chunk individually fails silently.

Fixed by collecting all chunks into a list while the person is talking, then when they release PTT, sticking all the chunks together into one complete audio file and playing that. Now you hear the full transmission after the button is released.

---

## The Mock Relay

Saim's comms package includes a `MockRelaySocket` — a fake server that runs inside the app itself. It simulates the real relay server: it receives your audio, waits 50ms (fake network delay), then sends it back. This lets you test the full send → receive → play cycle on a single machine with no server running.

---

## How the Switch to Real Backend Works

When Shri's server is ready:

1. Create a `.env.local` file in `packages/mobile/` and set `VITE_MOCK_MODE=false` plus Shri's server URLs.
2. After a successful login, call `connectComms(jwt)` once with the JWT from Shri's login endpoint.
3. That's it. All UI code stays the same.

Full steps are in `docs/BACKEND_INTEGRATION.md`.

---

## Files Touched

| File                                      | What changed                                             |
| ----------------------------------------- | -------------------------------------------------------- |
| `utils/comms.js`                          | Created — comms singleton, encryption, audio playback    |
| `utils/socket.js`                         | Replaced internals — same API, now uses real comms       |
| `utils/audio.js`                          | Replaced internals — now uses MediaRecorder + encryption |
| `src/config.js`                           | Centralized all env vars and config                      |
| `packages/mobile/.env`                    | Created — mock mode defaults                             |
| `packages/mobile/.env.example`            | Created — template for real backend                      |
| `vite.config.ts`                          | Deleted — was silently breaking the app                  |
| `vite.config.js`                          | Added polling mode to fix Linux crash                    |
| `packages/comms/src/Encryption.ts`        | Created — AES-GCM-256 encrypt/decrypt                    |
| `packages/comms/src/AudioPipeline.ts`     | Updated — accepts encryption, async chunk sending        |
| `packages/comms/src/ForbiddenLANComms.ts` | Added `onRawMessage()` for mock loopback                 |
| `docs/BACKEND_INTEGRATION.md`             | Created — switchover guide for Shri's backend            |
| `docs/tradeoffs.md`                       | Added Vite + React Native explanation                    |
| `docs/architecture.md`                    | Added build targets table                                |

---

## What Still Uses a Hardcoded Value

The encryption key is currently `deadbeef...` (a test key). When Shri builds the key rotation system, `encryption.init()` in `utils/comms.js` gets replaced with `encryption.init(keyFromShrisKDF)`. One line change, nothing else.
