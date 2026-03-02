// comms.js — singleton ForbiddenLANComms + Encryption + audio playback.
// All values come from CONFIG so no code changes are needed when switching to real backend.
import { ForbiddenLANComms, Encryption } from '@forbiddenlan/comms';
import { CONFIG } from '../config';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export const encryption = new Encryption();

export const comms = new ForbiddenLANComms({
  relayUrl:  CONFIG.WS_URL,
  dls140Url: CONFIG.DLS140_URL,
  deviceId:  CONFIG.DEVICE_ID,
  mock:      CONFIG.MOCK_MODE,
});

// ── Audio playback (expo-av) ──────────────────────────────────────────────────
//
// On PTT_AUDIO: accumulate base64 chunks.
// On PTT_END:   concatenate all chunks → write to a temp file → play via expo-av.
//
// We accumulate before playing because the audio stream (m4a/aac from expo-av) produces
// fragmented packets that are not independently decodable. The full file is needed.

const _accumulator = []; // base64 string chunks

export function enqueueAudio(base64) {
  _accumulator.push(base64);
}

async function _flushAudio() {
  if (_accumulator.length === 0) return;

  // Concatenate all base64 chunks into one string
  const combinedBase64 = _accumulator.join('');
  _accumulator.length = 0;

  try {
    const tempUri = FileSystem.cacheDirectory + `ptt_rx_${Date.now()}.m4a`;
    await FileSystem.writeAsStringAsync(tempUri, combinedBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: tempUri },
      { shouldPlay: true }
    );

    sound.setOnPlaybackStatusUpdate(async (status) => {
      if (status.isLoaded && status.didJustFinish) {
        await sound.unloadAsync();
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
        console.log('[comms] PTT playback complete');
      }
    });

    console.log('[comms] playing transmission');
  } catch (e) {
    console.warn('[comms] playback error:', e.message);
  }
}

// ── One-time initialization ───────────────────────────────────────────────────
let _initialized = false;

/**
 * Connect to the relay and wire up audio playback.
 *
 * Mock mode:  called automatically with CONFIG.MOCK_JWT on import (via socket.js).
 * Real mode:  called by connectComms(jwt) in socket.js after auth login.
 *
 * Idempotent — safe to call multiple times, only the first call takes effect.
 */
export async function initComms(jwt) {
  if (_initialized) return;
  _initialized = true;

  // Init AES-GCM-256 key (hardcoded test key — replaced by KDF when ready)
  await encryption.init();

  // Connect — no dlsUser/dlsPass skips DLS-140 HTTP login (avoids ERR_ADDRESS_UNREACHABLE)
  await comms.connect(jwt);
  comms.joinTalkgroup(CONFIG.TALKGROUP);

  // Mock mode: onRawMessage bypasses the half-duplex filter so MockRelay echo reaches
  // the playback handler (needed for single-device loopback testing).
  // Real mode: onMessage keeps the half-duplex filter (no audio feedback on live links).
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
