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

  constructor(private config: ForbiddenLANConfig) {
    this.dls   = new DLS140Client(config.dls140Url);
    this.relay = new RelaySocket();
    this.floor = new FloorControl();
    this.gpsPoller = new GPSPoller(this.dls, this.relay, config.deviceId);
  }

  async connect(jwt: string, dlsUser?: string, dlsPass?: string): Promise<void> {
    this.relay.connect(this.config.relayUrl, jwt);
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
    const currentSeq = ++this.seq;
    this.relay.send({ type: 'PTT_START', talkgroup: this.activeTalkgroup, sender: this.config.deviceId, timestamp: Date.now(), seq: currentSeq });
    this.audio = new AudioPipeline(this.relay, this.activeTalkgroup, this.config.deviceId);
    this.audio.startRecording(currentSeq);
  }

  stopPTT(): void {
    this.audio?.stopRecording();
    this.audio = null;
    if (this.activeTalkgroup) {
      this.relay.send({ type: 'PTT_END', talkgroup: this.activeTalkgroup, sender: this.config.deviceId, timestamp: Date.now(), seq: this.seq });
    }
  }

  sendText(talkgroupId: string, text: string): void {
    this.relay.send({ type: 'TEXT_MSG', talkgroup: talkgroupId, sender: this.config.deviceId, text });
  }

  onMessage(handler: (msg: RelayMessage) => void): void {
    this.relay.on('*', handler);
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

  getFloorStatus(talkgroup: string): FloorStatus {
    return this.floor.getFloor(talkgroup);
  }

  disconnect(): void {
    this.audio?.stopRecording();
    this.gpsPoller.stop();
    this.relay.disconnect();
  }
}
