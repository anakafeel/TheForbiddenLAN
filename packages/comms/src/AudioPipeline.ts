// AudioPipeline — handles sequencing and sending external Opus chunks over the relay.
// Sends minimal AudioChunk messages (type + sessionId + chunk + data only) to
// minimise per-packet JSON overhead on the 22kbps satellite uplink.
// talkgroup routing and timestamp context live on PTT_START, not on every chunk.
import type { RelaySocket } from './RelaySocket';
import type { UdpSocket } from './UdpSocket';
import type { Encryption } from './Encryption';

export class AudioPipeline {
  private chunk = 0;
  private isRecording = false;

  // Mode toggle (set by UI via comms.setTransportMode)
  public static useUdp = false;

  constructor(
    private relay: RelaySocket,
    private udp: UdpSocket,
    private sessionId: number,
    private talkgroup: string,
    private encryption?: Encryption
  ) {}

  startRecording(): void {
    this.isRecording = true;
    this.chunk = 0;
  }

  // Mobile app (React Native) calls this with base64-encoded Opus frames
  async enqueueChunk(base64OpusData: string): Promise<void> {
    if (!this.isRecording) return;

    const payload = this.encryption
      ? await this.encryption.encrypt(base64OpusData)
      : base64OpusData;

    const msg = {
      type: 'PTT_AUDIO',
      talkgroup: this.talkgroup,
      sessionId: this.sessionId,
      chunk: this.chunk++,
      data: payload,
    };

    if (AudioPipeline.useUdp) {
      this.udp.send(msg);
    } else {
      this.relay.send(msg);
    }
  }

  stopRecording(): void {
    this.isRecording = false;
  }

  static async decryptChunk(base64: string, enc: Encryption): Promise<string> {
    return enc.decrypt(base64);
  }
}
