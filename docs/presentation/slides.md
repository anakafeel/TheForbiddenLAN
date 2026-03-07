---
theme: default
title: 'TheForbiddenLAN'
titleTemplate: '%s'
author: 'Shri, Saim, Maisam, Annie'
highlighter: shiki
lineNumbers: false
drawings:
  persist: false
transition: fade
fonts:
  sans: Inter
  mono: Fira Code
mermaid:
  theme: base
  themeVariables:
    primaryColor: '#111C31'
    primaryTextColor: '#F8FAFC'
    primaryBorderColor: '#2563FF'
    lineColor: '#60A5FA'
    secondaryColor: '#0B1220'
    tertiaryColor: '#111C31'
    background: '#05070B'
    mainBkg: '#111C31'
    nodeBorder: '#2563FF'
    clusterBkg: '#0B1220'
    titleColor: '#F8FAFC'
    edgeLabelBackground: '#0B1220'
---

<!-- SLIDE 1 — Title -->

# TheForbiddenLAN

<h2>Satellite Push-to-Talk for Aviation Ground Crews</h2>

<p style="color: #8FA3C7; font-size: 1.1rem; margin-top: 1rem;">Shri &nbsp;·&nbsp; Saim &nbsp;·&nbsp; Maisam &nbsp;·&nbsp; Annie</p>

<p style="color: #38BDF8; font-size: 0.9rem; margin-top: 0.5rem; letter-spacing: 0.05em;">SkyTrac Hackathon 2026</p>

<!-- One sentence intro, go straight to demo. -->

---
layout: center
---

<!-- SLIDE 2 — Live Demo -->

<h1 style="font-size: 4.5rem; font-weight: 900; color: #F8FAFC; letter-spacing: -0.04em;">LIVE DEMO</h1>

<div style="margin-top: 2rem; color: #8FA3C7; font-size: 1.05rem; line-height: 2.2;">
  <ol style="list-style: decimal; padding-left: 1.5rem; text-align: left; display: inline-block;">
    <li>PTT between two phones</li>
    <li>Floor indicator behavior</li>
    <li>Talkgroup switching</li>
    <li>Moving map</li>
    <li>Web portal</li>
  </ol>
</div>

<!-- Narrate UX decisions as you go. Backup clip ready if signal drops. -->

---
layout: default
---

<!-- SLIDE 3 — How We Approached the Constraints -->

# How We Approached the Constraints

<div class="callout">
  "You know this hardware — here's how we prioritized."
</div>

<p class="section-label">We optimized for:</p>

- **Latency over reliability for audio** — drop a frame, don't freeze the call
- **Instant PTT feel** — no server round-trip before the mic opens
- **Stay under budget at every layer** — codec, field stripping, sessionId compression
- **Graceful degradation** — dual delivery survives expired NAT mappings
- **Designed for the real envelope** — 22 kbps is the ceiling; link degrades to ~900 bps. Architecture adapts: Opus 6 kbps on strong signal, Codec2 2.4 kbps below 2 bars

<p class="section-label" style="color: #F59E0B;">We consciously deferred:</p>

- <span class="warn">Binary framing</span>
- <span class="warn">Full AES-GCM</span>
- <span class="warn">iOS support</span>

<!-- 22kbps is the spec-sheet number. Judges know the real link performance varies. Call that out here — it shows you understand the hardware, not just the datasheet. -->

---
layout: two-cols
---

<!-- SLIDE 4 — Scope & What We Shipped -->

# Scope & What We Shipped

<h3 class="shipped">Shipped</h3>

- ✅ Half-duplex PTT over Iridium + cellular
- ✅ Talkgroup routing, membership, floor control
- ✅ Client-side GPS timestamp arbitration
- ✅ Text messaging + live moving map
- ✅ Web portal: device / talkgroup / key management
- ✅ Dual UDP+WebSocket with client deduplication

<p style="margin-top: 0.2rem; font-size: 0.82rem; color: #8FA3C7; font-weight: 600;">Bonus criteria also shipped:</p>

- ✅ Moving map
- ✅ Walk-on prevention
- ✅ Talkgroup switching

::right::

<h3 class="warn">Post-hackathon</h3>

- Binary wire format *(JSON overhead within budget now)*
- Full AES-GCM + KDF *(architecture done, implementation stubbed)*
- Distributed sync protocol *(designed, not implemented)*
- iOS build *(needs macOS toolchain)*

<!-- Be explicit that deferred items were deliberate decisions, not oversights. -->

---
layout: default
---

<!-- SLIDE 5 — System Architecture -->

# System Architecture

```mermaid
flowchart LR
  subgraph SiteA["Site A — Satellite"]
    PhoneA["📱 Phone A"] -->|WiFi| DLSA["DLS-140"]
  end
  subgraph SiteB["Site B — Satellite"]
    PhoneB["📱 Phone B"] -->|WiFi| DLSB["DLS-140"]
  end
  DLSA <-->|"Certus 22kbps"| Sat["🛰 Iridium"]
  DLSB <-->|"Certus 22kbps"| Sat
  Sat <-->|"Ground + Internet"| Relay["Relay (DO)"]
  PhoneC["📱 Phone C (Cellular)"] <-->|LTE| Relay
```

<div class="callout" style="margin-top: 0.5rem; font-size: 0.82rem;">
  <strong>CGN constraint:</strong> DLS-140 is outbound-only — it initiates the connection through carrier-grade NAT. The relay cannot dial in. Once the session is established, data flows both ways on that same connection. No direct device-to-device path exists.
</div>

<!-- Four relay roles: 1) Real-Time Relay — fan out PTT audio via WS+UDP. 2) Floor Control — server watchdog enforces half-duplex. 3) Operation Log — append-only admin op sequencing. 4) Sync Broker — cursor-based catch-up for reconnecting devices. -->

---
layout: default
---

<!-- SLIDE 6 — The Relay: Four Roles -->

# The Relay — Four Roles

<div class="callout" style="margin-bottom: 0.6rem;">
  DLS-140 is outbound-only (CGN). All traffic flows through the relay — no device-to-device possible.
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; min-width: 0;">
<div class="card" style="min-width: 0;">
<p style="color: var(--accent); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 0.25rem;">Real-Time Relay</p>
<p style="font-size: 0.85rem; margin: 0; color: var(--text-secondary);">Fan out PTT audio + control to talkgroup members via WebSocket + UDP simultaneously. In-memory only — no DB on the critical audio path.</p>
</div>
<div class="card" style="min-width: 0;">
<p style="color: var(--accent); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 0.25rem;">Floor Control</p>
<p style="font-size: 0.85rem; margin: 0; color: var(--text-secondary);">Server-authoritative half-duplex. Validates the floor holder, drops frames from non-holders, 65s watchdog auto-releases on crash or disconnect.</p>
</div>
<div class="card" style="min-width: 0;">
<p style="color: var(--accent); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 0.25rem;">Auth & Provisioning</p>
<p style="font-size: 0.85rem; margin: 0; color: var(--text-secondary);">JWT issued via REST (register / login). Role-based enforcement on every WebSocket message. Admin ops require signed messages — relay can't forge them.</p>
</div>
<div class="card" style="min-width: 0;">
<p style="color: var(--accent); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 0.25rem;">Op Log + Sync Broker</p>
<p style="font-size: 0.85rem; margin: 0; color: var(--text-secondary);">Append-only admin op log with monotonic sequence numbers. Cursor-based catch-up delivers missed ops to devices reconnecting after a handoff dropout.</p>
</div>
</div>

<!-- This answers "what does the relay actually do?" — 4 distinct roles, not just a dumb forwarder. Judges scoring Architecture (15%) will want to see this decomposition. -->

---
layout: default
---

<!-- SLIDE 6 — Floor Control -->

# Floor Control

<p style="color: #8FA3C7; font-size: 0.9rem; margin-bottom: 0.35rem;">
  <span class="tag">The hardest problem</span> who talks when, with 1500 ms RTT?
</p>

<div class="compare-row">
  <div class="compare-card danger">
    <p class="compare-card-label">What we did NOT do</p>
    <p>Server-grant model → 1–3 s dead air → broken UX</p>
  </div>
  <div class="compare-card success">
    <p class="compare-card-label">What we did</p>
    <p>Optimistic transmission + client-side deterministic arbitration</p>
  </div>
</div>

**Algorithm:**

1. User presses PTT → audio starts **immediately**
2. `PTT_START` broadcast to all talkgroup members
3. Each client runs the same algorithm independently:
   - Single `PTT_START` within window → that sender has floor
   - Two `PTT_START` within 50 ms → **lower GPS timestamp wins**; UUID as tiebreaker
4. Loser UI shows "floor taken", mic stops

<div class="callout">
  GNSS on DLS-140 is nanosecond-accurate + globally synced. Every receiver reaches the same conclusion independently. <span class="warn">Tradeoff: ~50 ms collision window. Instant PTT feel preserved.</span>
</div>

<!-- Server's watchdog role: if PTT_END never arrives (crash / disconnect), server forcibly releases the floor after a timeout so the channel doesn't stay locked. -->

---
layout: default
---

<!-- SLIDE 7 — Messaging Framework -->

# Why WebSocket + UDP

<div class="callout red">
  Iridium is store-and-forward — data arrives in bursts, not a continuous stream. TCP audio = voicemail, not radio.
</div>

<div class="compare-row">
  <div class="compare-card success">
    <p class="compare-card-label">UDP for audio</p>
    <ul style="font-size: 0.86rem; margin: 0.25rem 0 0; padding-left: 1.1rem;">
      <li>Independent datagrams bypass TCP buffering</li>
      <li>Opus FEC conceals packet loss</li>
      <li><code>INBAND_FEC=1</code> &nbsp;<code>PACKET_LOSS_PERC=20%</code></li>
    </ul>
  </div>
  <div class="compare-card info">
    <p class="compare-card-label">WebSocket for control</p>
    <ul style="font-size: 0.86rem; margin: 0.25rem 0 0; padding-left: 1.1rem;">
      <li><code>PTT_START</code> / <code>PTT_END</code> must be reliable</li>
      <li>Store-and-forward delay is fine for control</li>
    </ul>
  </div>
</div>

| Message | Transport |
|---|---|
| PTT_AUDIO | UDP + WebSocket (dual — client deduplicates by sessionId+chunk) |
| PTT_START / PTT_END | WebSocket |
| JOIN/LEAVE, TEXT | WebSocket |
| GPS_UPDATE | WebSocket |
| UDP_REGISTER | UDP only |

<!-- Dual delivery means the server relays audio over both UDP and WebSocket unconditionally. No satellite-mode gate. -->

---
layout: default
---

<!-- SLIDE 9 — Bandwidth Budget -->

# Bandwidth Budget

<p style="color: #8FA3C7; font-size: 0.9rem; margin-bottom: 0.5rem;">22 kbps is the ceiling — designed for the real operating envelope</p>

<div style="display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 1.5rem; align-items: start; margin-top: 0.25rem;">
<div style="min-width: 0;">

<h3 style="color: var(--info); font-size: 1.05rem; font-weight: 600; margin: 0 0 0.25rem;">Measured on hardware (Opus 6 kbps, 60ms frames)</h3>

| Layer | Bytes/frame |
|---|---|
| Raw Opus | 42 B |
| + Base64 | 56 B |
| + JSON framing | ~119 B total |

<div style="margin-top: 0.75rem;">
  <div class="metric">~15.9 kbps</div>
  <div class="metric-sub">72% of 22 kbps budget</div>
</div>

<p style="font-size: 0.78rem; color: #8FA3C7; margin-top: 0.5rem;">
  <code>sessionId</code> int vs UUID saves ~31 chars/packet. <code>PTT_AUDIO</code> omits talkgroup field — server routes via sessionId map seeded at PTT_START.
</p>

</div>
<div style="min-width: 0;">

<h3 style="color: var(--info); font-size: 1.05rem; font-weight: 600; margin: 0 0 0.25rem;">Adaptive by signal strength</h3>

| Signal | Codec | On-wire |
|---|---|---|
| > 3 bars | Opus 6 kbps | ~15.9 kbps |
| < 2 bars | Codec2 2.4 kbps | ~9.4 kbps |

<div class="callout" style="margin-top: 0.6rem;">
  Link degrades to ~900 bps in very poor conditions — text messaging always available when voice budget runs out.
</div>

</div>
</div>

<!-- Tradeoff: JSON + Base64 is within budget now so binary framing is deferred. Binary protocol post-hackathon would drop ~30B/packet and bring the Opus footprint to ~11kbps on the wire. -->

---
layout: default
---

<!-- SLIDE 9 — Mobile App: PTT & Core Flow -->

# Mobile App — Core Flow

<div class="screenshot-row">
  <div style="display: flex; flex-direction: column; flex: 1; align-items: center; gap: 0.4rem;">
    <div class="screenshot-placeholder">
      <!-- [INSERT SCREENSHOT: login.png] -->
      <span>Login</span>
    </div>
  </div>
  <div style="display: flex; flex-direction: column; flex: 1; align-items: center; gap: 0.4rem;">
    <div class="screenshot-placeholder">
      <!-- [INSERT SCREENSHOT: talkgroup-list.png] -->
      <span>Talkgroup List</span>
    </div>
  </div>
  <div style="display: flex; flex-direction: column; flex: 1; align-items: center; gap: 0.4rem;">
    <div class="screenshot-placeholder">
      <!-- [INSERT SCREENSHOT: ptt-screen.png] -->
      <span>PTT Screen</span>
    </div>
    <p style="font-size: 0.72rem; color: #8FA3C7; text-align: center; margin: 0; padding: 0 0.3rem;">
      Active speaker indicator. Floor status. Floor indicator updates before audio starts.
    </p>
  </div>
</div>

<!-- The PTT screen is the hero. Talk through each UI element: big push-to-talk button, speaker name, floor indicator, signal quality badge. This is 30% of the score — spend time here. -->

---
layout: default
---

<!-- SLIDE 10 — Mobile App: Map & Chat -->

# Mobile App — Map & Chat

<div class="screenshot-row">
  <div style="display: flex; flex-direction: column; flex: 1; align-items: center; gap: 0.4rem;">
    <div class="screenshot-placeholder" style="min-height: 260px;">
      <!-- [INSERT SCREENSHOT: moving-map.png] -->
      <span>Moving Map — live GPS pins, talkgroup-filtered</span>
    </div>
  </div>
  <div style="display: flex; flex-direction: column; flex: 1; align-items: center; gap: 0.4rem;">
    <div class="screenshot-placeholder" style="min-height: 260px;">
      <!-- [INSERT SCREENSHOT: text-chat.png] -->
      <span>Text Chat — per-talkgroup with timestamps</span>
    </div>
  </div>
</div>

<div class="callout green" style="margin-top: 0.75rem;">
  <strong>Moving map = Innovation bonus criteria (+15%).</strong> Call it out explicitly to the judges.
</div>

<!-- Name it as a bonus feature. Judges are scoring it explicitly. Say "this is one of the stated bonus criteria." -->

---
layout: default
---

<!-- SLIDE 11 — Web Admin Portal -->

# Web Admin Portal

<div class="screenshot-grid">
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <div class="screenshot-placeholder">
      <!-- [INSERT SCREENSHOT: portal-dashboard.png] -->
      <span>Dashboard</span>
    </div>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <div class="screenshot-placeholder">
      <!-- [INSERT SCREENSHOT: portal-talkgroups.png] -->
      <span>Talkgroup Management</span>
    </div>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <div class="screenshot-placeholder">
      <!-- [INSERT SCREENSHOT: portal-devices.png] -->
      <span>Device Management</span>
    </div>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <div class="screenshot-placeholder">
      <!-- [INSERT SCREENSHOT: portal-keys.png] -->
      <span>Key Rotation</span>
    </div>
  </div>
</div>

<!-- Web portal usability is explicitly in the UX rubric (30%). Walk through each screen: dashboard shows active devices and talkgroup membership at a glance; key rotation triggers ADMIN_ROTATE_KEY op which fans out to all members. -->

---
layout: center
---

<!-- SLIDE 13 — Q&A -->

<h1 style="font-size: 4.5rem; font-weight: 900; color: #F8FAFC; letter-spacing: -0.04em;">Q&A</h1>

<div style="margin-top: 1.5rem; display: flex; flex-wrap: wrap; justify-content: center; max-width: 680px; margin-left: auto; margin-right: auto;">
  <span class="tag">Floor Control</span>
  <span class="tag">UDP vs WebSocket</span>
  <span class="tag">Bandwidth Math</span>
  <span class="tag">Encryption</span>
  <span class="tag">P2P / Multicast</span>
  <span class="tag">Codec Choice</span>
</div>

<p style="font-size: 0.72rem; color: #8FA3C7; margin-top: 1.5rem; opacity: 0.7;">
  Slides 6, 7, and 9 available to pull back up &nbsp;·&nbsp; Tradeoffs summary in appendix
</p>

<!-- "Did you test over satellite?" is the most likely judge question. Answer: yes — we used the DLS-140 hardware during development. The store-and-forward behavior is the reason UDP was non-negotiable. That store-and-forward story is also the best answer to "what was the most surprising thing about building on Iridium Certus." -->

---
layout: default
---

<!-- APPENDIX — Design Tradeoffs -->

# Design Tradeoffs <span style="font-size: 1rem; font-weight: 400; color: var(--text-muted); margin-left: 0.5rem;">(Appendix)</span>

| Decision | Chose | Rejected | Why |
|---|---|---|---|
| Audio transport | UDP + Opus FEC | <span class="rejected">WebSocket only</span> | Iridium store-and-forward; TCP audio arrives in bursts |
| Floor control | Client-side GPS arbitration | <span class="rejected">Server-grant</span> | Server RTT = 1–3 s dead air |
| Audio codec | Opus 6 kbps · 42 B/frame measured | <span class="rejected">Higher bitrate</span> | Must fit 22 kbps; validated on hardware |
| Audio framing | JSON + Base64 | <span class="rejected">Binary protocol</span> | Within budget now; binary saves ~30B/packet post-hackathon |
| Encryption | AES-GCM architecture (stub impl) | <span class="rejected">No encryption</span> | Relay moves opaque blobs; crypto is a drop-in swap |
| Mobile platform | React Native Android | <span class="rejected">Native iOS</span> | macOS toolchain needed; team on Linux |

<!-- Pull this up during Q&A if asked for the at-a-glance summary. Each row has already been covered in detail during slides 7, 8, and 9. -->
