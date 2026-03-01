// RelaySocket — WebSocket client wrapper for the ForbiddenLAN relay server
import WebSocket from 'ws';
import type { RelayMessage } from './types';

export class RelaySocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, ((msg: RelayMessage) => void)[]> = new Map();

  private url = '';
  private jwt = '';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  connect(url: string, jwt: string): void {
    this.url = url;
    this.jwt = jwt;
    this.reconnectAttempts = 0;
    this.establishConnection();
  }

  private establishConnection(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const wsUrl = this.url.includes('?') ? `${this.url}&token=${this.jwt}` : `${this.url}?token=${this.jwt}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as RelayMessage;
        this.emit(msg.type, msg);
        this.emit('*', msg);
      } catch { /* ignore malformed messages */ }
    });
    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.emit('connect', { type: 'PRESENCE' } as unknown as RelayMessage); // Using a dummy cast to satisfy the internal emit signature for the 'connect' string
      
      // Periodic resync
      if (this.syncTimer) clearInterval(this.syncTimer);
      this.syncTimer = setInterval(() => {
        this.send({ type: 'SYNC_TIME', clientTime: Date.now() });
      }, 60000); // Resync every 60s
    });

    this.ws.on('close', () => {
      this.handleReconnect();
    });

    this.ws.on('error', (err) => {
      console.warn('[RelaySocket] error', err.message);
      this.handleReconnect();
    });
  }

  private handleReconnect(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    
    // Max 5 attempts
    if (this.reconnectAttempts >= 5) {
      console.error('[RelaySocket] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[RelaySocket] Reconnecting in ${backoffMs}ms...`);
    
    this.reconnectTimer = setTimeout(() => {
      this.establishConnection();
    }, backoffMs);
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

  off(event: string, handler: (msg: RelayMessage) => void): void {
    const list = this.handlers.get(event);
    if (list) {
      this.handlers.set(event, list.filter(h => h !== handler));
    }
  }

  protected emit(event: string, msg: RelayMessage): void {
    this.handlers.get(event)?.forEach(h => h(msg));
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.reconnectAttempts = 0;
    this.ws?.close();
    this.ws = null;
  }
}
