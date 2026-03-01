// AudioPipeline — captures mic audio and sends Opus chunks over the relay
import type { RelaySocket } from './RelaySocket';

export class AudioPipeline {
  private mediaRecorder: MediaRecorder | null = null;
  private chunk = 0;

  constructor(
    private relay: RelaySocket,
    private talkgroup: string,
    private deviceId: string,
    private sessionId: number,
    private getSyncTime: () => number,
  ) {}

  startRecording(seq: number): void {
    if (typeof navigator === 'undefined') return; // server-side guard
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      this.mediaRecorder.ondataavailable = async (e) => {
        if (!e.data.size) return;
        const buf = await e.data.arrayBuffer();
        const data = btoa(String.fromCharCode(...new Uint8Array(buf)));
        this.relay.send({
          type: 'PTT_AUDIO',
          talkgroup: this.talkgroup,
          sessionId: this.sessionId,
          timestamp: this.getSyncTime(),
          seq,
          chunk: this.chunk++,
          data,
        });
      };
      this.mediaRecorder.start(200); // 200 ms chunks
    }).catch(() => { /* mic access denied */ });
  }

  stopRecording(): void {
    this.mediaRecorder?.stop();
    (this.mediaRecorder as any)?.stream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    this.mediaRecorder = null;
  }
}
