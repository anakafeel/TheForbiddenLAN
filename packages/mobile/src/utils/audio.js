// audio.js — live mic capture via react-native-live-audio-stream → Opus encode → comms.sendAudioChunk()
// Replaces expo-av to enable real-time chunk streaming and Opus compression.
// Note: Requires Expo Dev Build (EAS) because it uses custom native modules.
import LiveAudioStream from 'react-native-live-audio-stream';
import { OpusEncoder } from 'react-native-opus';
import { Buffer } from 'buffer';
import { comms, encryption } from './comms';

let isRecording = false;
let encoder = null;

const FRAME_SIZE_MS = 60; // 60ms frames for Opus as per architecture
const SAMPLE_RATE = 16000;
const CHANNELS = 1;

export async function startAudioStream() {
  try {
    if (isRecording) return;
    
    // Initialize Opus Encoder: 16kHz, 1 channel, VoIP application
    encoder = new OpusEncoder(SAMPLE_RATE, CHANNELS, OpusEncoder.Application.VOIP);

    const options = {
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: 16,
      audioSource: 1, // MIC
      bufferSize: (SAMPLE_RATE * FRAME_SIZE_MS) / 1000 * 2 // PCM bytes for 60ms
    };

    LiveAudioStream.init(options);
    
    LiveAudioStream.on('data', async (base64PCM) => {
      if (!isRecording) return;
      try {
        // Decode base64 PCM data to Buffer
        const pcmBuffer = Buffer.from(base64PCM, 'base64');
        
        // Encode PCM to Opus
        const opusBuffer = await encoder.encode(pcmBuffer);
        
        // Encode Opus to base64 for the comms pipeline
        const opusBase64 = opusBuffer.toString('base64');
        
        // Encrypt and send
        const encrypted = await encryption.encrypt(opusBase64);
        comms.sendAudioChunk(encrypted);
      } catch (err) {
        console.warn('[comms] Encoding/Encryption error:', err);
      }
    });

    LiveAudioStream.start();
    isRecording = true;
    console.log(`[comms] mic capture started via react-native-live-audio-stream (Opus, ${FRAME_SIZE_MS}ms frames)`);
  } catch (err) {
    console.warn('[comms] startAudioStream failed:', err.message);
    throw err;
  }
}

export async function stopAudioStream() {
  if (!isRecording) return;
  try {
    LiveAudioStream.stop();
    isRecording = false;
    
    // Give comms layer time to flush final chunks
    setTimeout(() => {
      encoder = null;
    }, 100);
    console.log('[comms] mic capture stopped');
  } catch (err) {
    console.warn('[comms] stopAudioStream error:', err.message);
  }
}
