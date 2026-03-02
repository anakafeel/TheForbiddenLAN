// AudioPipeline — handles sequencing and sending external Opus chunks over the relay
import type { RelaySocket } from './RelaySocket';
import type { Encryption } from './Encryption';

export class AudioPipeline {
  private chunk = 0;
  private isRecording = false;

  constructor(
    private relay: RelaySocket,
    private talkgroup: string,
    private sessionId: number,
    private getSyncTime: () => number,
    private seq: number,
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

    this.relay.send({
      type: 'PTT_AUDIO',
      talkgroup: this.talkgroup,
      sessionId: this.sessionId,
      timestamp: this.getSyncTime(),
      seq: this.seq,
      chunk: this.chunk++,
      data: payload,
    });
  }

  stopRecording(): void {
    this.isRecording = false;
  }

  static async decryptChunk(base64: string, enc: Encryption): Promise<string> {
    return enc.decrypt(base64);
  }
}
