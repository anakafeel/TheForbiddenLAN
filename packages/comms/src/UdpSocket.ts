import dgram from 'react-native-udp';
import { Buffer } from 'buffer';
import type { RelayMessage } from './types';

export class UdpSocket {
  private socket: any = null;
  private host = '';
  private port = 3000;
  private handlers: Map<string, ((msg: RelayMessage) => void)[]> = new Map();
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  connect(url: string, port: number, userId: string): Promise<void> {
    // Parse the host out of standard URLs (ws://192.168.1.1:3000/ws -> 192.168.1.1)
    // Strip scheme, then path, then port — order matters because :/port comes before /path
    this.host = url.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
    this.port = port;

    return new Promise((resolve, reject) => {
      try {
        this.socket = dgram.createSocket({ type: 'udp4' });
        
        this.socket.on('message', (msgData: any, rinfo: any) => {
          try {
            // msgData from react-native-udp is typically a string or Buffer
            const str = msgData.toString ? msgData.toString() : String(msgData);
            const msg = JSON.parse(str) as RelayMessage;
            this.emit(msg.type, msg);
            this.emit('*', msg);
          } catch { /* ignore malformed messages */ }
        });

        this.socket.on('error', (err: any) => {
          console.warn('[UdpSocket] error:', err);
        });

        // Bind to a random ephemeral port
        this.socket.bind(0, (err: any) => {
          if (err) return reject(err);
          
          this.register(userId);
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  private register(userId: string) {
    const registerMsg = { type: 'UDP_REGISTER', userId };
    this.send(registerMsg);
    
    // Send keep-alive every 25s to keep NAT port mapping open on the SATCOM link
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = setInterval(() => {
      this.send(registerMsg);
    }, 25000);
  }

  send(msg: object): void {
    if (!this.socket) return;
    
    const str = JSON.stringify(msg);
    const buf = Buffer.from(str);
    
    this.socket.send(buf, 0, buf.length, this.port, this.host, (err: any) => {
      if (err) {
        console.warn('[UdpSocket] TX error:', err);
      }
    });
  }

  on(event: string, handler: (msg: RelayMessage) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  protected emit(event: string, msg: RelayMessage): void {
    this.handlers.get(event)?.forEach(h => h(msg));
  }

  disconnect(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
