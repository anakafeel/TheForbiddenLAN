#!/usr/bin/env node
// listen.js — Laptop-side PTT audio receiver for local relay testing.
//
// Connects to local-relay.js as a second WebSocket client, joins a talkgroup,
// collects incoming PTT_AUDIO Opus frames per session, then on PTT_END decodes
// each session's frames to PCM and plays them through the laptop speakers via aplay.
//
// Why opusscript?  Node.js (V8) supports WebAssembly; Hermes (phone) does not.
// opusscript = Opus compiled to WebAssembly via Emscripten — works fine here.
//
// Usage:
//   node listen.js [talkgroup]
//
// Default talkgroup: alpha
//
// Typical test flow:
//   Terminal 1: node local-relay.js
//   Terminal 2: node listen.js
//   Terminal 3: adb -s R58T41T27TR reverse tcp:3000 tcp:3000
//   Phone: press PTT → hear audio on laptop ~1s after PTT_END

const { WebSocket } = require('ws');
const OpusScript   = require('opusscript');
const { execSync } = require('child_process');
const fs           = require('fs');
const path         = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const WS_URL    = 'ws://localhost:3000/ws';
const TALKGROUP = process.argv[2] ?? 'alpha';

// Must match phone-side opusEncoder.js values
const SAMPLE_RATE   = 16000;   // Hz
const CHANNELS      = 1;       // mono
const FRAME_SIZE    = 960;     // 60ms at 16kHz (OpusScript default decode size)

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
};

function ts()                { return `${C.dim}${new Date().toISOString().slice(11, 23)}${C.reset}`; }
function log(col, tag, msg)  { console.log(`${ts()} ${col}[${tag}]${C.reset} ${msg}`); }

// ── WAV writer ────────────────────────────────────────────────────────────────
// Writes a minimal 16-bit PCM WAV file and returns the path.
function writeWav(pcmSamples, filePath) {
  // pcmSamples: Int16Array
  const dataBytes  = pcmSamples.length * 2;
  const headerSize = 44;
  const buf        = Buffer.alloc(headerSize + dataBytes);
  let o = 0;

  // RIFF chunk
  buf.write('RIFF', o); o += 4;
  buf.writeUInt32LE(36 + dataBytes, o); o += 4;
  buf.write('WAVE', o); o += 4;

  // fmt  chunk
  buf.write('fmt ', o); o += 4;
  buf.writeUInt32LE(16, o); o += 4;      // PCM subchunk size
  buf.writeUInt16LE(1, o); o += 2;       // PCM format
  buf.writeUInt16LE(CHANNELS, o); o += 2;
  buf.writeUInt32LE(SAMPLE_RATE, o); o += 4;
  buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, o); o += 4; // byteRate
  buf.writeUInt16LE(CHANNELS * 2, o); o += 2;               // blockAlign
  buf.writeUInt16LE(16, o); o += 2;                          // bitsPerSample

  // data chunk
  buf.write('data', o); o += 4;
  buf.writeUInt32LE(dataBytes, o); o += 4;
  for (let i = 0; i < pcmSamples.length; i++) {
    buf.writeInt16LE(pcmSamples[i], o);
    o += 2;
  }

  fs.writeFileSync(filePath, buf);
  return filePath;
}

// ── Opus decoder (initialised once) ──────────────────────────────────────────
const decoder = new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.AUDIO);
log(C.green, 'OPUS', `decoder ready — ${SAMPLE_RATE}Hz mono`);

// ── Session buffer: sessionId → base64[] ─────────────────────────────────────
const sessions = new Map();

function playSession(sessionId) {
  const frames = sessions.get(sessionId);
  if (!frames || frames.length === 0) return;
  sessions.delete(sessionId);

  log(C.cyan, 'DECODE', `session 0x${sessionId.toString(16).toUpperCase()} — ${frames.length} Opus frame(s)`);

  const allPCM = [];
  let failed = 0;

  for (const b64 of frames) {
    try {
      // strip possible AES-GCM wrapping:
      // Encryption.ts prepends 12-byte IV then the ciphertext. In MVP mode the
      // "ciphertext" is the raw Opus frame (no actual encryption), so the first
      // 12 bytes are zeros and the rest is Opus. We strip the IV here.
      const raw = Buffer.from(b64, 'base64');
      const opusData = raw.length > 12 ? raw.slice(12) : raw;

      // OpusScript.decode returns Int16Array
      const pcm = decoder.decode(opusData, FRAME_SIZE);
      allPCM.push(...pcm);
    } catch (e) {
      failed++;
    }
  }

  if (failed > 0) {
    log(C.yellow, 'DECODE', `${failed}/${frames.length} frames failed (may be codec priming)`);
  }

  if (allPCM.length === 0) {
    log(C.red, 'DECODE', 'no PCM produced — check IV strip logic or FRAME_SIZE');
    return;
  }

  const pcmSamples  = new Int16Array(allPCM);
  const durationSec = (pcmSamples.length / SAMPLE_RATE).toFixed(2);
  const wavPath     = path.join('/tmp', `ptt_${sessionId}_${Date.now()}.wav`);
  writeWav(pcmSamples, wavPath);

  log(C.green, 'PLAY', `${durationSec}s of audio → ${wavPath}`);
  try {
    execSync(`aplay -q -f S16_LE -r ${SAMPLE_RATE} -c ${CHANNELS} "${wavPath}"`);
    log(C.green, 'PLAY', 'done');
  } catch (e) {
    log(C.red, 'PLAY', `aplay error: ${e.message}`);
  }
}

// ── WebSocket client ──────────────────────────────────────────────────────────
function connect() {
  log(C.cyan, 'CONNECT', `→ ${WS_URL}  talkgroup: "${TALKGROUP}"`);
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    log(C.green, 'CONNECT', 'connected');
    ws.send(JSON.stringify({ type: 'SYNC_TIME', clientTime: Date.now() }));
    ws.send(JSON.stringify({ type: 'JOIN_TALKGROUP', talkgroup: TALKGROUP }));
    log(C.green, 'JOIN', `joined talkgroup "${TALKGROUP}"`);
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {

      case 'SYNC_TIME': {
        const offset = msg.serverTime - msg.clientTime;
        log(C.dim, 'SYNC', `clock offset ${offset >= 0 ? '+' : ''}${offset}ms`);
        break;
      }

      case 'PRESENCE': {
        log(C.dim, 'PRESENCE', `"${msg.talkgroup}" online: [${msg.online?.join(', ') ?? ''}]`);
        break;
      }

      case 'PTT_START': {
        const sid = msg.sessionId;
        sessions.set(sid, []);
        log(C.magenta, 'PTT_START',
          `session 0x${sid?.toString(16).toUpperCase()} | tg: "${msg.talkgroup}" | sender: ${msg.sender}`);
        break;
      }

      case 'PTT_AUDIO': {
        const sid = msg.sessionId;
        if (!sessions.has(sid)) sessions.set(sid, []);
        sessions.get(sid).push(msg.data);
        const n = sessions.get(sid).length;
        const dataBytes = msg.data ? Math.floor(msg.data.length * 3 / 4) : 0;
        log(C.blue, 'PTT_AUDIO',
          `chunk ${msg.chunk ?? n} | session 0x${sid?.toString(16).toUpperCase()} | ${dataBytes}B`);
        break;
      }

      case 'PTT_END': {
        const sid = msg.sessionId;
        log(C.magenta, 'PTT_END',
          `session 0x${sid?.toString(16).toUpperCase()} — decoding & playing...`);
        // playSession is synchronous (aplay blocks); run in setImmediate so WS reads continue
        setImmediate(() => playSession(sid));
        break;
      }

      case 'TEXT_MSG': {
        log(C.yellow, 'TEXT', `"${msg.talkgroup}" ${msg.sender}: ${msg.text}`);
        break;
      }

      default:
        log(C.dim, 'MSG', `type="${msg.type}"`);
    }
  });

  ws.on('close', () => {
    log(C.yellow, 'DISCONNECT', 'relay closed — reconnecting in 3s...');
    setTimeout(connect, 3000);
  });

  ws.on('error', (err) => {
    log(C.red, 'ERROR', err.message);
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────
console.log(`
${C.green}╔══════════════════════════════════════════════════════╗
║          ForbiddenLAN PTT Listener               ║
╚══════════════════════════════════════════════════╝${C.reset}

${C.cyan}Relay:${C.reset}      ${WS_URL}
${C.cyan}Talkgroup:${C.reset}  ${TALKGROUP}
${C.cyan}Decoder:${C.reset}    Opus → PCM 16kHz mono (opusscript/WASM)
${C.cyan}Playback:${C.reset}   aplay S16_LE ${SAMPLE_RATE}Hz

${C.dim}Override talkgroup: node listen.js bravo${C.reset}
${C.dim}Ctrl+C to stop${C.reset}
`);

connect();
