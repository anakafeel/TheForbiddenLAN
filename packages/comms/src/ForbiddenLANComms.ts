// ForbiddenLANComms — main class consumed by the mobile app via useComms() hook
import { DLS140Client } from "./DLS140Client";
import { RelaySocket } from "./RelaySocket";
import { UdpSocket } from "./UdpSocket";
import { FloorControl } from "./FloorControl";
import { GPSPoller } from "./GPSPoller";
import { AudioPipeline } from "./AudioPipeline";
import type { SignalStatus, GPS, FloorStatus, RelayMessage } from "./types";

export interface ForbiddenLANConfig {
  relayUrl: string;
  dls140Url?: string;
  deviceId: string;
}

// Callback type for floor control events (used by mobile UI)
export type FloorDenyCallback = (talkgroup: string, holder: string) => void;

export class ForbiddenLANComms {
  private dls: DLS140Client;
  private relay: RelaySocket;
  private udp: UdpSocket;
  private floor: FloorControl;
  private gpsPoller: GPSPoller;
  private audio: AudioPipeline | null = null;
  private seq = 0;
  private activeTalkgroup = "";

  // Clock Drift Fix
  private serverTimeOffset = 0;

  // Half-Duplex Fix
  private isTransmitting = false;

  // PTT Watchdog
  private currentSessionId = 0;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly MAX_TX_MS = 60000;

  // Signal Polling
  private signalPollingTimer: (() => void) | null = null;

  // Floor Control — server-authoritative walk-on prevention
  private floorGranted = false; // true once server sends FLOOR_GRANT for our PTT
  private onFloorDeny: FloorDenyCallback | null = null;
  private remoteFloorHolder: string | null = null; // tracks who currently holds the floor

  constructor(private config: ForbiddenLANConfig) {
    this.dls = new DLS140Client(config.dls140Url);
    this.relay = new RelaySocket();
    this.udp = new UdpSocket();
    this.floor = new FloorControl();
    this.gpsPoller = new GPSPoller(this.dls, this.relay, config.deviceId);
  }

  async connect(
    jwt: string,
    dlsUser?: string,
    dlsPass?: string,
  ): Promise<void> {
    this.relay.connect(this.config.relayUrl, jwt);

    // Clock Drift Fix: initial sync ping
    this.relay.on("SYNC_TIME", (msg: RelayMessage) => {
      if (msg.type === "SYNC_TIME") {
        const syncMsg = msg as Extract<RelayMessage, { type: "SYNC_TIME" }>;
        if (syncMsg.serverTime !== undefined) {
          const rtt = Date.now() - syncMsg.clientTime;
          this.serverTimeOffset =
            syncMsg.serverTime - syncMsg.clientTime - rtt / 2;
          console.log(
            `[ForbiddenLANComms] Time offset synced: ${this.serverTimeOffset}ms`,
          );
        }
      }
    });

    this.relay.on("connect", () => {
      this.relay.send({ type: "SYNC_TIME", clientTime: Date.now() });

      // Also connect UDP socket (assume server port is 3000 for UDP based on ws port)
      const serverPort = this.config.relayUrl.match(/:(\d+)/)?.[1]
        ? parseInt(this.config.relayUrl.match(/:(\d+)/)![1], 10)
        : 3000;

      this.udp
        .connect(this.config.relayUrl, serverPort, this.config.deviceId)
        .catch((e) => {
          console.warn("[ForbiddenLANComms] Failed to connect UDP socket:", e);
        });
    });

    // ── Floor Control message handling ──────────────────────────────
    this.relay.on("FLOOR_GRANT", (msg: RelayMessage) => {
      if (msg.type === "FLOOR_GRANT") {
        const grantMsg = msg as Extract<RelayMessage, { type: "FLOOR_GRANT" }>;
        this.remoteFloorHolder = grantMsg.winner;
        this.floor.setFloor(
          grantMsg.talkgroup,
          grantMsg.winner,
          grantMsg.timestamp,
        );
        if (grantMsg.winner === this.config.deviceId) {
          this.floorGranted = true;
          console.log(
            `[ForbiddenLANComms] Floor GRANTED on ${grantMsg.talkgroup}`,
          );
        } else {
          console.log(
            `[ForbiddenLANComms] Floor held by ${grantMsg.winner} on ${grantMsg.talkgroup}`,
          );
        }
      }
    });

    this.relay.on("FLOOR_DENY", (msg: RelayMessage) => {
      if (msg.type === "FLOOR_DENY") {
        const denyMsg = msg as any;
        console.warn(
          `[ForbiddenLANComms] Floor DENIED on ${denyMsg.talkgroup} — held by ${denyMsg.holder}`,
        );
        // Auto-stop our PTT immediately — we can't transmit
        if (this.isTransmitting) {
          this._forceStopPTT();
        }
        if (this.onFloorDeny) {
          this.onFloorDeny(denyMsg.talkgroup, denyMsg.holder);
        }
      }
    });

    this.relay.on("FLOOR_RELEASED", (msg: RelayMessage) => {
      if (msg.type === "FLOOR_RELEASED") {
        const relMsg = msg as any;
        this.remoteFloorHolder = null;
        this.floor.release(relMsg.talkgroup);
        console.log(
          `[ForbiddenLANComms] Floor released on ${relMsg.talkgroup} (was ${relMsg.previousHolder})`,
        );
      }
    });

    if (dlsUser && dlsPass) {
      try {
        await this.dls.login(dlsUser, dlsPass);
        this.gpsPoller.start();
        const status = await this.dls.getStatus();
        if (status.cellularSignalStrength > 40) {
          await this.dls.setRoutingPreference("cellular");
        }
      } catch {
        console.warn(
          "[ForbiddenLANComms] DLS-140 not reachable — running on external network",
        );
      }
    }
  }

  joinTalkgroup(talkgroupId: string): void {
    this.activeTalkgroup = talkgroupId;
    // Server hub.ts routes on JOIN_TALKGROUP to add socket to the room Set.
    // PRESENCE is broadcast *by* the server, not consumed from clients.
    // Include sender (deviceId) so the server can bridge UDP registrations
    // with WebSocket connections for correct UDP audio relay.
    this.relay.send({ type: "JOIN_TALKGROUP", talkgroup: talkgroupId, sender: this.config.deviceId } as any);
  }

  startPTT(): void {
    if (!this.activeTalkgroup) return;
    // Check if someone else already holds the floor (client-side pre-check).
    // Server is the authority, but this avoids wasting a round-trip.
    if (
      this.remoteFloorHolder &&
      this.remoteFloorHolder !== this.config.deviceId
    ) {
      console.warn(
        `[ForbiddenLANComms] PTT blocked — floor held by ${this.remoteFloorHolder}`,
      );
      if (this.onFloorDeny) {
        this.onFloorDeny(this.activeTalkgroup, this.remoteFloorHolder);
      }
      return;
    }

    this.isTransmitting = true; // Half-Duplex trap fix
    this.floorGranted = false; // will be set true by FLOOR_GRANT from server
    const currentSeq = ++this.seq;
    const synchronizedTime = Date.now() + this.serverTimeOffset;
    // Generate a quick random sessionId for this PTT press
    const sessionId = Math.floor(Math.random() * 0xffffffff);
    this.currentSessionId = sessionId;
    console.log(
      `[comms] PTT_START sessionId: 0x${sessionId.toString(16).toUpperCase()} — share with server operator to verify relay routing`,
    );
    this.relay.send({
      type: "PTT_START",
      talkgroup: this.activeTalkgroup,
      sender: this.config.deviceId,
      sessionId,
      timestamp: synchronizedTime,
      seq: currentSeq,
    });
    // Start recording optimistically — if FLOOR_DENY arrives, _forceStopPTT() stops it.
    // This gives zero-latency PTT start while the server arbitrates.
    this.audio = new AudioPipeline(
      this.relay,
      this.udp,
      sessionId,
      this.activeTalkgroup,
      this.config.deviceId,
    );
    this.audio.startRecording();

    this.watchdogTimer = setTimeout(() => {
      console.warn(
        `[ForbiddenLANComms] Transmitting for > ${this.MAX_TX_MS}ms. Auto-stopping PTT.`,
      );
      this.stopPTT();
    }, this.MAX_TX_MS);
  }

  // React Native developers will call this from their audio recorder library
  async sendAudioChunk(base64OpusData: string): Promise<void> {
    if (!this.isTransmitting) {
      console.warn(
        "[ForbiddenLANComms] Ignored sendAudioChunk because PTT is not active",
      );
      return;
    }
    await this.audio?.enqueueChunk(base64OpusData);
  }

  stopPTT(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    this.audio?.stopRecording();
    this.audio = null;
    this.isTransmitting = false; // Half-Duplex trap fix
    this.floorGranted = false;
    if (this.activeTalkgroup) {
      const synchronizedTime = Date.now() + this.serverTimeOffset;
      this.relay.send({
        type: "PTT_END",
        talkgroup: this.activeTalkgroup,
        sender: this.config.deviceId,
        sessionId: this.currentSessionId,
        timestamp: synchronizedTime,
        seq: this.seq,
      });
    }
  }

  /**
   * Force-stop PTT when FLOOR_DENY is received from the server.
   * Stops recording and releases resources but does NOT send PTT_END
   * (the server already denied our request — there's nothing to end).
   */
  private _forceStopPTT(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.audio?.stopRecording();
    this.audio = null;
    this.isTransmitting = false;
    this.floorGranted = false;
    console.warn("[ForbiddenLANComms] PTT force-stopped due to FLOOR_DENY");
  }

  /**
   * Register a callback for floor denial events (walk-on prevention).
   * The mobile UI should use this to show "Channel Busy" feedback.
   */
  setOnFloorDeny(callback: FloorDenyCallback | null): void {
    this.onFloorDeny = callback;
  }

  /**
   * Check if the floor is free on the active talkgroup.
   * Returns true if no one holds the floor, false if channel is busy.
   */
  isFloorFree(talkgroup?: string): boolean {
    const tg = talkgroup || this.activeTalkgroup;
    return (
      !this.remoteFloorHolder || this.remoteFloorHolder === this.config.deviceId
    );
  }

  /**
   * Get the current floor holder device ID for a talkgroup.
   * Returns null if the floor is free.
   */
  getRemoteFloorHolder(): string | null {
    return this.remoteFloorHolder;
  }

  sendText(talkgroupId: string, text: string): void {
    this.relay.send({
      type: "TEXT_MSG",
      talkgroup: talkgroupId,
      sender: this.config.deviceId,
      text,
    });
  }

  setTransportMode(mode: "cellular" | "satcom"): void {
    // UDP is always enabled for audio — the mode flag now only controls
    // whether satellite visibility prediction is active (for NORAD UI).
    // Audio always goes over UDP on both cellular and SATCOM.
    AudioPipeline.useUdp = true;
    console.log(
      `[ForbiddenLANComms] Network mode set to ${mode.toUpperCase()} — audio always routes via UDP`,
    );
  }

  onMessage(handler: (msg: RelayMessage) => void): void {
    const internalHandler = (msg: RelayMessage) => {
      // Half-Duplex Strict Buffer Fix
      if (this.isTransmitting && msg.type === "PTT_AUDIO") {
        // Drop incoming audio while transmitting to avoid 22kbps saturation
        return;
      }
      handler(msg);
    };

    this.relay.on("*", internalHandler);
    this.udp.on("*", internalHandler);
  }

  // Bypass the half-duplex filter — use for loopback testing and signal monitoring.
  // Receives every relay message including echoed PTT_AUDIO while transmitting.
  onRawMessage(handler: (msg: RelayMessage) => void): void {
    this.relay.on("*", handler);
    this.udp.on("*", handler);
  }

  async getSignalStatus(): Promise<SignalStatus> {
    try {
      return await this.dls.toSignalStatus();
    } catch {
      return {
        certusDataBars: 0,
        cellularSignal: 0,
        activeLink: "none",
        certusDataUsedKB: 0,
      };
    }
  }

  getGPS(): GPS | null {
    return this.gpsPoller.getLastGPS();
  }

  startSignalPolling(
    intervalMs: number,
    onChange: (s: SignalStatus) => void,
  ): () => void {
    if (this.signalPollingTimer) {
      this.signalPollingTimer(); // clear existing
    }
    this.signalPollingTimer = this.dls.startSignalPolling(intervalMs, onChange);
    return this.signalPollingTimer;
  }

  getFloorStatus(talkgroup: string): FloorStatus {
    return this.floor.getFloor(talkgroup);
  }

  disconnect(): void {
    this.audio?.stopRecording();
    this.gpsPoller.stop();
    this.isTransmitting = false; // Half-Duplex fix: reset flag on disconnect
    this.floorGranted = false;
    this.remoteFloorHolder = null;
    if (this.signalPollingTimer) {
      this.signalPollingTimer();
      this.signalPollingTimer = null;
    }
    this.relay.disconnect();
    this.udp.disconnect();
  }
}
