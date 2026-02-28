# Design Tradeoffs
## Floor Control: Optimistic vs Server-side Grant
Chose optimistic GPS timestamp arbitration. Avoids 1–3s round-trip at satellite latency.
## Relay Architecture: P2P vs Central Server
Chose central relay. Iridium NAT prevents direct P2P between DLS-140 units.
## Codec: Opus vs Codec2
Adaptive. Opus 8kbps default, Codec2 2400bps fallback when signal < 2 bars.
