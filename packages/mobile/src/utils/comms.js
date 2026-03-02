// comms.js — singleton ForbiddenLANComms + Encryption + audio playback.
// All values come from CONFIG so no code changes are needed when switching to real backend.
import { ForbiddenLANComms, Encryption } from '@forbiddenlan/comms';
import { CONFIG } from '../config';

export const encryption = new Encryption();

export const comms = new ForbiddenLANComms({
  relayUrl:  CONFIG.WS_URL,
  dls140Url: CONFIG.DLS140_URL,
  deviceId:  CONFIG.DEVICE_ID,
  mock:      CONFIG.MOCK_MODE,
});

// ── Audio playback ────────────────────────────────────────────────────────────
//
// WHY NOT per-chunk decodeAudioData?
//
// MediaRecorder (audio/webm;codecs=opus) produces FRAGMENTED WebM, not independent files:
//
//   Chunk 0 (first, larger):  [EBML header][WebM Info][Tracks][Cluster 1]
//   Chunk 1..N (subsequent):  [Cluster N]   ← no header, NOT standalone-decodable
//
// decodeAudioData() needs a complete audio file. Chunk 0 succeeds (has the header).
// Chunks 1..N throw silently inside the catch → only the first ~200ms of audio plays.
//
// FIX: accumulate every chunk from one PTT transmission into _accumulator[].
// On PTT_END (relayed back from MockRelay / real server), concatenate the buffers:
//
//   [EBML header][WebM Info][Tracks][Cluster 1][Cluster 2]...[Cluster N]
//                                                   ↑ valid, complete WebM file
//
// decodeAudioData on the concatenated buffer decodes the full transmission.
// You hear the entire thing play back right after the speaker releases PTT.

let _audioCtx = null;
const _accumulator = []; // ArrayBuffers collected during one PTT transmission

function _getCtx() {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

export function enqueueAudio(base64) {
  const binary = atob(base64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  _accumulator.push(buf);
}

async function _flushAudio() {
  if (_accumulator.length === 0) return;

  // Concatenate all accumulated WebM clusters into one decodable buffer
  const totalBytes = _accumulator.reduce((n, b) => n + b.byteLength, 0);
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of _accumulator) {
    combined.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  _accumulator.length = 0; // clear for next transmission

  try {
    const ctx = _getCtx();
    const decoded = await ctx.decodeAudioData(combined.buffer);
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(ctx.destination);
    source.start();
    console.log('[comms] playing transmission —', Math.round(decoded.duration * 1000), 'ms');
  } catch (e) {
    console.warn('[comms] playback decode error:', e.message);
  }
}

// ── One-time initialization ───────────────────────────────────────────────────
let _initialized = false;

/**
 * Connect to the relay and wire up audio playback.
 *
 * Mock mode:  called automatically with CONFIG.MOCK_JWT on import (via socket.js).
 * Real mode:  called by connectComms(jwt) in socket.js after Shri's auth login.
 *
 * Idempotent — safe to call multiple times, only the first call takes effect.
 */
export async function initComms(jwt) {
  if (_initialized) return;
  _initialized = true;

  // Init AES-GCM-256 key (hardcoded test key — replaced by Shri's KDF when ready)
  await encryption.init();

  // Connect — no dlsUser/dlsPass skips DLS-140 HTTP login (avoids ERR_ADDRESS_UNREACHABLE)
  await comms.connect(jwt);
  comms.joinTalkgroup(CONFIG.TALKGROUP);

  // Mock mode:  onRawMessage bypasses the half-duplex filter so MockRelay echo reaches
  //             the playback handler (needed for single-device loopback testing).
  // Real mode:  onMessage keeps the half-duplex filter (no audio feedback on live links).
  const subscribe = CONFIG.MOCK_MODE
    ? comms.onRawMessage.bind(comms)
    : comms.onMessage.bind(comms);

  subscribe(async (msg) => {
    // Accumulate each incoming audio chunk
    if (msg.type === 'PTT_AUDIO' && msg.data) {
      try {
        const decrypted = await encryption.decrypt(msg.data);
        enqueueAudio(decrypted);
        if (CONFIG.MOCK_MODE) {
          console.log('[comms] PTT_AUDIO chunk accumulated');
        }
      } catch (e) {
        console.warn('[comms] audio decrypt error:', e.message);
      }
    }

    // PTT_END signals the transmission is complete — decode and play everything
    if (msg.type === 'PTT_END') {
      console.log('[comms] PTT_END received — flushing audio buffer');
      await _flushAudio();
    }
  });

  // Signal polling — DLS-140 unreachable in mock (silent fail), works with real hardware
  comms.startSignalPolling(10000, (status) => {
    console.log('[comms] signal — link:', status.activeLink,
      '| sat:', status.certusSignalBars,
      '| cell:', status.cellularSignal);
  });

  console.log(
    `[comms] initialized — ${CONFIG.MOCK_MODE ? 'MOCK' : 'LIVE'} mode` +
    ` | device: ${CONFIG.DEVICE_ID}` +
    ` | talkgroup: ${CONFIG.TALKGROUP}` +
    ` | relay: ${CONFIG.WS_URL}`
  );
}
