// audio.js — live mic capture via react-native-live-audio-stream → opusscript WASM encode → comms.sendAudioChunk()
//
// Architecture:
//   react-native-live-audio-stream  → raw 16-bit PCM frames (60ms @ 16kHz = 960 samples)
//   opusscript (pure JS/WASM)       → Opus-encoded bytes
//   Encryption.ts (AES-GCM)        → encrypted Opus frame
//   comms.sendAudioChunk()         → PTT_AUDIO relay message
//
// Why opusscript NOT react-native-opus:
//   react-native-opus v0.3.1 is decoder-only and a TurboModule — it crashes at import time
//   with "OpusTurbo could not be found". opusscript is pure WASM with no native bindings.

import LiveAudioStream from 'react-native-live-audio-stream';
import OpusScript from 'opusscript';
import { Buffer } from 'buffer';
import { comms, encryption } from './comms';

let isRecording = false;
let encoder = null;

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const FRAME_SIZE = 960;        // samples = 60ms @ 16kHz
const FRAME_BYTES = FRAME_SIZE * 2; // 16-bit PCM = 2 bytes/sample

export async function startAudioStream() {
  try {
    if (isRecording) return;

    encoder = new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.VOIP);

    LiveAudioStream.init({
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: 16,
      audioSource: 1, // MIC
      bufferSize: FRAME_BYTES,
    });

    LiveAudioStream.on('data', async (base64PCM) => {
      if (!isRecording || !encoder) return;
      try {
        const pcmBuffer = Buffer.from(base64PCM, 'base64');
        const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, FRAME_SIZE);
        const opusBuffer = encoder.encode(samples, FRAME_SIZE);
        const encrypted = await encryption.encrypt(Buffer.from(opusBuffer).toString('base64'));
        comms.sendAudioChunk(encrypted);
      } catch (err) {
        console.warn('[audio] encode/encrypt error:', err.message ?? err);
      }
    });

    LiveAudioStream.start();
    isRecording = true;
    console.log('[audio] started — Opus WASM 16kHz mono 60ms frames');
  } catch (err) {
    console.warn('[audio] startAudioStream failed:', err.message);
    throw err;
  }
}

export async function stopAudioStream() {
  if (!isRecording) return;
  try {
    LiveAudioStream.stop();
    isRecording = false;
    setTimeout(() => {
      encoder?.delete?.(); // opusscript WASM memory cleanup
      encoder = null;
    }, 100);
    console.log('[audio] stopped');
  } catch (err) {
    console.warn('[audio] stopAudioStream error:', err.message);
  }
}
