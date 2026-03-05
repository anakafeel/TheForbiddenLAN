// comms.js — singleton ForbiddenLANComms + Encryption + audio playback.
// All values come from CONFIG so no code changes are needed when switching to real backend.
//
// FAST REFRESH SAFETY: All singletons are stored on `global` so they survive
// Metro Fast Refresh cycles. Without this, module re-evaluation creates new
// uninitialized instances, orphaning the WebSocket connection → red screen.
import { ForbiddenLANComms, Encryption } from "@forbiddenlan/comms";
import { CONFIG } from "../config";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import {
  initOpusDecoder,
  decodeOpusFrame,
  destroyOpusDecoder,
} from "./opusDecoder";
import {
  startStreamPlayer,
  writeStreamPCM,
  stopStreamPlayer,
} from "./audioStreamPlayer";

// ── Fast Refresh–safe singletons ──────────────────────────────────────────────
// On first load, create and stash on global. On subsequent re-evaluations (hot
// reload), reuse the existing instances so the WebSocket/crypto state survives.
if (!global.__COMMS_SINGLETON__) {
  global.__COMMS_SINGLETON__ = new ForbiddenLANComms({
    relayUrl: CONFIG.WS_URL,
    dls140Url: CONFIG.DLS140_URL,
    deviceId: CONFIG.DEVICE_ID,
  });
}
if (!global.__ENCRYPTION_SINGLETON__) {
  global.__ENCRYPTION_SINGLETON__ = new Encryption();
}

export const comms = global.__COMMS_SINGLETON__;
export const encryption = global.__ENCRYPTION_SINGLETON__;

// ── Floor Control state (walk-on prevention) ──────────────────────────────────
// Exported so UI components (PTTScreen) can check if channel is busy
// and show appropriate feedback when a PTT request is denied.
let _floorDenyCallback = null;
let _channelBusy = false;
let _floorHolder = null;

/**
 * Register a callback to be called when PTT is denied (walk-on prevention).
 * @param {(talkgroup: string, holder: string) => void} cb
 */
export function onFloorDenied(cb) {
  _floorDenyCallback = cb;
  comms.setOnFloorDeny((talkgroup, holder) => {
    _channelBusy = true;
    _floorHolder = holder;
    console.warn(
      `[comms] FLOOR_DENY — channel ${talkgroup} busy (held by ${holder})`,
    );
    if (_floorDenyCallback) _floorDenyCallback(talkgroup, holder);
  });
}

/**
 * Check if the channel is currently busy (someone else transmitting).
 * @returns {{ busy: boolean, holder: string | null }}
 */
export function getFloorState() {
  return { busy: _channelBusy, holder: _floorHolder };
}

// ── Audio playback (Opus decode → native AudioTrack streaming) ────────────────
//
// RX pipeline (streaming — low latency):
//   On first PTT_AUDIO: init decoder + start AudioTrack.
//   On each PTT_AUDIO:  decrypt → Opus decode → write PCM to AudioTrack (immediate).
//   On PTT_END:          stop AudioTrack, destroy decoder.
//
// Fallback: If the native AudioStreamPlayer module is unavailable, falls back to
// the legacy WAV-buffered path (accumulate → WAV file → expo-av).
//
// Loopback mode (LIVE single-device testing):
//   TX chunks are also fed into the RX accumulator so you can hear yourself.
//   Enabled via EXPO_PUBLIC_LOOPBACK=true in .env.

const _pcmAccumulator = []; // base64 PCM strings — used by legacy fallback + loopback
const _seenChunks = new Set(); // "sessionId:chunk" — deduplicates WS+UDP dual delivery
let _decoderReady = false;
let _decoderInitPromise = null; // Guard against concurrent init
let _audioModeSet = false;
let _rxInactivityTimer = null;
const RX_INACTIVITY_TIMEOUT_MS = 8000; // flush accumulated audio if no chunk arrives for 8s
let _streamPlayerActive = false; // true while AudioTrack is streaming
let _useStreamPlayer = true; // set to false if native module is missing

/**
 * Ensure the audio subsystem is configured for SPEAKER playback.
 *
 * CRITICAL: After mic recording via LiveAudioStream, the Android audio
 * subsystem stays in recording mode. Without explicitly switching to
 * playback mode, Audio.Sound.createAsync() either routes to the earpiece
 * (inaudible) or fails silently. This was ROOT CAUSE #2 for "can't hear audio".
 */
async function _ensurePlaybackMode() {
  // Always re-assert playback mode — Android audio subsystem
  // silently reverts to recording mode after mic use (LiveAudioStream).
  // Without this, playback routes to earpiece or fails silently.
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    _audioModeSet = true;
    console.log("[comms] audio mode set for speaker playback");
  } catch (e) {
    console.warn("[comms] failed to set audio mode:", e.message);
  }
}

/**
 * Reset the inactivity timer. If no PTT_AUDIO arrives for 8 seconds,
 * flush whatever's accumulated (safety net for missing PTT_END).
 */
function _resetRxTimer() {
  if (_rxInactivityTimer) clearTimeout(_rxInactivityTimer);
  _rxInactivityTimer = setTimeout(async () => {
    if (_streamPlayerActive || _pcmAccumulator.length > 0) {
      console.warn(
        `[comms] RX inactivity timeout (${RX_INACTIVITY_TIMEOUT_MS}ms) — flushing (stream=${_streamPlayerActive}, legacy=${_pcmAccumulator.length} frames)`,
      );
      _seenChunks.clear();
      await _flushAudio();
    }
  }, RX_INACTIVITY_TIMEOUT_MS);
}

/**
 * Ensure the Opus decoder is ready (lazy init).
 * Uses a promise guard to prevent concurrent initialization from multiple frames.
 */
async function _ensureDecoderReady() {
  if (_decoderReady) return true;
  
  // If init is already in progress, wait for it instead of starting another
  if (_decoderInitPromise) {
    return _decoderInitPromise;
  }
  
  _decoderInitPromise = (async () => {
    try {
      await initOpusDecoder();
      _decoderReady = true;
    } catch (e) {
      console.warn("[comms] failed to init Opus decoder:", e.message);
      throw e;
    } finally {
      _decoderInitPromise = null;
    }
  })();
  
  return _decoderInitPromise;
}

/**
 * Start the native AudioTrack for streaming playback.
 * Falls back to legacy WAV mode if the native module is missing.
 */
async function _startStreaming() {
  if (!_useStreamPlayer || _streamPlayerActive) return;
  try {
    await startStreamPlayer();
    _streamPlayerActive = true;
    console.log("[comms] AudioTrack streaming started");
  } catch (e) {
    console.warn(
      "[comms] AudioStreamPlayer unavailable, using legacy WAV fallback:",
      e.message,
    );
    _useStreamPlayer = false;
  }
}

/**
 * Stop the native AudioTrack streaming.
 */
async function _stopStreaming() {
  if (!_streamPlayerActive) return;
  try {
    await stopStreamPlayer();
  } catch (e) {
    console.warn("[comms] stopStreamPlayer error:", e.message);
  }
  _streamPlayerActive = false;
  console.log("[comms] AudioTrack streaming stopped");
}

/**
 * Decode one Opus frame and either stream it to AudioTrack or accumulate for legacy path.
 * @param {string} base64Opus  base64-encoded Opus frame (already decrypted)
 */
async function _decodeAndPlay(base64Opus) {
  if (!(await _ensureDecoderReady())) return;

  const pcmBase64 = await decodeOpusFrame(base64Opus);
  if (!pcmBase64 || pcmBase64.length === 0) {
    console.warn('[comms] Opus decode returned empty — decoder failure or wrong input format');
    return;
  }

  if (_useStreamPlayer) {
    // Streaming path: start AudioTrack on first frame, write immediately
    if (!_streamPlayerActive) {
      await _ensurePlaybackMode();
      await _startStreaming();
    }
    try {
      await writeStreamPCM(pcmBase64);
    } catch (e) {
      console.warn(
        "[comms] writeStreamPCM error, falling back to legacy:",
        e.message,
      );
      _useStreamPlayer = false;
      _streamPlayerActive = false;
      _pcmAccumulator.push(pcmBase64);
    }
  } else {
    // Legacy fallback: accumulate for WAV flush
    _pcmAccumulator.push(pcmBase64);
  }
}

/**
 * Decode one incoming Opus frame to PCM and accumulate it (legacy + loopback path).
 * @param {string} base64Opus  base64-encoded Opus frame (already decrypted)
 */
async function _decodeAndAccumulate(base64Opus) {
  if (!(await _ensureDecoderReady())) return;

  const pcmBase64 = await decodeOpusFrame(base64Opus);
  if (pcmBase64 && pcmBase64.length > 0) {
    _pcmAccumulator.push(pcmBase64);
  }
}

/**
 * Stop streaming (if active), destroy decoder, and flush any legacy-accumulated audio.
 */
async function _flushAudio() {
  // ── Streaming path: just stop the AudioTrack (audio already played in real-time)
  if (_streamPlayerActive) {
    await _stopStreaming();
  }

  // Clear any pending inactivity timer early
  if (_rxInactivityTimer) {
    clearTimeout(_rxInactivityTimer);
    _rxInactivityTimer = null;
  }

  // Destroy decoder after transmission ends (will re-init on next PTT)
  if (_decoderReady) {
    try {
      await destroyOpusDecoder();
    } catch (_) {}
    _decoderReady = false;
  }

  // If there's nothing in the legacy accumulator, we're done
  // (streaming mode already played everything in real-time)
  if (_pcmAccumulator.length === 0) return;

  // ── Legacy fallback: flush accumulated PCM as WAV
  await _flushAudioLegacy();
}

/**
 * Legacy WAV-based flush: build WAV file from accumulated base64 PCM chunks.
 * Used as fallback when AudioStreamPlayer native module is unavailable,
 * and for loopback playback.
 */
async function _flushAudioLegacy() {
  if (_pcmAccumulator.length === 0) return;

  const frameCount = _pcmAccumulator.length;

  // Decode all base64 PCM chunks to binary Uint8Arrays
  const pcmChunks = [];
  let totalPcmBytes = 0;
  for (const b64 of _pcmAccumulator) {
    if (!b64) continue;
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    pcmChunks.push(bytes);
    totalPcmBytes += bytes.length;
  }
  _pcmAccumulator.length = 0;

  if (totalPcmBytes === 0) return;

  try {
    const sampleRate = 16000;
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const durationMs = (totalPcmBytes / byteRate) * 1000;

    // Build complete WAV file: 44-byte RIFF/WAVE header + raw PCM
    const wavFile = new Uint8Array(44 + totalPcmBytes);
    const view = new DataView(wavFile.buffer);

    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + totalPcmBytes, true); // file size - 8
    view.setUint32(8, 0x57415645, false); // "WAVE"
    // fmt sub-chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // PCM format chunk size
    view.setUint16(20, 1, true); // PCM format (1)
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    // data sub-chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, totalPcmBytes, true);

    // Copy decoded PCM chunks into WAV body
    let offset = 44;
    for (const chunk of pcmChunks) {
      wavFile.set(chunk, offset);
      offset += chunk.length;
    }

    // Encode entire WAV as ONE base64 string (chunked to avoid call-stack overflow)
    const CHUNK = 8192;
    let binaryStr = "";
    for (let i = 0; i < wavFile.length; i += CHUNK) {
      const slice = wavFile.subarray(i, Math.min(i + CHUNK, wavFile.length));
      binaryStr += String.fromCharCode.apply(null, slice);
    }
    const wavBase64 = btoa(binaryStr);

    const tempUri = FileSystem.cacheDirectory + `ptt_rx_${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(tempUri, wavBase64, {
      encoding: "base64",
    });

    // Switch audio subsystem to speaker playback mode BEFORE playing.
    // Without this, audio routes to earpiece or is silent after mic recording.
    await _ensurePlaybackMode();

    console.log(
      `[comms] playing ${frameCount} decoded Opus frames` +
        ` | PCM ${totalPcmBytes}B | ~${durationMs.toFixed(0)}ms`,
    );

    const { sound } = await Audio.Sound.createAsync(
      { uri: tempUri },
      { shouldPlay: true, volume: 1.0 },
    );

    sound.setOnPlaybackStatusUpdate(async (status) => {
      if (status.isLoaded && status.didJustFinish) {
        await sound.unloadAsync();
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
        console.log("[comms] PTT playback complete");
      }
    });
  } catch (e) {
    console.warn("[comms] playback error:", e.message);
  }
}

// ── Loopback support (single-device testing in LIVE mode) ─────────────────────
// When EXPO_PUBLIC_LOOPBACK=true, TX audio is fed into the local RX pipeline
// so you can verify the full encode→decode→playback chain on one device.
// The server's hub.ts fanOut() correctly skips the sender, which means
// single-device testing is impossible without this local loopback.
const LOOPBACK_ENABLED =
  process.env.EXPO_PUBLIC_LOOPBACK === "true" ||
  process.env.EXPO_PUBLIC_LOOPBACK === "1";
const _loopbackBuffer = []; // encrypted Opus chunks buffered during TX
let _isLocalTx = false;

/**
 * Called by audio.js after encrypting each Opus chunk.
 * In loopback mode, stash a copy so we can play it back locally after PTT_END.
 */
export function loopbackStash(encryptedBase64) {
  if (!LOOPBACK_ENABLED || !_isLocalTx) return;
  _loopbackBuffer.push(encryptedBase64);
}

// ── One-time initialization ───────────────────────────────────────────────────
// Stored on global so Fast Refresh doesn't reset it to false.
if (global.__COMMS_INITIALIZED__ === undefined) {
  global.__COMMS_INITIALIZED__ = false;
}

/**
 * Connect to the relay and wire up audio playback.
 * Called by connectComms(jwt) in socket.js after auth login.
 *
 * Idempotent — safe to call multiple times, only the first call takes effect.
 */
export async function initComms(jwt) {
  if (global.__COMMS_INITIALIZED__) return;
  global.__COMMS_INITIALIZED__ = true;

  // Init AES-GCM-256 key (hardcoded test key — replaced by KDF when ready)
  await encryption.init();

  // Connect — no dlsUser/dlsPass skips DLS-140 HTTP login (avoids ERR_ADDRESS_UNREACHABLE)
  await comms.connect(jwt);

  // Always use onRawMessage — half-duplex is enforced locally below.
  // onMessage's built-in filter can't distinguish "our own echoed audio" from
  // "another device's audio" when the server adds echo support later.
  comms.onRawMessage(async (msg) => {
    // ── Floor control state sync ──────────────────────────────────
    if (msg.type === "FLOOR_GRANT") {
      _channelBusy = true;
      _floorHolder = msg.winner;
      return; // handled by SDK layer
    }
    if (msg.type === "FLOOR_RELEASED") {
      _channelBusy = false;
      _floorHolder = null;
      return; // handled by SDK layer
    }
    if (msg.type === "FLOOR_DENY") {
      // SDK handles the PTT stop — we just track state
      _channelBusy = true;
      _floorHolder = msg.holder;
      return;
    }

    if (msg.type === "PRESENCE") {
      const online = msg.online ?? [];
      console.log(`[comms] PRESENCE — ${online.length} peer(s) online in talkgroup: [${online.join(', ')}]`);
      return;
    }

    // ── RX: Decode each incoming Opus frame to PCM and accumulate ──
    if (msg.type === "PTT_AUDIO" && msg.data) {
      // Deduplicate: server sends via both UDP and WebSocket for reliability.
      // Drop the second copy so the frame is only decoded once.
      const chunkKey = `${msg.sessionId}:${msg.chunk}`;
      if (_seenChunks.has(chunkKey)) return;
      _seenChunks.add(chunkKey);

      // Diagnostic: log every incoming audio chunk BEFORE any guard
      console.log(
        `[comms] RX PTT_AUDIO chunk arrived (isLocalTx=${_isLocalTx}, via=${msg._transport ?? 'ws'}, chunk=${msg.chunk ?? '?'})`,
      );

      // Half-duplex: drop incoming audio while we are transmitting
      if (_isLocalTx) return;

      try {
        const decrypted = await encryption.decrypt(msg.data);
        await _decodeAndPlay(decrypted);
        _resetRxTimer();
        console.log(
          `[comms] RX chunk decoded & playing (stream=${_streamPlayerActive})`,
        );
      } catch (e) {
        console.warn("[comms] audio decrypt/decode error:", e.message);
      }
    }

    // ── RX: PTT_END signals the transmission is complete ──
    if (msg.type === "PTT_END") {
      console.log(`[comms] PTT_END received — flushing (stream=${_streamPlayerActive}, frames=${_pcmAccumulator.length})`);
      _seenChunks.clear();
      await _flushAudio();
    }
  });

  // Signal polling — DLS-140 unreachable when not on SATCOM (silent fail)
  comms.startSignalPolling(10000, (status) => {
    console.log(
      "[comms] signal — link:",
      status.activeLink,
      "| sat:",
      status.certusDataBars,
      "| cell:",
      status.cellularSignal,
    );
  });

  console.log(
    `[comms] initialized` +
      ` | device: ${CONFIG.DEVICE_ID}` +
      ` | talkgroup: ${CONFIG.TALKGROUP}` +
      ` | relay: ${CONFIG.WS_URL}` +
      (LOOPBACK_ENABLED ? " | LOOPBACK ON" : ""),
  );
}

/**
 * Called by socket.js when PTT starts — sets local TX flag for half-duplex.
 */
export function notifyTxStart() {
  _isLocalTx = true;
  _loopbackBuffer.length = 0;
  _audioModeSet = false; // force re-set on next playback (mic recording changes audio mode)
}

/**
 * Called by socket.js when PTT ends — clears TX flag and triggers loopback playback.
 */
export async function notifyTxEnd() {
  // Small delay before clearing TX flag — UDP packets from peers may be
  // slightly behind PTT_END on the WebSocket control channel.
  setTimeout(() => { _isLocalTx = false; }, 150);
  _audioModeSet = false; // force re-set on next playback

  // Loopback: decode stashed TX chunks and play them back locally
  if (LOOPBACK_ENABLED && _loopbackBuffer.length > 0) {
    console.log(
      `[comms] loopback: decoding ${_loopbackBuffer.length} stashed TX chunks`,
    );
    for (const enc of _loopbackBuffer) {
      try {
        const decrypted = await encryption.decrypt(enc);
        await _decodeAndAccumulate(decrypted);
      } catch (e) {
        console.warn("[comms] loopback decode error:", e.message);
      }
    }
    _loopbackBuffer.length = 0;
    console.log("[comms] loopback: flushing audio for local playback");
    await _flushAudio();
  }
}
