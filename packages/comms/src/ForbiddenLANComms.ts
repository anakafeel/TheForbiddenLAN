// ForbiddenLANComms — main class consumed by the mobile app via useComms() hook
import { DLS140Client } from './DLS140Client';
import { RelaySocket } from './RelaySocket';
import { FloorControl } from './FloorControl';
import { GPSPoller } from './GPSPoller';
import { AudioPipeline } from './AudioPipeline';
import type { SignalStatus, GPS, FloorStatus, RelayMessage } from './types';

export interface ForbiddenLANConfig {
  relayUrl: string;
  dls140Url?: string;
  deviceId: string;
}

export class ForbiddenLANComms {
  private dls: DLS140Client;
  private relay: RelaySocket;
  private floor: FloorControl;
  private gpsPoller: GPSPoller;
  private audio: AudioPipeline | null = null;
  private seq = 0;
  private activeTalkgroup = '';

  // Clock Drift Fix
  private serverTimeOffset = 0;

  // Half-Duplex Fix
  private isTransmitting = false;

  // Signal Polling
  private signalPollingTimer: (() => void) | null = null;

  constructor(private config: ForbiddenLANConfig) {
    this.dls   = new DLS140Client(config.dls140Url);
    this.relay = new RelaySocket();
    this.floor = new FloorControl();
    this.gpsPoller = new GPSPoller(this.dls, this.relay, config.deviceId);
  }

  async connect(jwt: string, dlsUser?: string, dlsPass?: string): Promise<void> {
    this.relay.connect(this.config.relayUrl, jwt);

    // Clock Drift Fix: initial sync ping
    this.relay.on('SYNC_TIME', (msg: RelayMessage) => {
      if (msg.type === 'SYNC_TIME') {
        const syncMsg = msg as Extract<RelayMessage, { type: 'SYNC_TIME' }>;
        if (syncMsg.serverTime !== undefined) {
          const rtt = Date.now() - syncMsg.clientTime;
          this.serverTimeOffset = syncMsg.serverTime - syncMsg.clientTime - (rtt / 2);
          console.log(`[ForbiddenLANComms] Time offset synced: ${this.serverTimeOffset}ms`);
        }
      }
    });

    this.relay.on('connect', () => {
       this.relay.send({ type: 'SYNC_TIME', clientTime: Date.now() });
    });

    if (dlsUser && dlsPass) {
      try {
        await this.dls.login(dlsUser, dlsPass);
        this.gpsPoller.start();
        const status = await this.dls.getStatus();
        if (status.cellularSignalStrength > 40) {
          await this.dls.setRoutingPreference('cellular');
        }
      } catch {
        console.warn('[ForbiddenLANComms] DLS-140 not reachable — running on external network');
      }
    }
  }

  joinTalkgroup(talkgroupId: string): void {
    this.activeTalkgroup = talkgroupId;
    this.relay.send({ type: 'PRESENCE', talkgroup: talkgroupId, online: [this.config.deviceId], sender: this.config.deviceId, timestamp: Date.now(), seq: 0 });
  }

  startPTT(): void {
    if (!this.activeTalkgroup) return;
    this.isTransmitting = true; // Half-Duplex trap fix
    const currentSeq = ++this.seq;
    const synchronizedTime = Date.now() + this.serverTimeOffset;
    // Generate a quick random sessionId for this PTT press
    const sessionId = Math.floor(Math.random() * 0xFFFFFFFF);
    this.relay.send({ type: 'PTT_START', talkgroup: this.activeTalkgroup, sender: this.config.deviceId, sessionId, timestamp: synchronizedTime, seq: currentSeq });
    this.audio = new AudioPipeline(
      this.relay,
      this.activeTalkgroup,
      this.config.deviceId,
      sessionId,
      () => Date.now() + this.serverTimeOffset,
    );
    this.audio.startRecording(currentSeq);
  }

  stopPTT(): void {
    this.audio?.stopRecording();
    this.audio = null;
    this.isTransmitting = false; // Half-Duplex trap fix
    if (this.activeTalkgroup) {
      const synchronizedTime = Date.now() + this.serverTimeOffset;
      this.relay.send({ type: 'PTT_END', talkgroup: this.activeTalkgroup, sender: this.config.deviceId, timestamp: synchronizedTime, seq: this.seq });
    }
  }

  sendText(talkgroupId: string, text: string): void {
    this.relay.send({ type: 'TEXT_MSG', talkgroup: talkgroupId, sender: this.config.deviceId, text });
  }

  onMessage(handler: (msg: RelayMessage) => void): void {
    this.relay.on('*', (msg: RelayMessage) => {
      // Half-Duplex Strict Buffer Fix
      if (this.isTransmitting && msg.type === 'PTT_AUDIO') {
        // Drop incoming audio while transmitting to avoid 22kbps saturation
        return;
      }
      handler(msg);
    });
  }

  async getSignalStatus(): Promise<SignalStatus> {
    try {
      return await this.dls.toSignalStatus();
    } catch {
      return { certusSignalBars: 0, cellularSignal: 0, activeLink: 'none', certusDataUsedKB: 0 };
    }
  }

  getGPS(): GPS | null {
    return this.gpsPoller.getLastGPS();
  }

  startSignalPolling(intervalMs: number, onChange: (s: SignalStatus) => void): () => void {
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
    if (this.signalPollingTimer) {
      this.signalPollingTimer();
      this.signalPollingTimer = null;
    }
    this.relay.disconnect();
  }
}
