# ForbiddenLAN — Slide Deck Outline

---

## Slide Design Guide

> Use this section as the style brief when generating slides in Gamma, Beautiful.ai, or any AI slide tool. Paste the relevant parts directly into the tool's style/theme prompt.

### Overall Aesthetic
Dark, technical, aviation-grade. Think mission control, not startup pitch. The product runs on satellite hardware in remote airfields — the slides should feel like that environment. High contrast, purposeful use of color, nothing decorative.

### Color Palette (from mobile app theme)

| Role | Hex | Usage |
|---|---|---|
| Background (primary) | `#05070B` | Slide background |
| Background (card/surface) | `#0B1220` | Content blocks, code blocks |
| Background (elevated) | `#111C31` | Diagrams, table backgrounds |
| Primary accent | `#2563FF` | Headers, key numbers, highlights |
| Primary accent (dark variant) | `#1D4ED8` | Secondary accent, borders |
| Text primary | `#F8FAFC` | Body text, bullet points |
| Text secondary | `#60A5FA` | Labels, captions, slide subtitles |
| Status: active/online | `#22C55E` | ✅ shipped indicators, positive states |
| Status: warning | `#F59E0B` | Scope limitations, caveats |
| Status: danger | `#EF4444` | "Did NOT do", rejected options in tradeoffs |
| Info / highlight | `#38BDF8` | Callout boxes, inline technical terms |

### Typography
- **Headings:** Bold, large, tight letter spacing
- **Body:** Regular weight — fewer words per slide is better, don't fill every inch
- **Numbers/metrics:** Display size, `#2563FF` or `#F8FAFC`, bold — make the number the visual anchor
- **Code/technical strings:** Monospace, `#38BDF8` on `#0B1220` background
- **Font family:** Inter, or any clean geometric sans-serif (avoid serif, avoid decorative fonts)

### Slide Layout Patterns
- **Dark background on every slide** — `#05070B` base, surface cards in `#0B1220` or `#111C31`
- **One key idea per slide** — large header, supporting bullets below
- **Tables:** Header row `#111C31` with `#2563FF` text, alternating rows `#0B1220` / `#05070B`
- **Architecture diagrams:** `#60A5FA` lines on dark background, node boxes in `#111C31` with blue border
- **Callout boxes:** `#111C31` background, left border in `#2563FF` (3–4px solid), used for key messages
- **Shipped items:** `#22C55E` green
- **Rejected/not chosen items:** `#EF4444` or strikethrough
- **Metrics to emphasize:** Large, `#2563FF`, bold

### What to Avoid
- Light backgrounds (mismatch with app aesthetic, harder to read projected)
- More than 5–6 bullet points per slide
- Stock photos or generic icons
- Heavy animations

### Gamma.ai Prompt
```
Dark technical theme. Background #05070B near-black. Primary accent #2563FF blue.
Surface cards #0B1220 and #111C31. Text #F8FAFC white. Font Inter or geometric sans-serif.
Aviation/industrial aesthetic, mission control feel. Clean, minimal, high contrast.
Green #22C55E for positive/shipped indicators. Red #EF4444 for rejected items.
Cyan #38BDF8 monospace for code snippets on dark surface. No stock photos.
```

---

> **Presentation goal:** Judges walk away thinking: strong, functioning, well-thought-out product with clear UI intent.
> **Time budget:** 30 minutes. ~2.5 min/slide, demo is its own block (~5–7 min).
>
> **Score weights to optimize for:**
> - Technical Functionality: 40% — PTT reliability, auth, data efficiency, relay
> - User Experience: 30% — intuitive UI, feedback, talkgroup switching, portal
> - Architecture & Scalability: 15% — justification, connectivity handling
> - Presentation & Documentation: 15% — problem articulation, diagrams, tradeoffs
> - Innovation Bonus: +15%

---

## Slide 1 — Title (~30 sec)

**Content:**
- Project name: **ForbiddenLAN / SkyTalk**
- Tagline: *Satellite Push-to-Talk Radio for Aviation Ground Crews*
- Team names + roles (Shri · Saim · Maisam · Annie)
- SkyTrac Hackathon 2026

**Presenter note:** One sentence — "we built a walkie-talkie that runs over Iridium satellite" — then go straight to the demo. Don't explain anything else yet.

---

## Slide 2 — Live Demo (~5–7 min)

**Content:**
- Live PTT between two phones over the SKYLINK unit
- Show: press-to-talk, audio received by second device, floor indicator, PTT release
- Show: talkgroup list, switching channels
- Show: moving map with GPS positions
- Show: web portal — device management, talkgroup creation

**Presenter note:** Let the UI do the talking. Narrate UX decisions out loud as you go — "notice the floor indicator changes before audio even starts," "talkgroup switching is instant," "GPS positions update in real time." Judges should be impressed before they know anything about the architecture. Have a backup video clip ready if satellite signal is unreliable on demo day.

---

## Slide 3 — How We Approached the Constraints (~2 min)

**Content:**
- You know this hardware better than us — 22 kbps uplink, 500–1500ms RTT, store-and-forward, CGN, per-byte pricing, orbital handoffs
- Here's how we prioritized:
  - **Latency over reliability for audio** — drop a frame, don't freeze the call
  - **Instant PTT feel is non-negotiable** — no server round-trip before mic opens
  - **Stay under budget at every layer** — Opus codec, sessionId compression, field stripping
  - **Graceful degradation** — dual delivery so a lost UDP NAT mapping doesn't kill audio

- What we consciously deprioritized for hackathon scope:
  - Binary framing (JSON overhead is within budget, revisit post-hackathon)
  - Full AES-GCM implementation (architecture is correct, crypto is a swap-in)
  - iOS support (requires macOS build toolchain, team on Linux)

**Presenter note:** Don't explain the hardware spec to them. Acknowledge they know it, and pivot immediately to how you chose to respond to it. The interesting part to this audience is the prioritization, not the spec.

---

## Slide 4 — Scope & What We Shipped (~1 min)

**Content:**

**Core (shipped):**
- Half-duplex PTT over Iridium Certus and cellular
- Talkgroup routing, membership, registration
- Client-side floor control with GPS timestamp arbitration
- Text messaging, live GPS moving map
- Web portal: device/user/talkgroup management, key rotation
- Dual UDP + WebSocket transport with client deduplication

**Bonus criteria (also shipped):**
- ✅ Moving map showing participant locations
- ✅ Floor collision arbitration (walk-on prevention)
- ✅ Talkgroup switching

**Consciously post-hackathon:**
- Binary wire format (drop JSON overhead)
- Full AES-GCM with proper KDF (architecture done, implementation stubbed)
- Distributed sync protocol (designed, not implemented)
- iOS build

**Presenter note:** This audience wrote the rubric. Don't just show them what they asked for — show them you thought beyond it and made deliberate tradeoff calls on scope.

---

## Slide 5 — System Architecture (~2 min)

**Content: System diagram**

```
[Phone A]──Wi-Fi──[DLS-140]──Iridium SATCOM──[Internet]
                                                  │
[Phone B]──Wi-Fi──[DLS-140]──Iridium SATCOM──[Relay Server]──DigitalOcean
                                                  │
[Phone C]──4G/LTE cellular──────────────────────[Relay Server]
```

**The relay server does four things:**
1. **Real-time relay** — fan out PTT audio + control to talkgroup members
2. **Floor control** — server-authoritative collision arbitration
3. **Auth + provisioning** — JWT issuance, admin CRUD
4. **Sync broker** *(designed, post-hackathon)* — catch-up for reconnecting devices

**Two transports, one port:**
- WebSocket (TCP) — control messages (floor control, presence, text)
- UDP — PTT audio (bypasses store-and-forward buffering)

**Key constraint driving everything:** DLS-140 is outbound-only (CGN). All traffic must route through the relay — no direct device-to-device.

---

## Slide 6 — Floor Control: The Hardest Problem (~2 min)

**Content:**

*Who talks when, in real time, with 1500ms satellite RTT?*

**What we did NOT do:**
- Server-grant model: PTT_START → server → FLOOR_GRANT → start audio
- That's 1–3 seconds of dead air. Feels broken. Defeats the whole product.

**What we did — optimistic transmission + client-side deterministic arbitration:**
1. User presses PTT → audio starts immediately, PTT_START sent to server
2. Server fans PTT_START to all members
3. Each client independently runs the same algorithm:
   - One PTT_START? That sender has the floor.
   - Two within 50 ms? Lower GPS timestamp wins. UUID tiebreaker.
4. Loser's UI shows "floor taken" — mic stops

**Why GPS timestamps work:** GNSS on the DLS-140 is nanosecond-accurate and globally synced. Clock skew between sites is negligible compared to satellite latency. Every receiver reaches the same conclusion independently.

**Server still enforces:** 60-second watchdog auto-releases the floor if PTT_END never arrives (hot mic prevention).

**Tradeoff accepted:** ~50 ms collision window. Brief bandwidth waste. Instant PTT feel preserved.

---

## Slide 7 — Messaging Framework: Why WebSocket + UDP (~2 min)

**Content:**

*Why not WebSocket for everything?*

**The problem: Iridium Certus is store-and-forward**
- The link buffers data and delivers it in bursts — not a continuous pipe
- TCP/WebSocket audio over this link arrives in chunks, not real-time
- Result: silence → burst of audio → silence. Voicemail, not radio.

**Why UDP for audio:**
- Each UDP datagram is independent — bypasses store-and-forward buffering
- Lost frame = brief ~5 ms audio glitch; Opus FEC conceals it
- Opus configured: `INBAND_FEC=1`, `PACKET_LOSS_PERC=20%` — each frame carries data to reconstruct the previous if dropped

**Why WebSocket for control:**
- PTT_START/END, presence, join/leave — these must arrive reliably and in order
- Store-and-forward delay is fine for control. It is not fine for voice.

**Dual delivery (reliability safety net):**
- Server always relays audio via both UDP + WebSocket unconditionally
- Clients deduplicate by `sessionId + chunk` — play it once, whichever arrives first
- Protects against expired UDP NAT mappings during satellite handoff

| Message | Transport | Why |
|---|---|---|
| PTT_AUDIO | UDP + WebSocket | Bypass buffering; WS is fallback |
| PTT_START / PTT_END | WebSocket | Floor control must be reliable |
| JOIN/LEAVE, PRESENCE, TEXT | WebSocket | Ordering + no duplicates |
| GPS_UPDATE | WebSocket | Accuracy over speed |
| UDP_REGISTER (keep-alive) | UDP only | NAT mapping maintenance |

---

## Slide 8 — Bandwidth Budget (~1.5 min)

**Content:**

*Fitting voice into 22 kbps — every byte is money*

**Current implementation (no crypto):**

| Layer | Bytes per packet |
|---|---|
| Raw Opus (measured after encoding) | 22 B |
| + Base64 encoding (of 22 B) | 32 B |
| + JSON framing (type, sessionId, chunk, data) | **~93 B total** |

- 16 packets/sec × 93 B × 8 = **~11.9 kbps** (~54% of 22 kbps uplink)

**Production target (with AES-GCM-256):**

| Layer | Bytes per packet |
|---|---|
| Raw Opus | 22 B |
| + AES-GCM (12B IV + 16B auth tag) | 50 B |
| + Base64 encoding (of 50 B) | 68 B |
| + JSON framing | **~129 B total** |

- 16 packets/sec × 129 B × 8 = **~16.5 kbps** (~75% of 22 kbps uplink)

**Both fit.** Adding full end-to-end encryption costs ~4.6 kbps — still 5.5 kbps headroom remaining.

**Protocol optimizations to stay under budget:**
- `sessionId` int instead of full device UUID in every audio frame → saves ~31 chars/packet × 16/sec ≈ 4 kbps
- PTT_AUDIO omits talkgroup field entirely — server resolves from sessionId map seeded by PTT_START

---

## Slide 9 — Mobile App: PTT & Core Flow (~2 min)

**Content: Screenshots**

Walk through the primary user journey:
1. **Login screen** — username/password, JWT auth
2. **Talkgroup list** — joined channels, online member count, signal strength bars
3. **PTT screen** — large hold-to-talk button, active speaker indicator, floor status, channel name

**Presenter note:** The PTT screen is the hero. Spend time here. Talk through what each UI element communicates to the user — the floor indicator especially. This is 30% UX score territory.

*(Insert screenshots here)*

---

## Slide 10 — Mobile App: Map & Chat (~1.5 min)

**Content: Screenshots**

4. **Moving map** — live GPS pins for all online crew, talkgroup-filtered, updates in real time
5. **Text chat** — per-talkgroup text messages with sender names and timestamps

**Presenter note:** The moving map is a bonus criteria item (Innovation +15%). Call it out explicitly.

*(Insert screenshots here)*

---

## Slide 11 — Web Admin Portal (~1.5 min)

**Content: Screenshots**

1. **Dashboard** — device health, active sessions, GPS overview
2. **Talkgroup management** — create/delete talkgroups, member roster
3. **User/device management** — register devices, deactivate compromised units
4. **Key rotation** — rotate AES-GCM encryption key per talkgroup

*(Insert screenshots here)*

---

## Slide 12 — Design Tradeoffs (~2 min)

**Content:**

| Decision | Chose | Rejected | Why |
|---|---|---|---|
| Audio transport | UDP + Opus FEC | WebSocket only | Iridium is store-and-forward; TCP audio arrives in bursts |
| Floor control | Client-side deterministic | Server-grant | Server RTT adds 1–3s dead air; GPS timestamps enable instant local arbitration |
| Audio codec | Opus (measured 22B/packet) | Higher bitrate | Had to fit within 22 kbps; measured against actual hardware |
| Audio framing | JSON + Base64 | Binary protocol | MVP velocity; overhead acceptable within budget |
| Encryption | AES-GCM architecture (stub impl) | No encryption | Relay moves encrypted blobs only; real crypto is a drop-in swap |
| Mobile platform | React Native Android | Native iOS | iOS requires macOS build toolchain; team on Linux |

**Presenter note:** This is the Architecture & Scalability (15%) and part of Presentation & Documentation (15%) score. Be concise — you've already explained the most important ones (transport, floor control) in slides 6 and 7. This is the summary.

---

## Slide 13 — Q&A

**Content:**
- Open floor for questions
- Have architecture diagram from slide 5 ready to pull back up
- Have bandwidth budget from slide 8 ready if data efficiency questions come up

---

## Slide Order Summary

```
1.  Title                              ~30 sec
2.  Live Demo                          ~5–7 min
3.  How We Approached the Constraints  ~2 min
4.  Scope & What We Shipped            ~1 min
5.  System Architecture                ~2 min
6.  Floor Control                      ~2 min
7.  Messaging Framework                ~2 min
8.  Bandwidth Budget                   ~1.5 min
9.  Mobile App: PTT & Core Flow        ~2 min
10. Mobile App: Map & Chat             ~1.5 min
11. Web Admin Portal                   ~1.5 min
12. Design Tradeoffs                   ~2 min
13. Q&A                                remaining

Total scripted: ~26–28 min
Buffer: ~2–4 min
```

---

## Notes for Presenters

- **Slide 2 (Demo) is the centerpiece.** Judges see a polished working product before hearing a single word about architecture. Narrate UX decisions live — don't just show screens, explain what each element communicates to the user.
- **Slide 3 (Constraints) is about prioritization, not specs.** These judges know the hardware. Acknowledge that, then immediately talk about how you chose to respond to it. The interesting part is the tradeoff thinking, not the bullet list.
- **Slide 4 (Scope) shows you thought beyond the rubric.** Calling out bonus criteria you shipped AND conscious post-hackathon scope is more impressive to this audience than a requirements checklist.
- **Slides 6 + 7** are your strongest technical talking points — GPS timestamp floor arbitration and the store-and-forward UDP discovery. These are also innovation bonus territory.
- **Moving map (slide 10)** is explicitly listed in the Innovation bonus criteria (+15%). Name it as a bonus feature when you present it.
- **Slides 9, 10, 11** need actual screenshots inserted before presenting.
- Encryption is one row in the tradeoffs table — the stub implementation means a full slide invites more scrutiny than it's worth.

---

## Q&A Prep

These judges are SkyTrac engineers who work on this problem domain. Expect technically sharp questions.

---

### Audio Transport

**"Why not WebRTC? It handles NAT traversal, codec negotiation, and audio — why reinvent it?"**
WebRTC assumes STUN/TURN for NAT traversal, which requires inbound connectivity the DLS-140 doesn't support. Its ICE negotiation also adds latency on connection setup. We needed direct control over the transport to implement dual delivery and client-side deduplication. WebRTC would have fought us on all of that.

**"Why not QUIC instead of WebSocket + UDP?"**
QUIC gives you multiplexed streams without head-of-line blocking, but it's still connection-oriented — it doesn't bypass store-and-forward buffering at the satellite link layer the way raw UDP does. We'd have traded one problem for a more complex one. UDP + Opus FEC is simpler and directly addresses what we observed.

**"Why not RTP/RTCP? That's the standard for real-time audio."**
RTP would have been the right call in a production system — timing marks, jitter buffer hints, RTCP quality stats. We evaluated it. The overhead and implementation complexity were out of scope for a week. The sessionId + chunk approach gives us enough for deduplication and sequencing; we'd migrate to RTP post-hackathon.

**"Why Opus and not Codec2? Codec2 does intelligible voice at 700bps, which is way under your budget."**
We considered it. Codec2 produces better compression but lower audio quality, no FEC, and React Native has no mature Codec2 binding — we'd have had to write a native module from scratch. Opus has `react-native-opus`, built-in FEC, and produces much better audio quality at 22 kbps. The budget math worked out, so we took the audio quality.

---

### Floor Control

**"The 60-second hot mic watchdog — is that actually acceptable? That's a long time to block a channel."**
Fair criticism. It's a safety net for a crash or dropped connection, not an expected path. In normal operation PTT_END always arrives. For production we'd tune this down significantly and add RTCP-style heartbeats so the server knows the client is still alive. For hackathon scope it protects against the worst case without adding complexity.

**"What happens to the audio from the losing side during the 50ms collision window?"**
The losing device's UI shows "floor taken" and stops recording immediately. The audio already sent in that window is relayed to talkgroup members — they may briefly hear both senders, then the loser cuts out. It's equivalent to a real radio walk-on, which is exactly what you'd expect from a walkie-talkie.

**"If clients do deterministic arbitration, what is the server's floor enforcement role?"**
The server does two things clients can't: enforces that only the floor holder's PTT_AUDIO frames are relayed (rejects frames from non-holders), and runs the watchdog timer. Clients do the arbitration to avoid latency; the server enforces the result to prevent a misbehaving or crashed client from holding the floor indefinitely.

---

### Bandwidth & Protocol

**"What happens to GPS updates during heavy PTT? You said ~5.5 kbps headroom — GPS at what frequency?"**
GPS updates go over WebSocket at roughly 1Hz. A minimal GPS JSON message is ~80 bytes — at 1Hz that's ~640 bps. Well within the headroom. Under heavy PTT we could back off to 0.5Hz without any meaningful UX impact on the map.

**"Do you send silence packets? Silence suppression would save a lot of uplink."**
No silence suppression currently. Every 60ms we're encoding and sending regardless. Adding VAD (voice activity detection) and silence suppression is one of the higher-value post-hackathon items — on a full transmission it could cut uplink usage by 30-50% in normal conversation patterns.

**"Your sessionId is a 4-byte int but you're JSON-encoding it. That's 1–5 ASCII digits, not 4 bytes."**
Correct. The "4-byte int" refers to the integer value range (up to ~4 billion), not the wire encoding. In JSON it serializes as 1–5 ASCII characters. We named the bandwidth saving accurately — ~31 chars vs UUID (36 chars). Binary framing would actually give us the true 4-byte encoding.

---

### Architecture

**"You chose a centralized relay. Did you consider any peer-to-peer or multicast approach?"**
The DLS-140 is outbound-only behind CGN — it can initiate connections but can't receive them. True P2P is off the table without a TURN-equivalent, which just moves the relay. Multicast would require ISP-level multicast support on the Iridium network which doesn't exist. Centralized relay is the only viable topology for this hardware.

**"What's your scalability ceiling? How many concurrent users before the relay struggles?"**
The relay is in-memory fan-out using Node.js WebSocket. Under load testing we haven't hit meaningful limits at hackathon scale. For production: the relay is stateless enough to shard by talkgroup, and the append-only operation log design we have for the sync protocol would support horizontal scaling. We didn't stress test at thousands of users — that's out of scope for the week.

**"How does satellite handoff actually behave? The 8-minute orbital handoff — what does the user experience?"**
During handoff the satellite link drops for a few seconds. WebSocket reconnects on the next available satellite. UDP NAT mappings expire. The dual delivery system means if the WebSocket falls back during that window, audio is still received via WebSocket on reconnect. The client sends a new UDP_REGISTER on reconnect to re-establish the UDP path. The user experiences a brief audio gap, then normal operation resumes.

---

### Product & Scope

**"If you had another week, what's the first thing you'd tackle?"**
Binary wire framing. It's the highest leverage change — drops JSON overhead, saves ~30 bytes per audio packet, gives real 4-byte sessionId encoding. Directly below budget on the uplink usage. Everything else (real AES-GCM, iOS, silence suppression) builds on a cleaner protocol layer.

**"How would this integrate with an ICOM gateway?"**
We designed for it but didn't implement it. The audio pipeline encodes to Opus; ICOM gateway integration would require transcoding to whatever the gateway expects (typically PCM or G.711). The relay could act as a bridge — a gateway connection feeds audio into the talkgroup fan-out the same way a phone does.

**"The encryption is stubbed — what's your threat model?"**
The architecture is end-to-end: the relay moves encrypted blobs and never touches keys. The threat we're protecting against is eavesdropping on the satellite or ISP link, and relay-side compromise. A compromised relay can disrupt communication but can't decrypt audio. For the hackathon demo on a trusted LAN the stub is acceptable; for any real deployment it's a drop-in swap to `react-native-quick-crypto` with AES-GCM-256 and a proper KDF from the talkgroup master secret.

