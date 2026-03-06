// opusDecoder.js — Passthrough decoder for testing
//
// Since Hermes doesn't support WebAssembly and native modules aren't linked,
// this decoder handles raw PCM data. For production, this would decode
// Opus frames to PCM.

import { NativeModules } from 'react-native';

const { OpusDecoder } = NativeModules;

const SAMPLE_RATE = 16000;
const CHANNEL_COUNT = 1;

let _initialized = false;

export async function initOpusDecoder() {
  if (OpusDecoder) {
    try {
      await OpusDecoder.initialize(SAMPLE_RATE, CHANNEL_COUNT);
      _initialized = true;
      console.log('[opus-dec] native decoder initialized (MediaCodec)');
      return;
    } catch (e) {
      console.warn('[opus-dec] native init failed, using passthrough');
    }
  }

  _initialized = true;
  console.log('[opus-dec] passthrough decoder initialized (PCM raw)');
}

export async function decodeOpusFrame(base64OpusOrPCM) {
  if (!_initialized) return '';
  
  // Passthrough - the "encoded" data is actually just PCM
  // In production, this would decode Opus to PCM
  if (base64OpusOrPCM && base64OpusOrPCM.length > 0) {
    return base64OpusOrPCM;
  }
  return '';
}

export async function destroyOpusDecoder() {
  if (OpusDecoder) {
    try {
      await OpusDecoder.destroy();
    } catch (e) {}
  }
  _initialized = false;
  console.log('[opus-dec] decoder destroyed');
}
