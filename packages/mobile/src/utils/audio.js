// audio.js — mic capture via MediaRecorder → AES-GCM encrypt → comms.sendAudioChunk().
// Exports the same startAudioStream / stopAudioStream API so PTTScreen.jsx needs no changes.
import { comms, encryption } from './comms';

let _mediaRecorder = null;
let _stream = null;

export async function startAudioStream() {
  try {
    _stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    _mediaRecorder = new MediaRecorder(_stream, { mimeType: 'audio/webm;codecs=opus' });

    _mediaRecorder.ondataavailable = async (e) => {
      if (!e.data.size) return;
      try {
        const buf = await e.data.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const encrypted = await encryption.encrypt(b64);
        console.log('[comms] PTT_AUDIO sending, encrypted bytes:', encrypted.length);
        await comms.sendAudioChunk(encrypted);
      } catch (err) {
        console.warn('[comms] audio chunk error:', err.message);
      }
    };

    _mediaRecorder.start(200); // 200 ms chunks — matches useAudioCapture
    console.log('[comms] mic capture started (audio/webm;codecs=opus)');
    return _stream;
  } catch (err) {
    console.warn('[comms] startAudioStream failed:', err.message);
    throw err;
  }
}

export function stopAudioStream() {
  if (_mediaRecorder) {
    _mediaRecorder.stop();
    _mediaRecorder = null;
  }
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
  console.log('[comms] mic capture stopped');
}
