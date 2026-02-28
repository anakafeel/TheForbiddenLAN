// DLS140Client — typed wrapper around the DLS-140 local REST API (runs on device WiFi LAN)
import type { DLS140Status, DLS140GPS, SignalStatus } from './types';

export class DLS140Client {
  private jwt = '';
  private base: string;

  constructor(base = 'http://192.168.1.1') {
    this.base = base;
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.jwt}`,
    };
  }

  async login(username: string, password: string): Promise<void> {
    const res = await fetch(`${this.base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error('DLS-140 login failed');
    const data = await res.json();
    this.jwt = data.jwt;
  }

  async getStatus(): Promise<DLS140Status> {
    const res = await fetch(`${this.base}/device/status`, { headers: this.headers });
    return res.json();
  }

  async getGPS(): Promise<DLS140GPS> {
    const res = await fetch(`${this.base}/location/gps`, { headers: this.headers });
    return res.json();
  }

  async getDataUsage(period: '24h' | '7d' | 'all' = '24h') {
    const res = await fetch(`${this.base}/device/data-usage?period=${period}`, { headers: this.headers });
    return res.json();
  }

  async setRoutingPreference(prefer: 'cellular' | 'satellite'): Promise<void> {
    await fetch(`${this.base}/network/routing`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ prefer }),
    });
  }

  async ping(ip: string, iface: 'sat' | 'cell' | 'any' = 'any') {
    const res = await fetch(`${this.base}/diagnostics/ping`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ ip, count: 4, interface: iface }),
    });
    return res.json();
  }

  async toSignalStatus(): Promise<SignalStatus> {
    const [status, usage] = await Promise.all([
      this.getStatus(),
      this.getDataUsage('24h'),
    ]);
    const activeLink: SignalStatus['activeLink'] =
      status.cellularSignalStrength > 40 ? 'cellular'
      : status.certusDataBars > 0 ? 'satellite'
      : 'none';
    return {
      certusSignalBars: status.certusDataBars,
      cellularSignal: status.cellularSignalStrength,
      activeLink,
      certusDataUsedKB: usage?.certus?.txusage ?? 0,
    };
  }
}
