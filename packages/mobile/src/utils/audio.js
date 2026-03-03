// audio.js — live mic capture → native Opus encode → relay
//
// Architecture:
//   react-native-live-audio-stream  → raw 16-bit PCM (8192-byte chunks)
//   OpusEncoderModule (Kotlin)      → Opus frames via Android MediaCodec (no WASM)
//   Encryption.ts (AES-GCM)        → encrypted Opus frame (pass-through in MVP mode)
//   comms.sendAudioChunk()         → PTT_AUDIO relay message
//
// Why native module?  opusscript uses WebAssembly — Hermes JS engine has no WASM support.
// Why MediaCodec?     Android ships c2.android.opus.encoder since API 29. No extra deps.

import LiveAudioStream from 'react-native-live-audio-stream';
import { PermissionsAndroid, Platform } from 'react-native';
import { comms, encryption } from './comms';
import { initOpusEncoder, encodeOpusFrame, destroyOpusEncoder } from './opusEncoder';

let isRecording = false;
let chunkIndex = 0;

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
// 8192 bytes > AudioRecord.getMinBufferSize() on SM-A225M.
// At 16kHz/16-bit/mono = 256ms of audio = ~4 Opus frames per chunk.
const BUFFER_SIZE = 8192;

export async function startAudioStream() {
  try {
    if (isRecording) return;

    // Android requires runtime RECORD_AUDIO permission
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        { title: 'Microphone', message: 'SkyTalk needs mic access for PTT', buttonPositive: 'OK' }
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Microphone permission denied');
      }
    }

    // Initialize native Opus encoder (Android MediaCodec)
    await initOpusEncoder();

    LiveAudioStream.init({
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: 16,
      audioSource: 1, // MIC
      bufferSize: BUFFER_SIZE,
    });

    LiveAudioStream.on('data', async (base64PCM) => {
      if (!isRecording) return;
      try {
        // Approximate raw PCM byte count from base64 length
        const rawBytes = Math.floor((base64PCM.length * 3) / 4);

        const opusFrames = await encodeOpusFrame(base64PCM);
        // Encoder may buffer a few PCM chunks before producing output (codec priming)
        if (!opusFrames || opusFrames.length === 0) return;

        for (const frame of opusFrames) {
          const opusBytes = Math.floor((frame.length * 3) / 4);
          const encrypted = await encryption.encrypt(frame);
          comms.sendAudioChunk(encrypted);
          console.log(
            `[audio] TX chunk ${chunkIndex++}` +
            ` | PCM ${rawBytes}B → Opus ${opusBytes}B` +
            ` | compression ${(rawBytes / opusBytes).toFixed(0)}x`
          );
        }
      } catch (err) {
        console.warn('[audio] encode/send error:', err.message ?? err);
      }
    });

    LiveAudioStream.start();
    isRecording = true;
    chunkIndex = 0;
    console.log('[audio] started — native Opus 16kHz mono 16kbps via Android MediaCodec');
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
    await destroyOpusEncoder();
    console.log('[audio] stopped');
  } catch (err) {
    console.warn('[audio] stopAudioStream error:', err.message);
  }
}
