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
- ✅ AES-GCM encryption + KDF key derivation per talkgroup

<p style="margin-top: 0.2rem; font-size: 0.82rem; color: #8FA3C7; font-weight: 600;">Bonus criteria also shipped:</p>

- ✅ Moving map
- ✅ Walk-on prevention
- ✅ Talkgroup switching

::right::

<h3 class="warn">Post-hackathon</h3>

- Binary wire format *(JSON overhead within budget now)*
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
  Sat <-->|"Ground + Internet"| Relay["Relay (DigitalOcean)"]
  PhoneC["📱 Device C (Admin only)"] <-->|LTE| Relay
```

<div class="callout" style="margin-top: 0.5rem; font-size: 0.82rem;">
  <strong>CGN constraint:</strong> DLS-140 is outbound-only — it initiates the connection through carrier-grade NAT. The relay cannot dial in. Once the session is established, data flows both ways on that same connection. No direct device-to-device path exists.
</div>

<!-- Four relay roles: 1) Real-Time Relay — fan out PTT audio via WS+UDP. 2) Floor Control — server watchdog enforces half-duplex. 3) Operation Log — append-only admin op sequencing. 4) Sync Broker — cursor-based catch-up for reconnecting devices. -->

---
layout: default
---

<!-- SLIDE 6b — Key Management -->

# Key Management — Derived, Not Distributed

<p style="color: #8FA3C7; font-size: 0.85rem; margin-bottom: 0.4rem;">Rotating a key costs 1 integer over SATCOM. Deactivated devices can't fetch the new counter — they can't derive the new group key.</p>

<div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 1.2rem; align-items: start;">
<div style="zoom: 0.9; min-width: 0;">

```mermaid
flowchart TB
  Admin["🔑 Admin"] -->|"deactivate + POST /keys/rotate"| Server["Relay"]
  Server -->|"counter++ (1 int)"| A["📱 Member A"]
  Server -->|"counter++ (1 int)"| B["📱 Member B"]
  Server -. "deactivated — no delivery" .-> R["📵 Revoked Device"]
  A --> KA["KDF → new AES key"]
  B --> KB["KDF → new AES key"]
  R --> X["old key — locked out"]
```

</div>
<div style="min-width: 0; display: flex; flex-direction: column; gap: 0.5rem;">
<div class="card">
<p style="color: var(--accent); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; margin: 0 0 0.15rem;">Add member</p>
<p style="font-size: 0.75rem; margin: 0; color: var(--text-secondary);">Send <code>master_secret</code> + current counter over TLS — 1 message</p>
</div>
<div class="card">
<p style="color: var(--accent); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; margin: 0 0 0.15rem;">Rotate keys</p>
<p style="font-size: 0.75rem; margin: 0; color: var(--text-secondary);">Increment counter — <strong>1 integer, no key material</strong></p>
</div>
<div class="card">
<p style="color: var(--accent); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; margin: 0 0 0.15rem;">Remove member</p>
<p style="font-size: 0.75rem; margin: 0; color: var(--text-secondary);">Deactivate + rotate — revoked device can't fetch new counter → locked out</p>
</div>
</div>
</div>

---
layout: default
---

<!-- SLIDE 6 — Floor Control -->

# Floor Control

<p style="color: #8FA3C7; font-size: 0.9rem; margin-bottom: 0.3rem;">
  <span class="tag">The hardest problem</span> who talks when, with 1500 ms RTT?
</p>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; align-items: start;">
<div style="min-width: 0; overflow: hidden;">

<div class="compare-row">
  <div class="compare-card danger">
    <p class="compare-card-label">Server-only grant (rejected)</p>
    <p>Wait for round-trip before transmitting → 1–3 s dead air → broken UX</p>
  </div>
  <div class="compare-card success">
    <p class="compare-card-label">Two-layer: optimistic + authoritative</p>
    <p>Client pre-checks locally so PTT feels instant. Server is the hard enforcer.</p>
  </div>
</div>

- **Layer 1 — `FloorControl.ts`:** Optimistic check on press → TX starts immediately. 50 ms window; lowest timestamp wins, UUID tiebreak.
- **Layer 2 — `hub.ts`:** `FLOOR_GRANT` or `FLOOR_DENY` on `PTT_START`. `PTT_AUDIO` from non-holder is hard-dropped.

</div>
<div style="zoom: 0.62; min-width: 0; overflow: hidden;">

```mermaid
sequenceDiagram
  participant App as 📱 App
  participant Srv as Server
  Note over App: FloorControl.ts — optimistic (50ms window)
  App--)Srv: PTT_START + PTT_AUDIO stream
  alt floor free
    Srv->>App: FLOOR_GRANT
    Srv->>App: relay audio to peers
  else floor taken
    Srv->>App: FLOOR_DENY (overrides client)
    Note over Srv: PTT_AUDIO hard-dropped
  end
```

</div>
</div>

<div class="callout" style="margin-top: 0.4rem; font-size: 0.8rem;">Watchdog: floor auto-releases after 65 s if <code>PTT_END</code> never arrives.</div>

---
layout: default
---

<!-- SLIDE — The Relay: Fan-Out -->

# The Relay — Fan-Out

<p style="color: #8FA3C7; font-size: 0.9rem; margin-bottom: 0.5rem;">Every PTT_AUDIO packet is relayed to all talkgroup members — no device-to-device path exists</p>

```mermaid
flowchart TB
  Sender["📱 Sender"] -->|PTT_AUDIO| Relay["Relay"]
  Relay -->|WS + UDP| RxA["📱 Member A"]
  Relay -->|WS + UDP| RxB["📱 Member B"]
  Relay -->|WS + UDP| RxC["📱 Member C"]
```

<p style="color: #8FA3C7; font-size: 0.78rem; margin-top: 0.4rem; line-height: 1.5;">Both transports unconditionally — not gated on satellite mode. Clients deduplicate by <code>sessionId + chunk</code>. Floor control validates the sender before relaying.</p>

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

<!-- SLIDE 9 — Mobile App -->

# Mobile App

<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <img src="/login.png" style="width: 100%; border-radius: 0.4rem; border: 1px solid #1E2D4A;" />
    <p style="font-size: 0.7rem; color: #8FA3C7; text-align: center; margin: 0;">Unified auth · admin role auto-detected · device registration</p>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <div class="screenshot-placeholder">
      <!-- [INSERT SCREENSHOT: home.png] -->
      <span>Home</span>
    </div>
    <p style="font-size: 0.7rem; color: #8FA3C7; text-align: center; margin: 0;">Active users · signal strength · notifications feed</p>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <div class="screenshot-placeholder">
      <!-- [INSERT SCREENSHOT: channels.png] -->
      <span>Channels</span>
    </div>
    <p style="font-size: 0.7rem; color: #8FA3C7; text-align: center; margin: 0;">Browse talkgroups · inline PTT · live indicator · member count</p>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <div class="screenshot-placeholder">
      <!-- [INSERT SCREENSHOT: ptt-screen.png] -->
      <span>PTT</span>
    </div>
    <p style="font-size: 0.7rem; color: #8FA3C7; text-align: center; margin: 0;">Large button · orbit visualization · floor status · satellite visibility</p>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <div class="screenshot-placeholder">
      <!-- [INSERT SCREENSHOT: profile.png] -->
      <span>Profile</span>
    </div>
    <p style="font-size: 0.7rem; color: #8FA3C7; text-align: center; margin: 0;">Callsign · display name · preferred link · session info</p>
  </div>
</div>

<div class="callout green" style="margin-top: 0.6rem; font-size: 0.8rem;">
  <strong>Moving map is an explicitly scored bonus criterion.</strong> Call it out during the demo.
</div>

<!-- PTT screen is the hero. Orbit visualization shows who's in the talkgroup at a glance. Floor status updates before audio starts — client-side arbitration means zero dead air on press. -->

---
layout: default
---

<!-- SLIDE 11 — Web Admin Portal -->

# Web Admin Portal

<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <img src="/admin_dashboard.png" style="width: 100%; border-radius: 0.4rem; border: 1px solid #1E2D4A;" />
    <p style="font-size: 0.7rem; color: #8FA3C7; text-align: center; margin: 0;">Devices online · active talkgroups · device status table</p>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <img src="/create_talkgroup.png" style="width: 100%; border-radius: 0.4rem; border: 1px solid #1E2D4A;" />
    <p style="font-size: 0.7rem; color: #8FA3C7; text-align: center; margin: 0;">Create · manage members · trigger key rotation</p>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <img src="/create_user.png" style="width: 100%; border-radius: 0.4rem; border: 1px solid #1E2D4A;" />
    <p style="font-size: 0.7rem; color: #8FA3C7; text-align: center; margin: 0;">Register · assign role · remove</p>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <img src="/live_map.png" style="width: 100%; border-radius: 0.4rem; border: 1px solid #1E2D4A;" />
    <p style="font-size: 0.7rem; color: #8FA3C7; text-align: center; margin: 0;">Live device GPS · active/inactive status · auto-refresh</p>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
    <img src="/live_monitoring.png" style="width: 100%; border-radius: 0.4rem; border: 1px solid #1E2D4A;" />
    <p style="font-size: 0.7rem; color: #8FA3C7; text-align: center; margin: 0;">Connected sockets · relay metrics · live logs · floor holders</p>
  </div>
</div>

<!-- Web portal usability is in the UX rubric (30%). Key rotation lives in Talkgroups — triggering it fans out the new counter to all active members. -->


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
| Encryption | AES-GCM + KDF per talkgroup | <span class="rejected">No encryption</span> | Relay moves opaque blobs; rotation costs 1 integer over SATCOM |
| Mobile platform | React Native Android | <span class="rejected">Native iOS</span> | macOS toolchain needed; team on Linux |

<!-- Pull this up during Q&A if asked for the at-a-glance summary. Each row has already been covered in detail during slides 7, 8, and 9. -->
