import { useRef } from 'react';

export function useAudioPlayback() {
  const audioCtx = useRef<AudioContext | null>(null);
  const queue = useRef<ArrayBuffer[]>([]);
  const playing = useRef(false);

  const getCtx = () => {
    if (!audioCtx.current) {
      audioCtx.current = new AudioContext();
    }
    return audioCtx.current;
  };

  const playNext = async () => {
    if (playing.current || queue.current.length === 0) return;
    playing.current = true;
    const buf = queue.current.shift()!;
    try {
      const ctx = getCtx();
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.onended = () => {
        playing.current = false;
        playNext();
      };
      source.start();
    } catch {
      playing.current = false;
      playNext();
    }
  };

  const enqueue = (base64: string) => {
    const binary = atob(base64);
    const buf = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    queue.current.push(buf);
    playNext();
  };

  const clear = () => {
    queue.current = [];
    playing.current = false;
  };

  return { enqueue, clear };
}
