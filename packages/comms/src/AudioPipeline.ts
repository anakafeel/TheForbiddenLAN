// AudioPipeline — handles sequencing and sending external Opus chunks over the relay.
// Sends minimal AudioChunk messages (type + sessionId + chunk + data only) to
// minimise per-packet JSON overhead on the 22kbps satellite uplink.
// talkgroup routing and timestamp context live on PTT_START, not on every chunk.
//
// FEC: Groups 4 chunks + 1 parity (XOR) = 20% overhead, recovers 1 lost chunk per block.
import type { RelaySocket } from './RelaySocket';
import type { UdpSocket } from './UdpSocket';
import type { Encryption } from './Encryption';

const FEC_GROUP_SIZE = 4; // 4 data + 1 parity = 5 chunks per group (20% overhead)

function xorBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(Math.max(a.length, b.length));
  for (let i = 0; i < result.length; i++) {
    result[i] = (i < a.length ? a[i] : 0) ^ (i < b.length ? b[i] : 0);
  }
  return result;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class AudioPipeline {
  private chunk = 0;
  private isRecording = false;
  private fecBuffer: string[] = []; // holds base64 chunks waiting for FEC group

  // Mode toggle (set by UI via comms.setTransportMode)
  public static useUdp = true;

  constructor(
    private relay: RelaySocket,
    private udp: UdpSocket,
    private sessionId: number,
    private talkgroup: string,
    private deviceId: string,
    private encryption?: Encryption
  ) {}

  startRecording(): void {
    this.isRecording = true;
    this.chunk = 0;
    this.fecBuffer = [];
  }

  // Mobile app (React Native) calls this with base64-encoded Opus frames
  async enqueueChunk(base64OpusData: string): Promise<void> {
    if (!this.isRecording) return;

    const payload = this.encryption
      ? await this.encryption.encrypt(base64OpusData)
      : base64OpusData;

    // Add to FEC buffer
    this.fecBuffer.push(payload);

    // When we have enough chunks, send FEC group
    if (this.fecBuffer.length >= FEC_GROUP_SIZE) {
      await this.sendFecGroup();
    }
  }

  private async sendFecGroup(): Promise<void> {
    if (this.fecBuffer.length < FEC_GROUP_SIZE) return;

    // Take first 4 chunks
    const group = this.fecBuffer.slice(0, FEC_GROUP_SIZE);
    this.fecBuffer = this.fecBuffer.slice(FEC_GROUP_SIZE);

    // Generate parity (XOR of all 4)
    const uint8Chunks = group.map(base64ToUint8Array);
    let parity = new Uint8Array(0);
    for (const chunk of uint8Chunks) {
      parity = xorBuffers(parity, chunk);
    }
    const parityBase64 = uint8ArrayToBase64(parity);

    const startChunk = this.chunk;

    // Send all 4 data chunks + 1 parity
    for (let i = 0; i < FEC_GROUP_SIZE; i++) {
      const msg = {
        type: 'PTT_AUDIO',
        talkgroup: this.talkgroup,
        sessionId: this.sessionId,
        sender: this.deviceId,
        chunk: this.chunk++,
        fecGroup: startChunk, // marks which FEC group this belongs to
        fecIndex: i, // 0-3 = data, 4 = parity
        data: group[i],
      };
      this.sendMsg(msg, i === 0);
    }

    // Send parity chunk as index 4
    const parityMsg = {
      type: 'PTT_AUDIO',
      talkgroup: this.talkgroup,
      sessionId: this.sessionId,
      sender: this.deviceId,
      chunk: this.chunk++,
      fecGroup: startChunk,
      fecIndex: 4, // parity
      data: parityBase64,
    };
    this.sendMsg(parityMsg, false);
  }

  private sendMsg(msg: any, isFirst: boolean): void {
    if (AudioPipeline.useUdp) {
      if (isFirst || msg.fecIndex === 4) {
        console.log(`[AudioPipeline] TX chunk #${msg.chunk} (fecIndex=${msg.fecIndex}) via UDP`);
      }
      this.udp.send(msg);
    } else {
      this.relay.send(msg);
    }
  }

  stopRecording(): void {
    // Send any remaining chunks without FEC (they'll be incomplete)
    if (this.fecBuffer.length > 0) {
      const remaining = [...this.fecBuffer];
      this.fecBuffer = [];
      for (const payload of remaining) {
        const msg = {
          type: 'PTT_AUDIO',
          talkgroup: this.talkgroup,
          sessionId: this.sessionId,
          sender: this.deviceId,
          chunk: this.chunk++,
          data: payload,
        };
        this.sendMsg(msg, false);
      }
    }
    this.isRecording = false;
  }

  static async decryptChunk(base64: string, enc: Encryption): Promise<string> {
    return enc.decrypt(base64);
  }
}
