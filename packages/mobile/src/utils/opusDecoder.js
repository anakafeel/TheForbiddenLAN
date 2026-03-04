// opusDecoder.js — JS bridge to OpusDecoderModule (Kotlin / Android MediaCodec)
//
// Decodes Opus frames → 16-bit PCM for playback on the RX path.
// Used by comms.js to convert incoming Opus audio to PCM before
// writing a WAV file for expo-av playback.

import { NativeModules } from 'react-native';

const { OpusDecoder } = NativeModules;

const SAMPLE_RATE = 16000;
const CHANNEL_COUNT = 1;

let _initialized = false;

export async function initOpusDecoder() {
  if (!OpusDecoder) {
    throw new Error(
      '[opus-dec] OpusDecoder native module not found. ' +
      'Run npx expo run:android to rebuild with the native module linked.'
    );
  }
  await OpusDecoder.initialize(SAMPLE_RATE, CHANNEL_COUNT);
  _initialized = true;
  console.log('[opus-dec] native decoder initialized — 16kHz mono (MediaCodec)');
}

/**
 * Decode one Opus frame to PCM.
 * @param {string} base64Opus  base64-encoded Opus frame
 * @returns {Promise<string>} base64-encoded 16-bit LE PCM (may be empty during priming)
 */
export async function decodeOpusFrame(base64Opus) {
  if (!_initialized || !OpusDecoder) return '';
  const pcm = await OpusDecoder.decode(base64Opus);
  return pcm ?? '';
}

export async function destroyOpusDecoder() {
  if (!_initialized || !OpusDecoder) return;
  await OpusDecoder.destroy();
  _initialized = false;
  console.log('[opus-dec] native decoder destroyed');
}
