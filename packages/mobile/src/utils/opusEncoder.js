// opusEncoder.js — JS bridge to OpusEncoderModule (Kotlin / Android MediaCodec)
//
// The native module wraps Android's c2.android.opus.encoder (AOSP software codec).
// Available on API 29+ (Android 10). SM-A225M is Android 11.
// Requires a native rebuild (npx expo run:android) to link the new module.

import { NativeModules } from 'react-native';

const { OpusFECEncoder } = NativeModules;

const SAMPLE_RATE = 16000;
const CHANNEL_COUNT = 1;
const BIT_RATE = 16000; // 16 kbps — fits 22 kbps SATCOM with room for headers

let _initialized = false;

export async function initOpusEncoder() {
  if (!OpusFECEncoder) {
    throw new Error(
      '[opus] OpusFECEncoder native module not found. ' +
      'Run npx expo run:android to rebuild with the native module linked.'
    );
  }
  await OpusFECEncoder.initEncoder(SAMPLE_RATE, CHANNEL_COUNT, BIT_RATE);
  _initialized = true;
  console.log('[opus] native FEC encoder initialized (libopus)');
}

/**
 * Encode one PCM buffer to Opus.
 * @param {string} base64PCM  base64-encoded 16-bit PCM chunk from LiveAudioStream
 * @returns {Promise<string[]>} array of base64-encoded Opus frames (returns array to match old API)
 */
export async function encodeOpusFrame(base64PCM) {
  if (!_initialized || !OpusFECEncoder) return [];
  try {
    const frame = await OpusFECEncoder.encode(base64PCM);
    return frame ? [frame] : [];
  } catch (err) {
    return [];
  }
}

export async function destroyOpusEncoder() {
  if (!_initialized || !OpusFECEncoder) return;
  await OpusFECEncoder.destroyEncoder();
  _initialized = false;
  console.log('[opus] native FEC encoder destroyed');
}
