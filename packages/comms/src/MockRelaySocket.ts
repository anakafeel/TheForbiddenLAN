// MockRelaySocket — simulates the DigitalOcean relay for local development
import { RelaySocket } from './RelaySocket';
import type { RelayMessage } from './types';

export class MockRelaySocket extends RelaySocket {
  private isConnected = false;

  override connect(url: string, jwt: string): void {
    console.log(`[MockRelaySocket] Connecting to mock server at ${url} with token ${jwt}`);
    this.isConnected = true;
    setTimeout(() => {
      this.emit('connect', { type: 'PRESENCE' } as unknown as RelayMessage);
    }, 100);
  }

  override send(msg: RelayMessage): void {
    if (!this.isConnected) return;
    
    // Simulate server processing and RTT latency (50ms)
    setTimeout(() => {
      if (msg.type === 'SYNC_TIME') {
        const syncMsg = msg as Extract<RelayMessage, { type: 'SYNC_TIME' }>;
        // Echo back with a mock server time
        this.emit('SYNC_TIME', { 
          type: 'SYNC_TIME', 
          clientTime: syncMsg.clientTime, 
          serverTime: Date.now() + 500 // simulate 500ms difference
        } as RelayMessage);
      } else {
        // Echo all other messages back to test local loopback listeners
        this.emit(msg.type, msg);
        this.emit('*', msg);
      }
    }, 50);
  }

  override on(event: string, handler: (msg: RelayMessage) => void): void {
    super.on(event, handler);
  }

  override off(event: string, handler: (msg: RelayMessage) => void): void {
    super.off(event, handler);
  }

  override disconnect(): void {
    this.isConnected = false;
  }
}
