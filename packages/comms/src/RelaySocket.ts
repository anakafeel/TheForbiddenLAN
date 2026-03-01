// RelaySocket — WebSocket client wrapper for the ForbiddenLAN relay server
import WebSocket from 'ws';
import type { RelayMessage } from './types';

export class RelaySocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, ((msg: RelayMessage) => void)[]> = new Map();

  connect(url: string, jwt: string): void {
    this.ws = new WebSocket(url, { headers: { Authorization: `Bearer ${jwt}` } });
    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as RelayMessage;
        this.emit(msg.type, msg);
        this.emit('*', msg);
      } catch { /* ignore malformed messages */ }
    });
    this.ws.on('error', (err) => {
      console.warn('[RelaySocket] error', err.message);
    });
  }

  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(event: string, handler: (msg: RelayMessage) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  private emit(event: string, msg: RelayMessage): void {
    this.handlers.get(event)?.forEach(h => h(msg));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
