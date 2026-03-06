import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";

const SAMPLE_RATE = 16000;
const TONE_HZ = 880;
const TONE_SECONDS = 0.07;
const GAP_SECONDS = 0.045;
const TAIL_SECONDS = 0.03;
const AMPLITUDE = 0.34;

let doubleBeepUri = null;

function toBase64(bytes) {
  if (typeof btoa === "function") {
    const CHUNK = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  throw new Error("No base64 encoder available for PTT beep generation");
}

function buildDoubleBeepWavBase64() {
  const toneSamples = Math.floor(TONE_SECONDS * SAMPLE_RATE);
  const gapSamples = Math.floor(GAP_SECONDS * SAMPLE_RATE);
  const tailSamples = Math.floor(TAIL_SECONDS * SAMPLE_RATE);
  const totalSamples = toneSamples * 2 + gapSamples + tailSamples;
  const pcm = new Int16Array(totalSamples);

  const writeTone = (offset) => {
    for (let i = 0; i < toneSamples; i++) {
      const t = i / SAMPLE_RATE;
      const fadeIn = Math.min(1, i / 180);
      const fadeOut = Math.min(1, (toneSamples - i) / 220);
      const envelope = Math.min(fadeIn, fadeOut);
      const wave = Math.sin(2 * Math.PI * TONE_HZ * t);
      pcm[offset + i] = Math.floor(wave * envelope * AMPLITUDE * 32767);
    }
  };

  writeTone(0);
  writeTone(toneSamples + gapSamples);

  const pcmBytes = new Uint8Array(pcm.buffer);
  const wav = new Uint8Array(44 + pcmBytes.length);
  const view = new DataView(wav.buffer);

  view.setUint32(0, 0x52494646, false); // RIFF
  view.setUint32(4, 36 + pcmBytes.length, true);
  view.setUint32(8, 0x57415645, false); // WAVE
  view.setUint32(12, 0x666d7420, false); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // 16-bit mono
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // data
  view.setUint32(40, pcmBytes.length, true);
  wav.set(pcmBytes, 44);

  return toBase64(wav);
}

async function ensureDoubleBeepFile() {
  if (doubleBeepUri) return doubleBeepUri;
  if (!FileSystem.cacheDirectory) return null;

  const uri = `${FileSystem.cacheDirectory}ptt_press_double_beep.wav`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    const base64 = buildDoubleBeepWavBase64();
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: "base64" });
  }

  doubleBeepUri = uri;
  return uri;
}

export async function playPTTPressBeep(enabled = true) {
  if (!enabled) return;

  try {
    const uri = await ensureDoubleBeepFile();
    if (!uri) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume: 0.45 },
    );

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch (err) {
    console.warn("[pttSounds] beep playback failed:", err?.message || err);
  }
}

