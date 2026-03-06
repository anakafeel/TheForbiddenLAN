// opusEncoder.js — Passthrough encoder for testing
//
// Since Hermes doesn't support WebAssembly and native modules aren't linked,
// this encoder passes through raw PCM data. This allows testing the audio
// pipeline without proper Opus encoding. Bandwidth will be higher but it works.

import { NativeModules } from 'react-native';

const { OpusFECEncoder } = NativeModules;

const SAMPLE_RATE = 16000;
const CHANNEL_COUNT = 1;
const BIT_RATE = 16000;

let _initialized = false;

export async function initOpusEncoder() {
  if (OpusFECEncoder) {
    try {
      await OpusFECEncoder.initEncoder(SAMPLE_RATE, CHANNEL_COUNT, BIT_RATE);
      _initialized = true;
      console.log('[opus] native FEC encoder initialized (MediaCodec)');
      return;
    } catch (e) {
      console.warn('[opus] native init failed, using passthrough');
    }
  }

  _initialized = true;
  console.log('[opus] passthrough encoder initialized (PCM raw)');
}

export async function encodeOpusFrame(base64PCM) {
  if (!_initialized) return [];
  
  // Passthrough - just return the PCM data as-is
  // In production, this would be Opus-encoded
  // For testing, we just send raw PCM
  if (base64PCM && base64PCM.length > 0) {
    return [base64PCM];
  }
  return [];
}

export async function destroyOpusEncoder() {
  if (OpusFECEncoder) {
    try {
      await OpusFECEncoder.destroyEncoder();
    } catch (e) {}
  }
  _initialized = false;
  console.log('[opus] encoder destroyed');
}
