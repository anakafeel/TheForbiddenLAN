/**
 * audioStreamPlayer.js — JS bridge for AudioStreamPlayerModule (native streaming playback).
 *
 * Instead of buffering all decoded PCM → building a WAV → writing to disk → expo-av play,
 * this feeds PCM directly to Android AudioTrack in real-time.
 *
 * Usage:
 *   await startStreamPlayer();    // once, when first RX audio chunk arrives
 *   await writeStreamPCM(pcmB64); // for each decoded Opus frame (every 60ms)
 *   await stopStreamPlayer();     // on PTT_END / timeout
 */
import { NativeModules } from 'react-native';

const { AudioStreamPlayer } = NativeModules;

const SAMPLE_RATE = 16000;
const CHANNEL_COUNT = 1;

/**
 * Start the native AudioTrack for streaming playback.
 * Safe to call multiple times — the native side releases any existing track first.
 */
export async function startStreamPlayer() {
  if (!AudioStreamPlayer) {
    throw new Error('AudioStreamPlayer native module not available');
  }
  await AudioStreamPlayer.start(SAMPLE_RATE, CHANNEL_COUNT);
}

/**
 * Write a chunk of decoded 16-bit PCM to the speaker immediately.
 * @param {string} base64PCM - base64-encoded 16-bit LE mono PCM
 * @returns {number} bytes written (or negative error code)
 */
export async function writeStreamPCM(base64PCM) {
  if (!AudioStreamPlayer) {
    throw new Error('AudioStreamPlayer native module not available');
  }
  return await AudioStreamPlayer.write(base64PCM);
}

/**
 * Stop streaming playback. Drains buffered audio before releasing.
 */
export async function stopStreamPlayer() {
  if (!AudioStreamPlayer) {
    console.warn('[audioStreamPlayer] native module not available, skipping stop');
    return;
  }
  try {
    await AudioStreamPlayer.stop();
  } catch (e) {
    console.warn('[audioStreamPlayer] stop error:', e.message);
  }
}
