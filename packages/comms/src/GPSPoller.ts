// GPSPoller — polls DLS-140 GPS every 10 s and broadcasts GPS_UPDATE to the relay
import type { DLS140Client } from './DLS140Client';
import type { RelaySocket } from './RelaySocket';
import type { GPS } from './types';

export class GPSPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastGPS: GPS | null = null;

  constructor(
    private dls: DLS140Client,
    private relay: RelaySocket,
    private deviceId: string,
    private intervalMs = 10_000,
  ) {}

  start(): void {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  getLastGPS(): GPS | null {
    return this.lastGPS;
  }

  private async poll(): Promise<void> {
    try {
      const raw = await this.dls.getGPS();
      if (!raw || raw.mode < 2) return;
      const gps: GPS = {
        lat: raw.latitude ?? 0,
        lng: raw.longitude ?? 0,
        alt: raw.altitude ?? 0,
        mode: raw.mode,
      };
      this.lastGPS = gps;
      this.relay.send({ type: 'GPS_UPDATE', device: this.deviceId, ...gps });
    } catch { /* DLS-140 not reachable */ }
  }
}
