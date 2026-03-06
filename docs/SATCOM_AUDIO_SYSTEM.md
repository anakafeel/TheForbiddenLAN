# SkyTalk SATCOM Audio System - Technical Documentation

## Table of Contents
1. [Network Protocols Overview](#network-protocols-overview)
2. [Why UDP for SATCOM](#why-udp-for-satcom)
3. [SATCOM Challenges](#satcom-challenges)
4. [Forward Error Correction (FEC)](#forward-error-correction-fec)
5. [Audio Pipeline Architecture](#audio-pipeline-architecture)
6. [Native Audio Streaming](#native-audio-streaming)
7. [Floor Control & PTT](#floor-control--ptt)
8. [Tradeoffs & Design Decisions](#tradeoffs--design-decisions)
9. [Future Improvements](#future-improvements)

---

## Network Protocols Overview

### TCP (Transmission Control Protocol)
- **How it works**: Establishes a connection, guarantees all packets arrive in order, retransmits lost packets
- **Pros**: Reliable, ordered delivery, automatic retransmission
- **Cons**: Higher latency due to acknowledgments and retransmission overhead
- **Use case**: Web pages, file downloads, email

### UDP (User Datagram Protocol)
- **How it works**: Fire-and-forget - sends packets without connection setup or acknowledgment
- **Pros**: Low latency, minimal overhead, can broadcast to multiple recipients
- **Cons**: No guarantee of delivery, no ordering, lost packets are gone forever
- **Use case**: Video streaming, gaming, VoIP (voice over IP)

### WebSocket
- **How it works**: TCP-based persistent connection that enables bidirectional communication
- **Pros**: Real-time, bidirectional, works through firewalls
- **Cons**: Higher overhead than UDP, not ideal for high-frequency data
- **Use case**: Chat apps, real-time dashboards, game state sync

### SATCOM Specific
- SATCOM (Satellite Communication) adds ~800ms+ one-way latency (1600ms round trip)
- High packet loss due to signal interference, weather, satellite handoffs
- Limited bandwidth (~22 kbps available for data)
- TCP overhead + retransmission = disaster on high-latency lossy links

---

## Why UDP for SATCOM

### The Problem with TCP/WebSocket on SATCOM

```
Timeline (Cellular - ~50ms RTT):
1. Send packet                    [0ms]
2. Server receives               [25ms]
3. Server sends ACK              [25ms]
4. Client receives ACK           [50ms]
Total: 50ms ✓ Acceptable

Timeline (SATCOM - ~1600ms RTT):
1. Send packet                    [0ms]
2. Server receives               [800ms]
3. Server sends ACK             [800ms]
4. Client receives ACK          [1600ms]
Total: 1600ms ✗ Unacceptable for real-time voice
```

With TCP, every audio chunk (60ms of voice) would take 1600ms to ACK - you'd never get real-time audio.

### Why UDP Works Better

```
Timeline (UDP on SATCOM):
1. Send packet                    [0ms]
2. Server receives               [800ms]
3. Server relays to others      [800ms]
4. Others receive              [1600ms]
Total: 1600ms - as fast as physics allows
```

UDP sends and forgets - no waiting for ACKs. The downside is lost packets are gone, but that's what FEC solves.

---

## SATCOM Challenges

### 1. High Latency
- **Problem**: ~800ms one-way, ~1600ms round trip
- **Impact**: 
  - PTT press → floor grant takes 1.6s
  - Your voice takes 0.8s to reach server
  - Other person's voice takes 0.8s to reach you
  - Total: 1.6s one-way conversation delay

### 2. Packet Loss
- **Problem**: SATCOM has 10-30% packet loss in bad conditions
- **Impact**: 
  - With 60ms audio chunks, losing 20% means 12 chunks lost per second
  - UDP doesn't retransmit - lost audio is silent
  - Results: choppy, broken audio

### 3. Limited Bandwidth
- **Problem**: ~22 kbps usable (out of 128 kbps satellite link)
- **Impact**:
  - Audio must be heavily compressed
  - Can't afford large headers or redundant data
  - FEC must be carefully tuned (20% vs 50% overhead matters)

---

## Forward Error Correction (FEC)

### What is FEC?

FEC adds redundant data to your transmission so the receiver can recover lost packets WITHOUT requesting retransmission.

### How Our FEC Works

#### XOR-Based FEC (Simple but Effective)

```
Group of 4 audio chunks:
Chunk 0: [A][B][C][D][E][F]...
Chunk 1: [G][H][I][J][K][L]...
Chunk 2: [M][N][O][P][Q][R]...
Chunk 3: [S][T][U][V][W][X]...

Parity = XOR of all chunks:
Parity:  [A⊕G⊕M⊕S][B⊕H⊕N⊕T][C⊕I⊕O⊕U][D⊕J⊕P⊕V]...
```

#### Recovery Process

If Chunk 1 is lost:
```
Received: Chunk 0, Chunk 2, Chunk 3, Parity
Recovered: Chunk 1 = Parity ⊕ Chunk 0 ⊕ Chunk 2 ⊕ Chunk 3
```

### Our Implementation

```typescript
// TX Side (sender)
const FEC_GROUP_SIZE = 4;  // 4 data + 1 parity
- Collect 4 audio chunks
- Generate XOR parity
- Send all 5 chunks (20% overhead)

// RX Side (receiver)  
- Buffer incoming chunks
- When parity arrives, try to recover missing chunks
- Play all chunks (original + recovered)
```

### FEC Tradeoffs

| FEC Level | Overhead | Recovery Ability | Bandwidth Impact |
|-----------|----------|-------------------|------------------|
| None      | 0%       | 0%                | Lowest           |
| 4+1 (20%) | 20%      | 25% (1 of 4)      | Moderate         |
| 2+1 (50%) | 50%      | 50% (1 of 2)      | High             |
| 1+1 (100%)| 100%     | 100%              | Highest          |

### Why We Chose 4+1 (20%)

1. **Bandwidth limit**: SATCOM only has 22 kbps usable
2. **Voice quality**: At 16 kbps audio, 20% = ~3.2 kbps extra
3. **Recovery**: Can recover 25% packet loss (better than nothing)
4. **Tested**: 50% (2+1) saturated the link, causing MORE loss

---

## Audio Pipeline Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MOBILE APP                                    │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐    ┌────────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Mic     │───>│ LiveAudio  │───>│  Opus    │───>│   UDP    │  │
│  │(Android) │    │  Stream    │    │ Encoder  │    │ Socket   │  │
│  └──────────┘    └────────────┘    └──────────┘    └────┬─────┘  │
│                                                            │         │
│                                                            v         │
│  ┌──────────┐    ┌────────────┐    ┌──────────┐    ┌──────────┐  │
│  │ Speaker  │<───│AudioStream│<───│  Opus    │<───│   UDP    │  │
│  │(Android) │    │  Player    │    │ Decoder  │    │ Socket   │  │
│  └──────────┘    └────────────┘    └──────────┘    └──────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                              │                                        │
│                        [FEC Processing]                              │
│                              │                                        │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                               v
┌─────────────────────────────────────────────────────────────────────┐
│                           SERVER                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐    ┌────────────┐    ┌──────────┐    ┌──────────┐  │
│  │   UDP    │<──>│    Hub     │<──>│   Web    │<──>│  Floor   │  │
│  │ Server   │    │  (Relay)   │    │Socket    │    │ Control  │  │
│  └──────────┘    └────────────┘    └──────────┘    └──────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Audio Capture (Mobile)
- **Technology**: `react-native-live-audio-stream` (Android native)
- **Sample Rate**: 16kHz
- **Channels**: Mono (1 channel)
- **Buffer**: 1920 bytes = 60ms of audio per chunk
- **Format**: Raw PCM (16-bit signed integer)

#### 2. Audio Encoding (Mobile)
- **Purpose**: Compress audio for bandwidth efficiency
- **Current Implementation**: Passthrough (no actual Opus encoding)
- **Why**: Native Opus modules weren't linked, implemented passthrough for testing
- **Target**: 16 kbps (200 bytes per 60ms chunk)
- **Future**: Implement actual Opus encoding

#### 3. FEC Encoding (Mobile)
- **Groups**: 4 audio chunks
- **Parity**: XOR of all 4 chunks
- **Output**: 5 chunks (4 data + 1 parity)
- **Overhead**: 20%

#### 4. UDP Transmission
- **Protocol**: UDP (not TCP/WebSocket)
- **Port**: 3000 (same as WebSocket)
- **Keep-alive**: 25-second interval (NAT port mapping)
- **Why UDP**: Lowest latency, works with SATCOM

#### 5. Server Relay
- **Receives**: UDP audio from mobile
- **Validates**: Checks floor control (must have permission to transmit)
- **Relays**: Sends to all other clients in same talkgroup
- **Delivery**: Both UDP and WebSocket (for reliability)

#### 6. FEC Decoding (Mobile)
- **Buffers**: Groups of 5 chunks
- **Detects**: Missing chunks in group
- **Recovers**: Uses XOR parity to reconstruct lost data
- **Plays**: All chunks (original + recovered) in order

#### 7. Audio Playback (Mobile)
- **Technology**: Custom native `AudioStreamPlayer` module
- **Mode**: Streaming (not buffered)
- **Why Native**: expo-av was deprecated, couldn't do real-time streaming
- **Output**: Direct to Android AudioTrack

---

## Native Audio Streaming

### Problem: Legacy Buffered Playback

The original implementation used expo-av which:
1. Accumulates all audio chunks
2. Builds a WAV file in memory
3. Plays the WAV file

This meant: **You only heard audio AFTER the sender released PTT** - exactly like "store and forward"!

### Solution: Native AudioTrack Streaming

Created custom native module (`AudioStreamPlayerModule.kt`):

```kotlin
class AudioStreamPlayerModule : ReactContextBaseJavaModule {
    private var audioTrack: AudioTrack? = null
    
    fun start(sampleRate: Int, channelCount: Int) {
        // Create streaming AudioTrack (not buffered)
        audioTrack = AudioTrack.Builder()
            .setTransferMode(AudioTrack.MODE_STREAM)  // Key: STREAM not BUFFER
            .build()
        audioTrack?.play()
    }
    
    fun write(base64PCM: String) {
        // Write directly to speaker - no buffering!
        val pcmBytes = Base64.decode(base64PCM)
        audioTrack?.write(pcmBytes, 0, pcmBytes.size)
    }
}
```

### Why This Matters

| Mode | Latency | When Audio Plays |
|------|---------|-------------------|
| Buffered (old) | ~2-3 seconds | After PTT released |
| Streaming (new) | ~60ms | In real-time |

---

## Floor Control & PTT

### The Problem: SATCOM Latency

When you press PTT:
1. Phone sends PTT_START (WebSocket) → server
2. Server processes, grants floor
3. Server sends FLOOR_GRANT → phone
4. Phone receives FLOOR_GRANT
5. Phone starts sending audio

On cellular: Steps 1-5 take ~100ms total ✓
On SATCOM: Steps 1-5 take ~1600ms total ✗

**The bug**: Audio started BEFORE floor was granted, server dropped it!

### The Fix: Wait for Floor Grant on SATCOM

```typescript
async sendAudioChunk(base64OpusData: string): Promise<void> {
    // On SATCOM, wait for floor grant
    if (this.transportMode === "satcom" && !this.floorGranted) {
        return; // Silently drop until floor granted
    }
    await this.audio?.enqueueChunk(base64OpusData);
}
```

### How Floor Control Works

```
1. User A presses PTT
   └─> Phone sends PTT_START (WebSocket)

2. Server receives PTT_START
   └─> Checks if channel is free
   └─> Grants floor to User A
   └─> Sends FLOOR_GRANT to User A

3. User A receives FLOOR_GRANT
   └─> floorGranted = true
   └─> Start sending audio (UDP)

4. Other users receive FLOOR_GRANT
   └─> Know channel is busy
   └─> Can't transmit

5. User A releases PTT
   └─> Sends PTT_END
   └─> Server releases floor
   └─> FLOOR_RELEASED to all
```

---

## Tradeoffs & Design Decisions

### 1. UDP vs TCP/WebSocket

| Factor | UDP | WebSocket (TCP) |
|--------|-----|-----------------|
| Latency | Low (~800ms) | High (~1600ms+) |
| Reliability | None | Guaranteed |
| Packet Loss | Handled by FEC | Retransmitted |
| Implementation | Simple | Simple |
| **Decision** | ✓ CHOSEN | |

### 2. FEC Level (4+1 vs 2+1)

| Factor | 4+1 (20%) | 2+1 (50%) |
|--------|------------|------------|
| Overhead | 20% | 50% |
| Recovery | 25% | 50% |
| Bandwidth | 19.2 kbps | 24 kbps |
| SATCOM Limit | ✓ Under 22kbps | ✗ Over limit! |
| **Decision** | ✓ CHOSEN | Saturated link |

### 3. Native vs JavaScript Audio

| Factor | Native Streaming | JS (expo-av) |
|--------|-------------------|---------------|
| Latency | ~60ms | ~2-3 seconds |
| Implementation | Complex | Simple |
| Real-time | ✓ Yes | ✗ Buffered |
| **Decision** | ✓ CHOSEN | |

### 4. Wait for Floor Grant (SATCOM only)

| Factor | Wait | Don't Wait |
|--------|------|------------|
| Audio Plays | Yes (if floor granted) | No (dropped by server) |
| First Chunk | Delayed ~800ms | Immediate but lost |
| Complexity | Medium | Low |
| **Decision** | ✓ CHOSEN (SATCOM) | |

---

## Future Improvements

### 1. Actual Opus Encoding
Currently using passthrough (no compression). Implement real Opus:
- Target: 6-8 kbps (vs current 16 kbps)
- Benefit: More bandwidth for FEC
- Tradeoff: Requires native module

### 2. Adaptive FEC
Monitor packet loss and adjust FEC level:
```typescript
if (packetLoss > 20%) {
    FEC_GROUP_SIZE = 2;  // More redundancy
} else {
    FEC_GROUP_SIZE = 4;  // Less overhead
}
```

### 3. Jitter Buffer
Buffer small amount of audio to smooth out timing:
- Adds ~100-200ms latency
- Improves audio quality
- Better for conversational flow

### 4. Voice Activity Detection (VAD)
Only transmit when speaking:
- Reduces bandwidth by 50%
- Eliminates dead air
- Needs to detect silence vs speech

### 5. Server-Side FEC
Let server do FEC instead of client:
- Reduces bandwidth (server → client only)
- More complex server logic
- Could do more aggressive FEC

### 6. T.38 Fax / Dry Token
For ultra-reliable communications:
- Old-school but bulletproof
- Works on any network
- Very low bandwidth

---

## Troubleshooting

### Can't hear audio over SATCOM?

1. **Check signal**: Make sure DLS-140 has clear sky view
2. **Both on SATCOM**: Both phones must be on DLS-140 WiFi
3. **Floor granted**: Look for "Floor GRANTED" in logs BEFORE audio starts
4. **FEC working**: Look for "FEC recovered chunk" in logs

### Audio choppy?

1. **SATCOM signal**: Go outside, clear sky view
2. **Packet loss**: Check logs for gaps in chunk sequence
3. **Bandwidth**: FEC 4+1 is max viable for SATCOM

### Audio only plays after PTT release?

1. **Native module**: Check for "AudioTrack streaming started" in logs
2. **Not legacy mode**: Should NOT see "legacy WAV fallback"

---

## Appendix: Key Files

### Mobile App
- `packages/mobile/src/utils/comms.js` - Main audio comms logic
- `packages/mobile/src/utils/audio.js` - Audio capture/playback
- `packages/mobile/src/utils/audioStreamPlayer.js` - JS bridge for native player
- `packages/mobile/android/app/src/main/java/.../AudioStreamPlayerModule.kt` - Native Android player

### Comms Library
- `packages/comms/src/ForbiddenLANComms.ts` - Main comms class
- `packages/comms/src/AudioPipeline.ts` - Audio TX with FEC
- `packages/comms/src/UdpSocket.ts` - UDP socket handling
- `packages/comms/src/RelaySocket.ts` - WebSocket handling

### Server
- `packages/server/src/ws/hub.ts` - UDP relay, floor control

---

## Glossary

- **SATCOM**: Satellite Communication
- **PTT**: Push-to-Talk
- **UDP**: User Datagram Protocol
- **FEC**: Forward Error Correction
- **RTT**: Round Trip Time (latency)
- **NAT**: Network Address Translation
- **WAV**: Waveform Audio File Format (uncompressed audio)
- **PCM**: Pulse-Code Modulation (raw audio samples)
- **Opus**: Audio codec (compression)
- **AudioTrack**: Android native audio output
- **Floor Control**: System to ensure only one person transmits at a time
