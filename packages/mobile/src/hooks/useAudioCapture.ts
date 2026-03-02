import { useRef } from 'react';

export function useAudioCapture(onChunk: (base64: string) => void) {
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);

  const start = async () => {
    stream.current = await navigator.mediaDevices.getUserMedia({
      audio: true, video: false,
    });
    mediaRecorder.current = new MediaRecorder(stream.current, {
      mimeType: 'audio/webm;codecs=opus',
    });
    mediaRecorder.current.ondataavailable = async (e: BlobEvent) => {
      if (!e.data.size) return;
      const buf = await e.data.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      onChunk(b64);
    };
    mediaRecorder.current.start(200); // 200ms chunks
  };

  const stop = () => {
    mediaRecorder.current?.stop();
    stream.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    mediaRecorder.current = null;
    stream.current = null;
  };

  return { start, stop };
}
