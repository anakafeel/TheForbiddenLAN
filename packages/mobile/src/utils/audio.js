// audio.js — live mic capture via react-native-live-audio-stream → relay
//
// Architecture:
//   react-native-live-audio-stream  → raw 16-bit PCM frames (60ms @ 16kHz = 960 samples)
//   Encryption.ts (AES-GCM)        → encrypted PCM frame (pass-through in MVP mode)
//   comms.sendAudioChunk()         → PTT_AUDIO relay message
//
// NOTE: opusscript (WASM Opus encoder) was removed — Hermes JS engine in React Native
//   does not support WebAssembly. Raw PCM is forwarded until a native Opus binding is
//   integrated (e.g. react-native-opus with a working TurboModule build).
//   On a 22kbps satellite link this will exceed bandwidth — acceptable for E2E demo only.

import LiveAudioStream from 'react-native-live-audio-stream';
import { PermissionsAndroid, Platform } from 'react-native';
import { comms, encryption } from './comms';

let isRecording = false;

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
// 8192 bytes > AudioRecord.getMinBufferSize() on all tested Android devices.
// 1920 (60ms frame) was below the minimum on SM-A225M, causing STATE_UNINITIALIZED.
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
        const encrypted = await encryption.encrypt(base64PCM);
        comms.sendAudioChunk(encrypted);
      } catch (err) {
        console.warn('[audio] encrypt/send error:', err.message ?? err);
      }
    });

    LiveAudioStream.start();
    isRecording = true;
    console.log('[audio] started — raw PCM 16kHz mono 8192-byte chunks (no Opus — Hermes WASM unsupported)');
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
    console.log('[audio] stopped');
  } catch (err) {
    console.warn('[audio] stopAudioStream error:', err.message);
  }
}
