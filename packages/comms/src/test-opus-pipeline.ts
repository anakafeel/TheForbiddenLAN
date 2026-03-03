/**
 * test-opus-pipeline.ts
 *
 * Integration test: comms layer + Opus codec + bandwidth analysis
 * Run with:  npx tsx src/test-opus-pipeline.ts
 *
 * Tests:
 *  1. MockRelaySocket PTT round-trip (connect → PTT → audio chunks → receive)
 *  2. Opus encoding at 6 kbps via opusscript (60ms frames @ 8 kHz mono)
 *  3. AES-GCM encryption overhead measurement
 *  4. Full per-packet byte breakdown vs 22 kbps satellite budget
 */

import { ForbiddenLANComms } from './ForbiddenLANComms.js';
import { Encryption } from './Encryption.js';
import type { RelayMessage } from './types.js';

// ── helpers ──────────────────────────────────────────────────────────────────

const SATELLITE_BPS = 22_000;      // 22 kbps uplink hard limit
const FRAME_MS      = 60;          // Opus frame duration — 60ms reduces per-packet overhead vs 20ms
const SAMPLE_RATE   = 8_000;       // 8 kHz — lowest Opus-supported rate, good for voice
const CHANNELS      = 1;           // mono
const SAMPLES_PER_FRAME = Math.floor(SAMPLE_RATE * FRAME_MS / 1000); // 480 samples @ 60ms

const sep  = () => console.log('─'.repeat(60));
const pass = (msg: string) => console.log(`  ✅  ${msg}`);
const fail = (msg: string) => console.log(`  ❌  ${msg}`);
const info = (msg: string) => console.log(`  ℹ️   ${msg}`);

function bytesToBits(bytes: number, durationMs: number): number {
  return (bytes * 8) / (durationMs / 1000);
}

function makeSineWavePCM(samples: number, freq = 440, sampleRate = 8000): Int16Array {
  const buf = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    buf[i] = Math.round(32767 * 0.5 * Math.sin((2 * Math.PI * freq * i) / sampleRate));
  }
  return buf;
}

// ── Test 1: MockRelaySocket PTT round-trip ────────────────────────────────────

async function testMockPTTRoundTrip(): Promise<void> {
  console.log('\n📡  Test 1: MockRelaySocket PTT round-trip\n');
  sep();

  const comms = new ForbiddenLANComms({
    relayUrl: 'ws://mock',
    deviceId: 'test-device-001',
    mock: true,
  });

  const received: RelayMessage[] = [];

  await comms.connect('mock-jwt');
  pass('Connected via MockRelaySocket');

  comms.joinTalkgroup('TG-ALPHA');
  pass('Joined talkgroup TG-ALPHA');

  // Listen to ALL relay messages (bypasses half-duplex filter)
  comms.onRawMessage((msg) => received.push(msg));

  // Simulate a PTT session with 5 synthetic audio chunks
  comms.startPTT();
  pass('PTT started — PTT_START sent');

  const fakeChunk = btoa('FAKE_OPUS_FRAME_DATA_20MS');
  for (let i = 0; i < 5; i++) {
    await comms.sendAudioChunk(fakeChunk);
  }
  pass('Sent 5 audio chunks');

  comms.stopPTT();
  pass('PTT stopped — PTT_END sent');

  // Wait for mock 50ms RTT echo
  await new Promise(r => setTimeout(r, 300));

  const audioMsgs = received.filter(m => m.type === 'PTT_AUDIO');
  const pttStart  = received.filter(m => m.type === 'PTT_START');
  const pttEnd    = received.filter(m => m.type === 'PTT_END');

  pttStart.length  ? pass(`PTT_START echoed back`) : fail('PTT_START not received');
  audioMsgs.length === 5 ? pass(`All 5 PTT_AUDIO chunks echoed back`) : fail(`Expected 5, got ${audioMsgs.length} audio chunks`);
  pttEnd.length    ? pass(`PTT_END echoed back`)   : fail('PTT_END not received');

  info(`Total relay messages received: ${received.length}`);
  comms.disconnect();
  pass('Disconnected cleanly');
}

// ── Test 2: Opus encoding with opusscript ────────────────────────────────────

async function testOpusEncoding(): Promise<{ encoded: Uint8Array; rawBytes: number; opusBytes: number } | null> {
  console.log('\n🎙️   Test 2: Opus encoding (opusscript @ 8 kbps)\n');
  sep();

  let OpusScript: any;
  try {
    const mod = await import('opusscript');
    OpusScript = mod.default ?? mod;
  } catch {
    fail('opusscript not importable — skipping Opus encoding test');
    info('Add opusscript to comms devDependencies if you need it here, or run this test from packages/mobile');
    return null;
  }

  const encoder = new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.VOIP);
  encoder.setBitrate(6_000); // 6 kbps — safe ceiling for 22kbps satellite link with JSON+AES overhead

  const pcm = makeSineWavePCM(SAMPLES_PER_FRAME, 440, SAMPLE_RATE);
  const rawBytes = pcm.byteLength;  // 160 samples × 2 bytes = 320 bytes

  const encoded: Uint8Array = encoder.encode(pcm, SAMPLES_PER_FRAME);
  const opusBytes = encoded.byteLength;

  pass(`PCM frame generated: ${SAMPLES_PER_FRAME} samples @ ${SAMPLE_RATE} Hz = ${rawBytes} bytes`);
  pass(`Opus encoded (6 kbps, ${FRAME_MS}ms): ${opusBytes} bytes`);

  const compressionRatio = (rawBytes / opusBytes).toFixed(1);
  const opusBitrate = bytesToBits(opusBytes, FRAME_MS).toFixed(0);
  info(`Compression ratio: ${compressionRatio}:1`);
  info(`Effective bitrate: ${opusBitrate} bps`);

  encoder.delete(); // free WASM memory
  return { encoded, rawBytes, opusBytes };
}

// ── Test 3: Full pipeline byte breakdown ─────────────────────────────────────

async function testPacketSizeBreakdown(opusBytes: number): Promise<void> {
  console.log('\n📊  Test 3: Per-packet byte breakdown vs 22 kbps budget\n');
  sep();

  const enc = new Encryption();
  await enc.init();

  // Simulate one Opus frame worth of base64 data
  const fakeOpusBytes = new Uint8Array(opusBytes).fill(0x42);
  const rawBase64 = btoa(String.fromCharCode(...fakeOpusBytes));

  // Layer 1: raw Opus bytes
  const l1 = opusBytes;

  // Layer 2: after AES-GCM  (+12 IV + 16 GCM tag = 28 bytes overhead)
  const encryptedBase64 = await enc.encrypt(rawBase64);
  const encryptedBytes = Math.round(atob(encryptedBase64).length);
  const l2 = encryptedBytes;
  const aesOverhead = l2 - l1;

  // Layer 3: base64 of encrypted payload (what goes in JSON "data" field)
  const l3 = encryptedBase64.length; // already base64

  // Layer 4: full JSON WebSocket message
  // AudioChunk now omits talkgroup, timestamp, seq — server routes via sessionId
  const sampleMsg = JSON.stringify({
    type: 'PTT_AUDIO',
    sessionId: 0xDEADBEEF,
    chunk: 0,
    data: encryptedBase64,
  });
  const l4 = new TextEncoder().encode(sampleMsg).byteLength;

  // Bitrates at 50 fps (one 20ms frame per packet)
  const fps = 1000 / FRAME_MS;
  const b1 = (l1 * fps * 8);
  const b2 = (l2 * fps * 8);
  const b3 = (l3 * fps * 8);
  const b4 = (l4 * fps * 8);

  console.log('  Layer                       │ Bytes/frame │  bps  │ % of 22kbps');
  console.log('  ──────────────────────────────────────────────────────────────');

  const row = (label: string, bytes: number, bps: number) => {
    const pct = ((bps / SATELLITE_BPS) * 100).toFixed(1);
    console.log(`  ${label.padEnd(28)} │ ${String(bytes).padStart(11)} │ ${String(bps).padStart(5)} │ ${pct}%`);
  };

  row('1. Raw Opus frame',          l1, b1);
  row('2. + AES-GCM (IV+tag)',      l2, b2);
  row(`   (overhead: ${aesOverhead} bytes)`, aesOverhead, aesOverhead * fps * 8);
  row('3. + Base64 encoding',       l3, b3);
  row('4. + JSON WebSocket msg',    l4, b4);

  console.log('  ──────────────────────────────────────────────────────────────');
  console.log(`  Satellite uplink budget: ${SATELLITE_BPS} bps`);
  console.log(`  Remaining headroom:      ${(SATELLITE_BPS - b4).toFixed(0)} bps (for GPS, control msgs)\n`);

  if (b4 < SATELLITE_BPS) {
    pass(`Total ${b4} bps < 22000 bps — fits within satellite uplink ✓`);
  } else {
    fail(`Total ${b4} bps EXCEEDS 22000 bps — too large for satellite link`);
    info('Consider: lower Opus bitrate, reduce frame size, or disable per-frame encryption');
  }

  // Also show comparison with the current m4a/AAC implementation
  console.log('\n  ── Comparison: current m4a/AAC (whole-file-at-PTT-end) vs Opus streaming ──');
  const aacBytesPerSec = 12_000 / 8;  // 12 kbps AAC
  const aacBps = aacBytesPerSec * 8;
  info(`Current m4a/AAC ~${aacBps} bps audio data (no real-time chunking, burst at PTT end)`);
  info(`Opus streaming ~${b1} bps audio data (real-time 20ms chunks)`);
  info(`Opus saves ${((aacBps - b1) / aacBps * 100).toFixed(0)}% bandwidth vs AAC for audio data`);
}

// ── Test 4: Encryption round-trip integrity ───────────────────────────────────

async function testEncryptionRoundTrip(): Promise<void> {
  console.log('\n🔐  Test 4: AES-GCM encryption round-trip\n');
  sep();

  const enc = new Encryption();
  await enc.init();

  const original = btoa('SKYTALK_TEST_AUDIO_FRAME_DEADBEEF');
  const encrypted = await enc.encrypt(original);
  const decrypted = await enc.decrypt(encrypted);

  original === decrypted
    ? pass('Encrypt → decrypt round-trip: data integrity verified')
    : fail('Round-trip FAILED — data mismatch');

  const encBytes = Math.round(atob(encrypted).length);
  const origBytes = Math.round(atob(original).length);
  pass(`Original: ${origBytes} bytes  →  Encrypted: ${encBytes} bytes  (overhead: ${encBytes - origBytes} bytes)`);
  info('Expected overhead: 28 bytes (12 byte IV + 16 byte GCM tag)');
  Math.abs((encBytes - origBytes) - 28) <= 2
    ? pass('AES-GCM overhead matches spec (28 bytes)')
    : fail(`Overhead was ${encBytes - origBytes} bytes (expected 28)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🛰️   SkyTalk — Comms Layer Integration Test');
  console.log(`    Satellite uplink: ${SATELLITE_BPS} bps | Opus: ${FRAME_MS}ms @ ${SAMPLE_RATE} Hz\n`);

  try {
    await testMockPTTRoundTrip();

    const opusResult = await testOpusEncoding();
    const opusBytes = opusResult?.opusBytes ?? 20; // fallback: theoretical 20 bytes at 8kbps/20ms

    await testPacketSizeBreakdown(opusBytes);
    await testEncryptionRoundTrip();

    console.log('\n✅  All tests complete\n');
  } catch (err) {
    console.error('\n❌  Test runner error:', err);
    process.exit(1);
  }
}

main();
