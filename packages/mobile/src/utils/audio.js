// audio.js — live mic capture → native Opus encode → relay
//
// Architecture:
//   react-native-live-audio-stream  → raw 16-bit PCM (1920-byte / 60ms chunks)
//   OpusEncoderModule (Kotlin)      → Opus frames via Android MediaCodec (VoIP tuned)
//   Encryption.ts (AES-GCM)        → encrypted Opus frame (pass-through in MVP mode)
//   comms.sendAudioChunk()         → PTT_AUDIO relay message
//
// VoIP tuning: 16kHz mono, 16kbps CBR, 60ms frames.
// Budget: ~120-200 bytes/frame → ≤16 kbps payload (6 kbps headroom on 22 kbps SATCOM).
//
// Why native module?  opusscript uses WebAssembly — Hermes JS engine has no WASM support.
// Why MediaCodec?     Android ships c2.android.opus.encoder since API 29. No extra deps.

import LiveAudioStream from "react-native-live-audio-stream";
import { PermissionsAndroid, Platform } from "react-native";
import { comms, encryption, loopbackStash } from "./comms";
import {
  initOpusEncoder,
  encodeOpusFrame,
  destroyOpusEncoder,
} from "./opusEncoder";

// Fast Refresh safety: if this module is re-evaluated while recording,
// stop the old stream so we don't stack up duplicate event listeners.
if (global.__AUDIO_IS_RECORDING__) {
  try {
    LiveAudioStream.stop();
  } catch (_) {}
  global.__AUDIO_IS_RECORDING__ = false;
}

let isRecording = false;
let chunkIndex = 0;

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
// 60ms frame alignment: 960 samples × 2 bytes/sample × 1 channel = 1920 bytes.
// This matches the Opus encoder's 60ms frame duration exactly, so each
// LiveAudioStream callback delivers one clean frame to the native encoder —
// avoiding the over-quantization / static caused by 256ms (8192 byte) buffers.
// 1920 > AudioRecord.getMinBufferSize(16000, MONO, PCM_16) ≈ 1280 on SM-A225M.
const FRAME_DURATION_MS = 60;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000; // 960
const BUFFER_SIZE = FRAME_SAMPLES * CHANNELS * 2; // 1920 bytes

export async function startAudioStream() {
  try {
    if (isRecording) return;

    // Android requires runtime RECORD_AUDIO permission
    if (Platform.OS === "android") {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone",
          message: "SkyTalk needs mic access for PTT",
          buttonPositive: "OK",
        },
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error("Microphone permission denied");
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

    LiveAudioStream.on("data", async (base64PCM) => {
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
          const encBytes =
            typeof encrypted === "string"
              ? Math.floor((encrypted.length * 3) / 4)
              : (encrypted?.byteLength ?? opusBytes);
          comms.sendAudioChunk(encrypted);
          // Stash for loopback (single-device testing) — no-op when loopback is off
          loopbackStash(encrypted);
          // Budget check: expect ~120–200 bytes per 60ms → ≤ 16 kbps payload
          console.log(
            `[audio] TX #${chunkIndex++}` +
              ` | PCM ${rawBytes}B → Opus ${opusBytes}B → enc ${encBytes}B` +
              ` | ${((opusBytes * 8) / (FRAME_DURATION_MS / 1000) / 1000).toFixed(1)}kbps` +
              ` | ${(rawBytes / opusBytes).toFixed(0)}x compression`,
          );
        }
      } catch (err) {
        console.warn("[audio] encode/send error:", err.message ?? err);
      }
    });

    LiveAudioStream.start();
    isRecording = true;
    global.__AUDIO_IS_RECORDING__ = true;
    chunkIndex = 0;
    console.log(
      `[audio] started — Opus 16kHz mono 16kbps CBR, ${FRAME_DURATION_MS}ms frames ` +
        `(${BUFFER_SIZE}B PCM/frame) via Android MediaCodec`,
    );
  } catch (err) {
    console.warn("[audio] startAudioStream failed:", err.message);
    throw err;
  }
}

export async function stopAudioStream() {
  if (!isRecording) return;
  try {
    LiveAudioStream.stop();
    isRecording = false;
    global.__AUDIO_IS_RECORDING__ = false;
    await destroyOpusEncoder();
    console.log("[audio] stopped");
  } catch (err) {
    console.warn("[audio] stopAudioStream error:", err.message);
  }
}
