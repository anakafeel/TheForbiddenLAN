// opusEncoder.js — JS bridge to OpusEncoderModule (Kotlin / Android MediaCodec)
//
// The native module wraps Android's c2.android.opus.encoder (AOSP software codec).
// Available on API 29+ (Android 10). SM-A225M is Android 11.
// Requires a native rebuild (npx expo run:android) to link the new module.

import { NativeModules } from 'react-native';

const { OpusEncoder } = NativeModules;

const SAMPLE_RATE = 16000;
const CHANNEL_COUNT = 1;
const BIT_RATE = 16000; // 16 kbps — fits 22 kbps SATCOM with room for headers

let _initialized = false;

export async function initOpusEncoder() {
  if (!OpusEncoder) {
    throw new Error(
      '[opus] OpusEncoder native module not found. ' +
      'Run npx expo run:android to rebuild with the native module linked.'
    );
  }
  await OpusEncoder.initialize(SAMPLE_RATE, CHANNEL_COUNT, BIT_RATE);
  _initialized = true;
  console.log('[opus] native encoder initialized — 16kHz mono 16kbps (MediaCodec)');
}

/**
 * Encode one PCM buffer to Opus.
 * @param {string} base64PCM  base64-encoded 16-bit PCM chunk from LiveAudioStream
 * @returns {Promise<string[]>} array of base64-encoded Opus frames (may be empty during priming)
 */
export async function encodeOpusFrame(base64PCM) {
  if (!_initialized || !OpusEncoder) return [];
  const frames = await OpusEncoder.encode(base64PCM);
  return frames ?? [];
}

export async function destroyOpusEncoder() {
  if (!_initialized || !OpusEncoder) return;
  await OpusEncoder.destroy();
  _initialized = false;
  console.log('[opus] native encoder destroyed');
}
