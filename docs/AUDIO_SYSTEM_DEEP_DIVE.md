# Audio System Deep Dive

> Everything about how SkyTalk captures, compresses, encrypts, transmits, and plays back voice audio — explained like you're five (but with real numbers).

---

## Table of Contents

1. [Sound Basics — What Is Audio Data?](#sound-basics)
2. [Sampling Rate](#sampling-rate)
3. [Bit Depth](#bit-depth)
4. [Channels](#channels)
5. [Raw PCM — What the Mic Produces](#raw-pcm)
6. [Frames — What Are They?](#frames)
7. [Packets — What Are They?](#packets)
8. [Opus Compression — How It Works](#opus-compression)
9. [Our Opus Configuration](#our-opus-configuration)
10. [CBR vs VBR](#cbr-vs-vbr)
11. [The TX Path (Sending Audio)](#the-tx-path)
12. [The RX Path (Receiving Audio)](#the-rx-path)
13. [The 48kHz Decode Problem](#the-48khz-decode-problem)
14. [Encryption — What Happens to Each Frame](#encryption)
15. [WebSocket Transport — How Frames Travel](#websocket-transport)
16. [Packet Loss — What It Is and How We Handle It](#packet-loss)
17. [Jitter — Why Audio Can Sound Choppy](#jitter)
18. [Latency — Where Time Goes](#latency)
19. [Bandwidth Math](#bandwidth-math)
20. [How to Change Compression Settings](#how-to-change-compression-settings)
21. [File-by-File Walkthrough](#file-by-file-walkthrough)

---

## Sound Basics

Sound is vibrations in the air. A microphone converts those vibrations into an electrical signal — a wiggly voltage that goes up and down. To store that signal digitally, we need to measure ("sample") the voltage at regular intervals and write down each measurement as a number.

That's it. Digital audio is just a long list of numbers representing how loud the sound is at each moment in time.

---

## Sampling Rate

**Sampling rate** (aka sample rate) = how many times per second we measure the microphone's signal.

| Rate | Name | Quality | Used By |
|------|------|---------|---------|
| 8,000 Hz | Narrowband | Telephone quality (sounds tinny) | Old phone calls, AM radio |
| 16,000 Hz | Wideband | Clear speech (our setting) | VoIP, speech recognition |
| 44,100 Hz | CD quality | Music quality | CDs, MP3s |
| 48,000 Hz | Studio quality | Broadcast quality | Opus internal, video production |

**We use 16,000 Hz (16 kHz)**. This means the mic takes 16,000 measurements every second.

**Why 16kHz and not higher?**
- Human speech is mostly between 300 Hz and 3,400 Hz (the fundamental frequencies of vowels and consonants).
- The Nyquist theorem says to capture a frequency, you need to sample at **2× that frequency**. So 16kHz captures frequencies up to 8 kHz — more than enough for clear speech.
- 44.1kHz or 48kHz would capture music perfectly but wastes bandwidth on a satellite link. We're sending speech, not Spotify.

**Upper frequency limit**: Our 16kHz sample rate captures frequencies up to **8,000 Hz** (the Nyquist limit: sampleRate / 2). Everything above 8kHz is lost. That's fine — it cuts out background hiss & noise that's above the speech band anyway.

**Where this is set**:
- `packages/mobile/src/utils/opusEncoder.js` → line 11: `const SAMPLE_RATE = 16000;`
- `packages/mobile/src/utils/audio.js` → line 23: `const SAMPLE_RATE = 16000;`
- `OpusEncoderModule.kt` → passed via `initialize(sampleRate=16000, ...)`

---

## Bit Depth

**Bit depth** = how many bits we use per sample measurement.

We use **16-bit** (aka "16-bit PCM"). Each sample is a number between **-32,768** and **+32,767**.

- 0 = silence
- +32,767 = loudest positive pressure
- -32,768 = loudest negative pressure (opposite direction of the speaker cone)

Why 16-bit?
- 8-bit gives 256 levels — you can hear the "staircase" as a faint hiss (quantization noise).
- 16-bit gives 65,536 levels — smooth enough that quantization noise is inaudible.
- 24-bit is for recording studios. Waste of bandwidth for walkie-talkie speech.

**Where this is set**:
- `packages/mobile/src/utils/audio.js` → line 58: `bitsPerSample: 16`
- This is the `LiveAudioStream.init()` config.

---

## Channels

**Channels** = how many independent audio streams.

- **Mono (1 channel)**: One stream. One mic input. What we use.
- **Stereo (2 channels)**: Two streams (left + right). Doubles the data for no benefit in walkie-talkie speech.

**Where this is set**:
- `packages/mobile/src/utils/audio.js` → line 24: `const CHANNELS = 1;`
- `packages/mobile/src/utils/opusEncoder.js` → line 12: `const CHANNEL_COUNT = 1;`

---

## Raw PCM

PCM stands for **Pulse Code Modulation**. It's the raw, uncompressed list of sample numbers. No compression, no file format — just numbers.

Our PCM format: **16 kHz, 16-bit, mono**.

**How big is raw PCM?**

```
Bytes per second = sampleRate × channels × (bitsPerSample / 8)
                 = 16,000 × 1 × 2
                 = 32,000 bytes/second
                 = 256,000 bits/second
                 = 256 kbps
```

That's **256 kbps** of raw audio data. Our satellite link is 22 kbps. So raw PCM is **11.6× too big** to send over SATCOM. This is why we need compression.

---

## Frames

A **frame** is a chunk of audio that gets compressed together as a single unit.

Think of it like sentences in a book. You don't compress one letter at a time, and you don't compress the whole book at once. You compress one sentence at a time. Each sentence is a "frame."

**Our frame size**: 60 milliseconds of audio.

**How big is one frame (raw PCM)?**

```
Samples per frame = sampleRate × frameDuration
                  = 16,000 × 0.060
                  = 960 samples

Bytes per frame   = samples × channels × bytesPerSample
                  = 960 × 1 × 2
                  = 1,920 bytes
```

So the microphone produces **1,920 bytes every 60 milliseconds**. That chunk gets sent to the Opus encoder as one frame.

**Why 60ms frames specifically?**

Opus supports 2.5ms, 5ms, 10ms, 20ms, 40ms, and 60ms frames. Trade-off:

| Frame Size | Frames/sec | Overhead | Latency | Quality |
|-----------|------------|----------|---------|---------|
| 20ms | 50/sec | High (50 JSON envelopes/sec) | Low | Good |
| 40ms | 25/sec | Medium | Medium | Good |
| **60ms** | **16.67/sec** | **Low** | **Acceptable** | **Best for speech** |

We chose 60ms because:
1. Fewer packets per second = less JSON/WebSocket overhead per second
2. Opus works better with larger frames (more data to find patterns in)
3. 60ms latency per frame is acceptable for half-duplex PTT (not a phone call)

**Where this is set**:
- `packages/mobile/src/utils/audio.js` → line 30: `const FRAME_DURATION_MS = 60;`
- `OpusEncoderModule.kt` → line 43: `private const val FRAME_DURATION_MS = 60`

**Frame alignment in code**: The `LiveAudioStream` library is told to deliver exactly 1,920 bytes per callback (`bufferSize: BUFFER_SIZE` in `audio.js` line 56). On the native side, `OpusEncoderModule.kt` has a `pcmAccumulator` (line 52) that collects incoming PCM and only feeds the encoder when it has a complete 1,920-byte frame. Leftover bytes carry over to the next call. This guarantees **one clean Opus frame per input** — no partial frames, no splitting.

---

## Packets

A **packet** is a frame + everything needed to send it over the network. In our system, one frame becomes one packet. They're almost interchangeable terms, but:

- **Frame** = the audio data (raw PCM going into encoder, or compressed Opus coming out)
- **Packet** = the frame + encryption overhead + JSON envelope + WebSocket framing

Here's what one 60ms audio packet looks like on the wire:

```
┌─────────────────────────────────────────────────────┐
│  WebSocket frame header         6 bytes              │
│  ┌─────────────────────────────────────────────────┐ │
│  │  JSON envelope:                                 │ │
│  │  {                                              │ │
│  │    "type": "PTT_AUDIO",          ~14 bytes      │ │
│  │    "sessionId": 2847923847,      ~25 bytes      │ │
│  │    "chunk": 42,                  ~12 bytes      │ │
│  │    "data": "<base64 string>"     ~198 bytes     │ │
│  │  }                                              │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
            Total: ~256 bytes per packet
            Rate:  16.67 packets/second
```

Inside that `"data"` field:

```
Raw Opus bytes:        ~120 bytes (the compressed audio)
+ AES-GCM IV:           12 bytes (random, unique per packet)
+ AES-GCM auth tag:     16 bytes (proves data wasn't tampered)
= Encrypted payload:   ~148 bytes
× Base64 expansion:    × 4/3
= Base64 string:       ~198 characters
```

---

## Opus Compression

**Opus** is an audio codec (compressor/decompressor). It was designed specifically for real-time voice and music over the internet. It's used by Discord, WhatsApp, Zoom, WebRTC, and now SkyTalk.

**What it does**: Takes 1,920 bytes of raw PCM and compresses it down to ~120 bytes. That's **~16× compression**.

**How** (simplified):
1. **Prediction**: Opus looks at the current frame and predicts what the next samples will be based on patterns in speech (human voice is very predictable — vowels are repeating wave patterns).
2. **Residual encoding**: Instead of storing the actual samples, it stores the **difference** between its prediction and reality. These differences are smaller numbers → fewer bits.
3. **Psychoacoustic masking**: Some sounds are inaudible to humans when a louder sound is playing at the same time. Opus throws away those inaudible parts.
4. **Entropy coding**: The remaining data is compressed using a technique called range coding (similar to how ZIP works — frequent patterns use fewer bits).

Opus internally uses two engines:
- **SILK** (from Skype): Optimized for speech at low bitrates. Handles the 8–16 kHz range.
- **CELT** (from Xiph): Optimized for music and high-quality audio. Handles wider bandwidth.

At 16 kbps voice, Opus primarily uses the **SILK** engine.

---

## Our Opus Configuration

| Parameter | Value | What it means |
|-----------|-------|---------------|
| Sample Rate | 16,000 Hz | Wideband voice — captures up to 8kHz |
| Channels | 1 (mono) | Single mic input |
| Bitrate | 16,000 bps (16 kbps) | How many bits per second of compressed output |
| Frame Duration | 60 ms | How much audio per compressed chunk |
| Bitrate Mode | CBR (constant) | Every frame uses ~the same number of bits |
| Codec | c2.android.opus.encoder | Android's built-in MediaCodec Opus, software codec |

**What does 16 kbps actually mean?**

```
Bits per frame = bitrate × frameDuration
               = 16,000 × 0.060
               = 960 bits
               = 120 bytes
```

So the encoder aims to compress each 1,920-byte PCM frame down to ~120 bytes. That's the target. Actual output varies slightly (100–140 bytes) because the encoder can't always hit exactly 120.

**Quality at different bitrates (Opus at 16kHz mono):**

| Bitrate | Frame Size | Quality | Use Case |
|---------|-----------|---------|----------|
| 6 kbps | ~45 bytes | Intelligible but robotic | Emergency/extreme bandwidth |
| 8 kbps | ~60 bytes | Acceptable for comms | Low-bandwidth SATCOM |
| **16 kbps** | **~120 bytes** | **Clear, natural speech** | **Our setting** |
| 24 kbps | ~180 bytes | Excellent speech | Wideband VoIP |
| 32 kbps | ~240 bytes | Near-transparent | High-quality streaming |
| 64 kbps | ~480 bytes | Music quality | Not needed for PTT |

---

## CBR vs VBR

**CBR (Constant Bitrate)**: Every frame gets the same number of bits, regardless of content. Silence takes the same bits as loud speech. Predictable bandwidth usage.

**VBR (Variable Bitrate)**: Silence gets fewer bits, complex sounds get more bits. Better quality per average bitrate, but peak bitrate is unpredictable.

**We use CBR. Why?**

1. **Samsung Exynos 850 bug**: The Galaxy A22's Opus encoder **ignores the VBR bitrate target**. When we set VBR mode with a 16 kbps target, the encoder produced ~5 kbps (way too low — garbled audio). With default CBR mode, it respects `KEY_BIT_RATE = 16000` correctly. This is the primary reason.

2. **SATCOM predictability**: On a 22 kbps satellite link, we need to know *exactly* how much bandwidth audio will use. VBR could spike to 24 kbps on a loud consonant, exceeding the link capacity and causing packet drops.

**Where this is configured**: `OpusEncoderModule.kt` → `initialize()` method (line 64). We intentionally do **not** set `MediaFormat.KEY_BITRATE_MODE` — the absence of this key defaults to CBR on Samsung's codec. Setting it explicitly to `BITRATE_MODE_CBR` was also tried but Exynos 850 ignores it the same way it ignores VBR. Leaving it out works.

---

## The TX Path

TX = transmit. What happens when you press the PTT button and speak.

```
Step 1: MIC CAPTURE
  Your voice → Android microphone hardware
  → AudioRecord (inside react-native-live-audio-stream)
  → Raw PCM buffer: 1,920 bytes (60ms of 16kHz 16-bit mono)
  → Delivered to JS as a base64 string

  File: audio.js, line 62 — LiveAudioStream.on('data', callback)


Step 2: OPUS ENCODE
  base64 PCM string → sent to native Kotlin via React Native bridge
  → OpusEncoderModule.kt accumulates PCM in pcmAccumulator
  → When 1,920 bytes are ready: fed to MediaCodec c2.android.opus.encoder
  → Output: ~120 bytes of compressed Opus data (base64)

  Files: opusEncoder.js → OpusEncoderModule.kt


Step 3: AES-GCM ENCRYPT
  120-byte Opus frame
  → Generate random 12-byte IV (initialization vector)
  → AES-GCM-256 encrypt (produces ciphertext + 16-byte auth tag)
  → Prepend IV to ciphertext
  → Result: ~148 bytes → base64 encode → ~198 character string

  File: Encryption.ts → encrypt()


Step 4: SEND OVER WEBSOCKET
  Encrypted base64 string wrapped in JSON:
  {"type":"PTT_AUDIO","sessionId":12345,"chunk":0,"data":"<base64>"}
  → WebSocket.send() to ws://134.122.32.45:3000/ws
  → Server receives, checks floor control, fans out to talkgroup members

  Files: comms.js → comms.sendAudioChunk()
         ForbiddenLANComms.ts → audio.enqueueChunk()
         hub.ts → fanOut()
```

**Timing**: This entire pipeline runs **16.67 times per second** (every 60ms), in real-time, while you hold the PTT button. Each iteration takes ~5–10ms on the SM-A225M.

---

## The RX Path

RX = receive. What happens when someone else's audio arrives on your device.

```
Step 1: RECEIVE FROM WEBSOCKET
  Server fans out PTT_AUDIO to all talkgroup members
  → Your device receives the JSON message
  → comms.js onRawMessage callback fires

  File: comms.js, line ~400 — comms.onRawMessage()


Step 2: HALF-DUPLEX CHECK
  If YOU are currently transmitting (_isLocalTx === true):
    → DISCARD the incoming audio. You can't hear others while talking.
  If you're NOT transmitting:
    → Continue to step 3.

  File: comms.js, line ~410


Step 3: AES-GCM DECRYPT
  base64 encrypted string → decode from base64
  → Split: first 12 bytes = IV, rest = ciphertext + auth tag
  → AES-GCM-256 decrypt using shared key + IV
  → If auth tag doesn't match: reject (tampered data)
  → Output: base64 Opus frame (~120 bytes)

  File: Encryption.ts → decrypt()


Step 4: OPUS DECODE
  base64 Opus → sent to native Kotlin via React Native bridge
  → OpusDecoderModule.kt feeds it to MediaCodec c2.android.opus.decoder
  → Output: PCM audio at 48,000 Hz (Opus ALWAYS decodes to 48kHz internally!)
  → downsample() averages every 3 samples → 16kHz PCM
  → Return as base64 PCM string

  Files: opusDecoder.js → OpusDecoderModule.kt


Step 5: STREAM TO SPEAKER (real-time path — default)
  On the FIRST decoded frame:
    → _ensurePlaybackMode() switches Android out of recording mode
    → startStreamPlayer() creates an AudioTrack (16kHz, mono, STREAM mode)
    → AudioTrack.play() starts the hardware
  Each decoded PCM chunk:
    → writeStreamPCM(base64PCM) → native AudioTrack.write()
    → Audio hits the speaker IMMEDIATELY (~5ms after write)

  Files: audioStreamPlayer.js → AudioStreamPlayerModule.kt


Step 6: STOP (on PTT_END or 8s timeout)
  stopStreamPlayer() → AudioTrack.stop() (drains remaining buffer)
  → AudioTrack.release()
  → Decoder destroyed, ready for next transmission

  File: comms.js → _flushAudio() → _stopStreaming()
```

**Key difference from the old architecture**: Audio now begins playing from the speaker **as soon as the first frame arrives** (~200ms after the speaker starts talking). Each subsequent frame plays in real-time. There is no waiting for PTT_END.

### Legacy Fallback Path

If the native `AudioStreamPlayerModule` is unavailable (e.g., native rebuild hasn't been done), the system automatically falls back to the old WAV-buffered approach:
- All PCM frames accumulate in `_pcmAccumulator`
- On `PTT_END`, they're concatenated into a WAV file and played via expo-av
- The `_useStreamPlayer` flag is set to `false` on first failure and stays there for the session

The loopback path (single-device testing) also uses the legacy WAV path since all TX frames are played back at once after PTT_END anyway.

---

## The 48kHz Decode Problem

This was our "audio plays at 1/3 speed" bug. Here's what happened:

**The Opus spec**: Opus processes audio internally at 48,000 Hz. Always. Even if you feed it 16kHz audio on the encode side, the encoder upsamples to 48kHz internally, compresses at 48kHz, and the decoder outputs 48kHz.

**What Android does**: When we create the decoder with `MediaFormat.createAudioFormat("audio/opus", 16000, 1)`, we're telling it "the source is 16kHz." But the decoder ignores this for its output — it **always** outputs 48kHz PCM.

**The bug**: Our WAV header said "this audio is 16kHz." But the actual PCM data was 48kHz. When expo-av played the WAV file:
- It read the header: "16,000 samples/second"
- It played 48,000 samples at 16,000 samples/second
- That's 3× too slow → deep, slow-motion voice

**The fix**: `OpusDecoderModule.kt` has a `downsample()` method (line 124) that converts 48kHz → 16kHz:

```kotlin
for (i in 0 until numSamples16) {
    var sum = 0L
    for (j in 0 until 3) {
        sum += buf48.getShort((i * 3 + j) * 2).toLong()
    }
    buf16.putShort(i * 2, (sum / 3).toShort())
}
```

This takes every group of 3 consecutive samples and averages them into 1 sample. 48,000 / 3 = 16,000 samples per second. The averaging (instead of just picking every 3rd sample) acts as a basic anti-aliasing filter to prevent high-frequency artifacts.

---

## Encryption

Every single audio frame is encrypted individually with **AES-GCM-256**.

**AES** = Advanced Encryption Standard. The world's most widely used symmetric cipher.  
**GCM** = Galois/Counter Mode. Provides both encryption AND authentication (proves data wasn't tampered).  
**256** = 256-bit key. Practically unbreakable.

**Per-frame encryption flow** (in `Encryption.ts`):

```
Input:  120 bytes of Opus audio (base64)

1. Generate 12 random bytes → IV (Initialization Vector)
   - MUST be unique per encryption. Never reuse an IV with the same key.
   - 12 bytes = 96 bits. 2^96 possible values. Collision probability
     is negligible even after billions of frames.

2. AES-GCM encrypt(key=256-bit, iv=12-byte, plaintext=Opus frame)
   → ciphertext (same size as input: ~120 bytes)
   → authentication tag (16 bytes, appended to ciphertext by WebCrypto)

3. Prepend IV to ciphertext:  [12 bytes IV][~136 bytes ciphertext+tag]
   = ~148 bytes total

4. Base64 encode: 148 × 4/3 = ~198 characters
```

**Overhead per frame**: 28 bytes (12 IV + 16 tag). That's a 23% overhead on a 120-byte Opus frame.

**Current limitation**: The AES key is hardcoded (`deadbeef...` repeated) in `Encryption.ts` line 3. All devices use the same key. This is an MVP placeholder — production would derive per-session keys from a shared secret.

---

## WebSocket Transport

Audio travels over **WebSocket** (RFC 6455), which runs on top of **TCP**.

**Why WebSocket?**
- Full-duplex (both sides can send simultaneously)
- Low overhead (2–6 byte frame header vs HTTP's ~200 bytes)
- Persistent connection (no reconnection per message)
- Works through firewalls/NAT (looks like HTTPS to middleboxes)

**Why TCP (not UDP)?**
- WebSocket requires TCP. There's no "WebSocket over UDP."
- TCP guarantees: **every byte arrives, in order, exactly once**.
- The tradeoff is: if one TCP segment is lost, all subsequent segments wait for the retransmission. This is called **head-of-line blocking**.

**Our WebSocket messages** (JSON over text frames):

```
→ PTT_START   {"type":"PTT_START","talkgroup":"alpha","sender":"uuid","sessionId":1234,"timestamp":...}
→ PTT_AUDIO   {"type":"PTT_AUDIO","sessionId":1234,"chunk":0,"data":"<base64 encrypted opus>"}
→ PTT_AUDIO   {"type":"PTT_AUDIO","sessionId":1234,"chunk":1,"data":"..."}
  ... (16.67 of these per second)
→ PTT_END     {"type":"PTT_END","talkgroup":"alpha","sender":"uuid","sessionId":1234,"timestamp":...}
```

**Why JSON text and not binary?**
- Easier to debug (you can read WebSocket messages in browser dev tools or `wscat`)
- Shri's server (`hub.ts`) already uses `JSON.parse()` for routing
- The cost: Base64 encoding adds 33% size overhead. For production SATCOM, we'd switch to binary WebSocket frames + MessagePack to eliminate this.

---

## Packet Loss

**What is packet loss?** When a data packet is sent but never arrives at the destination. The data is gone.

### On our current system (TCP/WebSocket): NO packet loss at the application layer

TCP handles retransmission automatically. If a TCP segment is lost:
1. The receiver notices a gap in sequence numbers
2. It sends a duplicate ACK to the sender
3. The sender retransmits the lost segment
4. All subsequent segments (which arrived out of order) are re-ordered and delivered

**So we never lose a frame?** Correct — as long as the TCP connection stays alive. Every Opus frame we send will arrive at the other device, in order.

**But what if the connection drops entirely?** Then we lose everything that was in-flight. The WebSocket `onclose` fires. Our `RelaySocket` auto-reconnects (exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap, up to 5 retries). Any audio frames sent during the disconnect are lost. There's no replay buffer.

### What TCP costs us: Head-of-Line Blocking

Imagine 10 audio packets in transit:

```
Packet 1 → arrives ✓
Packet 2 → LOST (will be retransmitted)
Packet 3 → arrived, but WAITING behind packet 2
Packet 4 → arrived, but WAITING behind packet 2
...
Packet 2 → retransmitted, arrives ✓
Packets 3-10 → now delivered all at once (burst)
```

This causes **jitter**: packets arrive in bursts instead of evenly spaced. On a real-time audio stream (like a phone call), this would cause audible glitches. But in our system, **we don't play audio until PTT_END**, so jitter doesn't matter — all frames arrive before playback starts.

### On future SATCOM (if we switch to UDP/QUIC): REAL packet loss

Iridium Certus has ~2-5% packet loss. If we switch to UDP transport:
- Lost frames are simply missing. No retransmission.
- Opus has **built-in Packet Loss Concealment (PLC)**:
  - When the decoder is asked to produce output but given no input frame, it generates an approximation of what the missing audio probably sounded like, based on the previous frames.
  - This sounds like a brief "underwater" moment rather than a harsh click.
- Opus also supports **Forward Error Correction (FEC)**:
  - Each frame can embed a low-quality copy of the previous frame.
  - If frame N is lost, frame N+1 contains enough info to reconstruct a rough version of frame N.
  - We don't enable FEC currently (adds ~20% bitrate overhead).

### Our safety nets for missing data:

| Problem | How we handle it | Where |
|---------|-----------------|-------|
| Lost PTT_AUDIO frames | TCP retransmits them (current) | TCP layer |
| Lost PTT_END message | 8-second inactivity timer auto-flushes | `comms.js` line 97 |
| Stuck floor (device crashed) | Server 65s watchdog auto-releases | `hub.ts` line 31 |
| Connection drop | RelaySocket Auto-reconnect (5 retries, exponential backoff) | `RelaySocket.ts` |

---

## Jitter

**Jitter** = variation in packet arrival times. Even if no packets are lost, they might not arrive evenly spaced.

Example: You send frames every 60ms. They should arrive every 60ms. But on cellular:

```
Frame 1: arrives at 0ms      (on time)
Frame 2: arrives at 55ms     (5ms early)
Frame 3: arrives at 180ms    (120ms late! — cellular tower handoff)
Frame 4: arrives at 185ms    (back to normal)
Frame 5: arrives at 245ms    (normal)
```

Frame 3 was delayed by 120ms. In a phone call, this would cause an audible gap. In our system, it doesn't matter because **we buffer everything and play after PTT_END**.

**Why we chose buffered playback over real-time streaming**:
1. No jitter buffer needed (complex to implement correctly)
2. No lip-sync or timing problems
3. Simpler code — just accumulate and play
4. The tradeoff: you don't hear audio until the speaker releases PTT. For a walkie-talkie, this is the expected behavior anyway.

---

## Latency

**Latency** = total time from "I speak into mic" to "you hear it from speaker."

In our system, there are two kinds:

### Per-frame processing latency (while speaking):

| Step | Time | Where |
|------|------|-------|
| Mic capture (fill 60ms buffer) | 60ms | LiveAudioStream |
| PCM → Opus encode | ~3ms | OpusEncoderModule.kt |
| AES-GCM encrypt | ~1ms | Encryption.ts |
| WebSocket send (local) | ~1ms | RelaySocket |
| Network: phone → tower → ISP → DigitalOcean | 50-150ms | Cellular |
| Server process + fan-out | ~1ms | hub.ts |
| Network: DigitalOcean → ISP → tower → phone | 50-150ms | Cellular |
| WebSocket receive | ~1ms | RelaySocket |
| AES-GCM decrypt | ~1ms | Encryption.ts |
| Opus → PCM decode + downsample | ~3ms | OpusDecoderModule.kt |
| **Per-frame total** | **~170-370ms** | |

But this per-frame latency is hidden because we don't play in real-time.

### Total end-to-end latency (streaming mode — default):

```
Time to hear audio = per-frame pipeline latency only!

Example: You speak for 3 seconds.
  Frame 1 arrives at listener after ~200ms (network + codec)
  → AudioTrack plays it IMMEDIATELY
  → Listener hears your first word ~200ms after you said it
  → All subsequent frames play ~200ms behind you, in real-time
  → When you release PTT, last frame plays ~200ms later

Total delay: ~200ms (just network + codec). NO waiting for PTT_END.
```

### Total end-to-end latency (legacy WAV fallback):

```
Time to hear audio = speaking duration + per-frame latency of last frame + WAV write + playback start

Example: You speak for 3 seconds.
  = 3,000ms (speaking)
  + ~200ms (last frame network transit)
  + ~100ms (WAV file write)
  + ~100ms (expo-av Sound.createAsync() startup)
  = ~3,400ms from first word to playback start

The LISTENER waits 3.4 seconds, then hears all 3 seconds of audio.
```

**The streaming mode is the default**. The legacy WAV path only activates if the native AudioStreamPlayer module is missing (hasn't been compiled via `npx expo run:android`).

---

## Bandwidth Math

### Audio bandwidth (what we care about for SATCOM):

```
Per frame:
  Opus data:       ~120 bytes
  AES-GCM overhead: 28 bytes (12 IV + 16 tag)
  Total payload:   ~148 bytes

Frames per second: 16.67 (1000 / 60)

Audio bandwidth: 148 × 16.67 × 8 = ~19,730 bps ≈ 20 kbps (encrypted audio only)
```

### Wire bandwidth (what actually goes over the network):

```
Per frame on the wire:
  Opus + crypto:   ~148 bytes
  Base64 expansion: 148 × 4/3 = ~198 bytes
  JSON envelope:    ~58 bytes (type, sessionId, chunk keys)
  WebSocket header:  6 bytes
  Total:           ~262 bytes

Wire bandwidth: 262 × 16.67 × 8 = ~34,900 bps ≈ 35 kbps
```

### Satellite budget check:

```
Iridium Certus uplink:  22,000 bps
Our wire bandwidth:     ~35,000 bps  ← EXCEEDS LIMIT

Fix:
  Switch to binary WebSocket frames:  eliminates Base64 → saves ~50 bytes/frame
  Use MessagePack instead of JSON:    eliminates JSON overhead → saves ~52 bytes/frame
  Wire bandwidth with binary:         ~154 bytes × 16.67 × 8 = ~20,500 bps ≈ 21 kbps ✓
```

**On cellular**: 35 kbps is trivially small. 4G LTE has ~50 Mbps uplink. We're using 0.07% of available bandwidth.

**On SATCOM**: We need the binary protocol optimization (not yet implemented) to fit within 22 kbps.

---

## How to Change Compression Settings

### Lower bitrate (save bandwidth, reduce quality):

**File**: `packages/mobile/src/utils/opusEncoder.js` line 13

```js
const BIT_RATE = 8000;  // was 16000 — now 8kbps (tinny but half the bandwidth)
```

Rebuild: `cd packages/mobile && npx expo run:android`

### Change frame size (trade latency for overhead):

**File**: `packages/mobile/src/utils/audio.js` lines 30-33

```js
const FRAME_DURATION_MS = 20;  // was 60 — now 20ms (lower latency, 3× more packets/sec)
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000;  // 320
const BUFFER_SIZE = FRAME_SAMPLES * CHANNELS * 2;  // 640 bytes
```

Also update `OpusEncoderModule.kt` line 43:
```kotlin
private const val FRAME_DURATION_MS = 20
```

### Change sample rate (extreme bandwidth saving):

**File**: `packages/mobile/src/utils/opusEncoder.js` line 11

```js
const SAMPLE_RATE = 8000;  // was 16000 — narrowband (telephone quality)
```

**Also update in**: `audio.js` line 23, `opusDecoder.js` line 11, and the `OpusDecoderModule.kt` downsample ratio (would change from 48000/8000 = 6 instead of 3).

⚠️ **All sample rate changes require rebuilding the native modules**: `npx expo run:android`

---

## File-by-File Walkthrough

### `packages/mobile/src/utils/audio.js` (116 lines)

**Role**: TX pipeline orchestrator. Connects mic → encoder → encryptor → network.

| Lines | What |
|-------|------|
| 1-13 | Comment block explaining the architecture and why native modules |
| 14-18 | Imports: LiveAudioStream, comms, opusEncoder |
| 20-21 | State: `isRecording`, `chunkIndex` |
| 23-33 | **Constants**: `SAMPLE_RATE`, `CHANNELS`, `FRAME_DURATION_MS`, `BUFFER_SIZE` — **this is where you change frame size** |
| 35-99 | `startAudioStream()`: requests mic permission → inits encoder → configures LiveAudioStream → registers `on('data')` callback that encodes/encrypts/sends each chunk |
| 62-91 | The `on('data')` callback: raw PCM → `encodeOpusFrame()` → `encryption.encrypt()` → `comms.sendAudioChunk()` → `loopbackStash()` → console log with compression stats |
| 101-116 | `stopAudioStream()`: stops LiveAudioStream, destroys encoder |

### `packages/mobile/src/utils/opusEncoder.js` (48 lines)

**Role**: JS-side bridge to the native Kotlin Opus encoder.

| Lines | What |
|-------|------|
| 11-13 | **Constants**: `SAMPLE_RATE`, `CHANNEL_COUNT`, `BIT_RATE` — **this is where you change bitrate** |
| 17-27 | `initOpusEncoder()`: calls `OpusEncoder.initialize()` on the native module |
| 33-38 | `encodeOpusFrame(base64PCM)`: sends PCM to native, returns array of Opus frames |
| 40-47 | `destroyOpusEncoder()`: releases native resources |

### `packages/mobile/src/utils/opusDecoder.js` (45 lines)

**Role**: JS-side bridge to the native Kotlin Opus decoder.

| Lines | What |
|-------|------|
| 11-12 | Constants: `SAMPLE_RATE=16000`, `CHANNEL_COUNT=1` |
| 16-26 | `initOpusDecoder()`: calls `OpusDecoder.initialize()` on native module |
| 32-36 | `decodeOpusFrame(base64Opus)`: sends Opus frame to native, returns base64 PCM |
| 38-44 | `destroyOpusDecoder()`: releases native resources |

### `packages/mobile/src/utils/audioStreamPlayer.js` (56 lines)

**Role**: JS bridge to native AudioTrack streaming playback.

| Lines | What |
|-------|------|
| 14-17 | Constants: `SAMPLE_RATE=16000`, `CHANNEL_COUNT=1` |
| 24-29 | `startStreamPlayer()`: starts native AudioTrack in streaming mode |
| 36-41 | `writeStreamPCM(base64PCM)`: writes decoded PCM directly to speaker |
| 47-56 | `stopStreamPlayer()`: drains remaining audio, releases AudioTrack |

### `AudioStreamPlayerModule.kt` (170 lines)

**Role**: Native Android streaming audio player using AudioTrack in MODE_STREAM.

| Lines | What |
|-------|------|
| 1-25 | Package, imports, class doc explaining streaming vs WAV approach |
| 36-40 | State: `audioTrack`, `isPlaying` |
| 50-88 | `start()`: creates AudioTrack.Builder with USAGE_VOICE_COMMUNICATION, MODE_STREAM, 4× min buffer, starts playback |
| 97-117 | `write()`: base64-decodes PCM → `audioTrack.write()` — audio hits speaker immediately |
| 124-135 | `stop()`: drains buffer then releases AudioTrack |
| 141-157 | Internal `drainAndRelease()` and `releaseTrack()` cleanup |

### `packages/mobile/src/utils/comms.js` (464 lines)

**Role**: Singleton SDK instance + entire RX audio pipeline.

| Lines | What |
|-------|------|
| 1-8 | Setup: imports, creates `ForbiddenLANComms` and `Encryption` singletons |
| 18-46 | Floor control state + callbacks (`onFloorDenied`, `getFloorState`) |
| 50-70 | RX pipeline comment + `_pcmAccumulator` + streaming state (`_streamPlayerActive`, `_useStreamPlayer`) |
| 77-89 | `_ensurePlaybackMode()`: switches Android from recording mode to speaker playback |
| 96-107 | `_resetRxTimer()`: resets the 8-second inactivity timer (works for both streaming and legacy) |
| 109-122 | `_ensureDecoderReady()`: lazy-init the Opus decoder |
| 127-140 | `_startStreaming()`: starts native AudioTrack, falls back to legacy on failure |
| 145-155 | `_stopStreaming()`: stops AudioTrack gracefully |
| 160-190 | `_decodeAndPlay()`: decodes Opus → writes PCM to AudioTrack (streaming) or accumulates (legacy) |
| 195-205 | `_decodeAndAccumulate()`: accumulate-only path for loopback |
| 210-240 | `_flushAudio()`: stops streaming, destroys decoder, falls through to legacy if needed |
| 245-330 | `_flushAudioLegacy()`: builds WAV file from accumulated PCM (fallback + loopback) |
| 335-350 | Loopback support: `loopbackStash()`, buffer management |
| 355-430 | `initComms(jwt)`: connects relay, wires onRawMessage with streaming RX pipeline |
| 435-445 | `notifyTxStart()`: sets `_isLocalTx = true` |
| 450-464 | `notifyTxEnd()`: clears TX flag, processes loopback buffer |

### `OpusEncoderModule.kt` (196 lines)

**Role**: Native Android Opus encoder using MediaCodec.

| Lines | What |
|-------|------|
| 1-28 | Package, imports, class doc explaining VoIP tuning decisions |
| 38-45 | **Constants**: `FRAME_DURATION_MS=60`, `MIME_TYPE="audio/opus"` |
| 47-52 | State: `encoder`, `presentationUs`, `pcmAccumulator` |
| 58-90 | `initialize()`: creates MediaFormat with sampleRate/channelCount/bitRate, starts MediaCodec |
| 96-166 | `encode()`: receives base64 PCM → accumulates in `pcmAccumulator` → feeds exact 1920-byte frames to encoder → drains Opus frames → returns base64 Opus array |
| 108-119 | PCM diagnostic: logs max amplitude of first frame to verify mic is working |
| 168-174 | `destroy()`: releases encoder |
| 176-196 | Internal cleanup methods |

### `OpusDecoderModule.kt` (247 lines)

**Role**: Native Android Opus decoder using MediaCodec + 48→16kHz downsampling.

| Lines | What |
|-------|------|
| 1-24 | Package, imports, class doc explaining the 48kHz problem |
| 36-45 | **Constants**: `OPUS_INTERNAL_RATE=48000`, `TARGET_RATE=16000`, `DOWNSAMPLE_RATIO=3` |
| 64-116 | `initialize()`: builds OpusHead CSD-0/1/2 configuration buffers, starts MediaCodec |
| 124-145 | `downsample()`: **the 48→16kHz fix** — averages every 3 samples |
| 152-200 | `decode()`: feeds Opus frame to decoder → drains PCM → downsample → return base64 |
| 226-247 | `destroy()` and cleanup |

### `Encryption.ts` (42 lines)

**Role**: AES-GCM-256 encrypt/decrypt for audio frames.

| Lines | What |
|-------|------|
| 3 | Hardcoded test key (hex string) |
| 5-15 | `init()`: imports hex key into WebCrypto CryptoKey |
| 17-27 | `encrypt()`: random 12-byte IV → AES-GCM encrypt → prepend IV → base64 |
| 29-39 | `decrypt()`: split IV from ciphertext → AES-GCM decrypt → return base64 plaintext |

### `hub.ts` — Server relay (294 lines)

**Role**: Receives audio from sender, checks floor control, fans out to talkgroup.

| Lines | What |
|-------|------|
| 18-30 | FloorHolder interface + `talkgroupFloor` map |
| 31 | `FLOOR_WATCHDOG_MS = 65_000` — auto-release stuck floors |
| 100-107 | `fanOut()`: sends message to all talkgroup members except sender |
| ~242-253 | PTT_AUDIO handler: looks up talkgroup from sessionId → checks floor holder → drops audio from non-holders → fans out |
