// GPSPoller — polls DLS-140 GPS every N seconds, emits GPS_UPDATE to relay
import type { GPS, GPSUpdate } from './types';
import type { DLS140Client } from './DLS140Client';
import type { RelaySocket } from './RelaySocket';

export class GPSPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastGPS: GPS | null = null;

  constructor(
    private dls: DLS140Client,
    private relay: RelaySocket,
    private deviceId: string,
    private intervalMs = 30_000,
  ) {}

  start(): void {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getLastGPS(): GPS | null {
    return this.lastGPS;
  }

  private async poll(): Promise<void> {
    try {
      const raw = await this.dls.getGPS();
      if (raw.mode < 2 || raw.latitude == null) return;  // no fix
      this.lastGPS = { lat: raw.latitude, lng: raw.longitude!, alt: raw.altitude ?? 0, mode: raw.mode };
      const msg: GPSUpdate = {
        type: 'GPS_UPDATE',
        device: this.deviceId,
        lat: this.lastGPS.lat,
        lng: this.lastGPS.lng,
        alt: this.lastGPS.alt,
      };
      this.relay.send(msg);
    } catch (e) {
      console.warn('[GPSPoller] failed to poll GPS', e);
    }
  }
}
