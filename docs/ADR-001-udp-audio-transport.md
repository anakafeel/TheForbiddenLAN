# ADR-001: Migrate PTT Audio Transport to UDP

**Date:** 2026-03-04  
**Status:** Accepted  
**Authors:** Engineering team (Hackathon)

---

## Context

The ForbiddenLAN PTT system was initially built with all traffic — control and audio — running over WebSocket (TCP). This was the correct initial choice: WebSocket is easy to work with, works behind every NAT, and gives us reliable delivery for talkgroup management.

During the first live demo over the DLS-140 SATCOM router (Iridium Certus, ~22 kbps uplink), the engineering team identified a fundamental problem: **the system behaves like store-and-forward, not a walkie-talkie.**

## Problem

TCP guarantees reliable, in-order delivery. This is achieved through retransmission: if a packet is lost, TCP holds back all subsequent packets until the missing one is re-sent and acknowledged.

On a satellite link with 800–1200ms round-trip latency, a single lost audio packet causes:
1. TCP stalls — all queued audio frames freeze
2. TCP waits one full RTT for the retransmit request to reach the sender
3. TCP waits another full RTT for the retransmit to arrive
4. All stalled audio plays out in a burst once the missing packet arrives

This is the classic "store-and-go" pattern. The user experience is: hit PTT, speak, the listener hears silence then a burst of speech all at once. This is not a walkie-talkie — it is voicemail.

This problem exists on cellular too, but is masked by the low latency (~30ms RTT). On SATCOM it is catastrophic.

## Decision

**Move PTT audio frames (`PTT_AUDIO`) permanently to UDP. Keep all control messages on WebSocket.**

| Message Type | Transport | Reason |
|---|---|---|
| PTT_START | WebSocket (TCP) | Floor arbitration must be reliable |
| PTT_AUDIO | **UDP** | Real-time; dropped frames are concealed by Opus FEC |
| PTT_END | WebSocket (TCP) | Floor release must be reliable |
| JOIN/LEAVE_TALKGROUP | WebSocket (TCP) | State management must be reliable |
| PRESENCE | WebSocket (TCP) | User list must be accurate |
| TEXT_MSG | WebSocket (TCP) | Chat messages must be delivered |
| GPS_UPDATE | WebSocket (TCP) | Position tracking must be reliable |

## Why UDP Works Here

1. **Opus FEC:** The native `libopus` C++ encoder we integrated (via Android NDK/JNI) is configured with `OPUS_SET_INBAND_FEC(1)` and `OPUS_SET_PACKET_LOSS_PERC(20)`. This means every encoded frame contains enough redundant data to reconstruct the previous frame if it was lost. A dropped UDP audio packet becomes a brief, barely-audible click — not a freeze.

2. **NAT is handled:** Under Iridium Certus carrier-grade NAT, devices cannot receive inbound UDP directly. All UDP is routed through the relay server, which maintains a `userId → UDP endpoint` registry. The server fans out audio datagrams to each device's registered UDP port. This is already implemented in `hub.ts`.

3. **No re-ordering needed for PTT:** Audio frames arrive in order on a single network path. Brief out-of-order delivery causes a click, not data corruption. The jitter buffer handles minor reordering.

## Alternatives Considered

### Keep WebSocket but add a jitter buffer
**Rejected.** A jitter buffer can smooth reordering but cannot fix the TCP retransmit stall. If a packet is lost, the buffer drains while waiting for the retransmit, then fills again with a burst. This is exactly the store-and-go behaviour we are solving.

### QUIC / WebTransport
**Rejected for now.** QUIC provides UDP-based streams with optional per-stream reliability. This would be ideal — control streams reliable, audio streams unreliable. However, React Native does not have stable WebTransport support, and Fastify does not support QUIC natively. This is the correct long-term answer if the platform matures.

### RTP/RTCP over UDP
**Considered but deferred.** RTP adds jitter buffer timing marks, RTCP provides statistics. This would improve audio quality further and is the professional standard (used in TETRA, SIP, etc). The current implementation uses a simple sequence number on each frame which gives us ordered delivery detection. Full RTP/RTCP is the next step after validating the UDP architecture.

## Consequences

### Positive
- PTT transmissions feel instantaneous on both cellular and SATCOM
- No head-of-line blocking — a lost packet is a click, not a freeze
- Lower per-frame overhead: no TCP ACK/retransmit cycles on the 22 kbps uplink
- Opus FEC conceals packet loss transparently

### Negative / Tradeoffs
- **Keep-alive required:** UDP has no persistent connection. We send a `UDP_REGISTER` ping every 25 seconds to maintain the NAT port mapping on the DLS-140.
- **No delivery guarantee:** A listener with very high packet loss (>30%) will hear degraded audio even with FEC. Acceptable for the use case.
- **Two connection lifecycle states:** The app manages both a WebSocket connection and a UDP socket. Both must reconnect on network change. This added complexity is handled in `ForbiddenLANComms.ts`.

## Scalability to Distributed Backend

Shri's planned distributed backend (`docs/distributed-architecture.md`) explicitly preserves PTT_START/AUDIO/END as real-time relay messages (Role 1: Relay, unchanged from the current hub). The UDP sidecar in `hub.ts` taps into the same fan-out path. When the distributed backend ships, only the in-memory room-map fan-out needs to be replaced with a message queue publish. The UDP socket listener is untouched.

Mobile client requires zero changes for the distributed backend migration.
