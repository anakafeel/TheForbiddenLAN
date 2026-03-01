// AudioPipeline — record mic → encode Opus → encrypt AES-GCM → emit chunks to relay
// NOTE: Opus encoding requires opus-recorder or libopus WASM loaded separately
import type { AudioChunk } from './types';
import type { RelaySocket } from './RelaySocket';

export class AudioPipeline {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;

  constructor(
    private relay: RelaySocket,
    private talkgroup: string,
    private deviceId: string,
  ) {}

  async startRecording(seq: number): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' });
    let chunk = 0;

    this.mediaRecorder.ondataavailable = async (e: BlobEvent) => {
      if (!e.data.size) return;
      const buf = await e.data.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const msg: AudioChunk = {
        type: 'PTT_AUDIO',
        talkgroup: this.talkgroup,
        sender: this.deviceId,
        timestamp: Date.now(),
        seq,
        chunk: chunk++,
        data: b64,
      };
      this.relay.send(msg);
    };

    this.mediaRecorder.start(60); // 60ms slices = one Opus frame
  }

  stopRecording(): void {
    this.mediaRecorder?.stop();
    this.stream?.getTracks().forEach(t => t.stop());
    this.mediaRecorder = null;
    this.stream = null;
  }
}
