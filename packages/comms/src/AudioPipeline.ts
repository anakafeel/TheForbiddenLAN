// AudioPipeline — handles sequencing and sending external Opus chunks over the relay
import type { RelaySocket } from './RelaySocket';

export class AudioPipeline {
  private chunk = 0;
  private isRecording = false;

  constructor(
    private relay: RelaySocket,
    private talkgroup: string,
    private sessionId: number,
    private getSyncTime: () => number,
    private seq: number
  ) {}

  startRecording(): void {
    this.isRecording = true;
    this.chunk = 0;
  }

  // Mobile app (React Native) calls this with base64-encoded Opus frames
  enqueueChunk(base64OpusData: string): void {
    if (!this.isRecording) return;
    
    this.relay.send({
      type: 'PTT_AUDIO',
      talkgroup: this.talkgroup,
      sessionId: this.sessionId,
      timestamp: this.getSyncTime(),
      seq: this.seq,
      chunk: this.chunk++,
      data: base64OpusData,
    });
  }

  stopRecording(): void {
    this.isRecording = false;
  }
}
