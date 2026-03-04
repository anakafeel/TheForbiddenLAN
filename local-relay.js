#!/usr/bin/env node
// local-relay.js — Standalone local WebSocket relay for offline PTT testing.
//
// Mirrors packages/server/src/ws/hub.ts but:
//   - No JWT auth (just connects, no token required)
//   - No database (in-memory only)
//   - Verbose logging of every message so you can see exactly what the phone sends
//   - Handles SYNC_TIME (hub.ts currently doesn't)
//   - Runs on port 3000 so adb reverse tcp:3000 tcp:3000 tunnels it to the phone
//
// Usage:
//   node local-relay.js
//
// Then in a second terminal:
//   adb -s R58T41T27TR reverse tcp:3000 tcp:3000
//
// Then change packages/mobile/.env.local:
//   EXPO_PUBLIC_WS_URL=ws://localhost:3000/ws
//   EXPO_PUBLIC_API_URL=http://localhost:3000
//
// Then restart Metro (Ctrl+C, then):
//   cd packages/mobile && set -a && source .env.local && set +a && npx expo start --port 8081 --clear
//
// Press r in Metro to reload the bundle on the phone, then press PTT.

const http  = require('http');
const { WebSocketServer } = require('ws');

const PORT = 3000;

// ── State ────────────────────────────────────────────────────────────────────
// talkgroup → Set<WebSocket>
const rooms = new Map();
// WebSocket → { id, joinedRooms: Set<string> }
const clients = new Map();
// sessionId (number) → talkgroup (string) — seeded by PTT_START
const sessionTalkgroup = new Map();
let clientCounter = 0;

// ── Colours ──────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  dim:   '\x1b[2m',
  cyan:  '\x1b[36m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
  red:   '\x1b[31m',
  blue:  '\x1b[34m',
  magenta:'\x1b[35m',
};

function ts() {
  return `${C.dim}${new Date().toISOString().slice(11, 23)}${C.reset}`;
}

function log(colour, tag, msg) {
  console.log(`${ts()} ${colour}[${tag}]${C.reset} ${msg}`);
}

// ── Fan-out ───────────────────────────────────────────────────────────────────
function fanOut(sender, talkgroup, raw, includeSender = false) {
  const room = rooms.get(talkgroup);
  if (!room) return 0;
  let sent = 0;
  for (const peer of room) {
    if (!includeSender && peer === sender) continue;
    if (peer.readyState === 1 /* OPEN */) {
      peer.send(raw);
      sent++;
    }
  }
  return sent;
}

function broadcastPresence(talkgroup) {
  const room = rooms.get(talkgroup);
  if (!room) return;
  const online = Array.from(room).map(s => clients.get(s)?.id).filter(Boolean);
  const msg = JSON.stringify({ type: 'PRESENCE', talkgroup, online });
  for (const peer of room) {
    if (peer.readyState === 1) peer.send(msg);
  }
}

// ── HTTP server (handles /auth/login for local dev) ───────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Fake auth endpoint so the app can log in locally without Shrikar's server
  if (req.method === 'POST' && url.pathname === '/auth/login') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { username } = JSON.parse(body);
        // Return a fake JWT (not cryptographically valid, but good for local WS relay tests)
        const fakeJwt = Buffer.from(JSON.stringify({ sub: username, iat: Date.now() })).toString('base64');
        const token = `eyJhbGciOiJub25lIn0.${fakeJwt}.fakesig`;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ token, user: { id: username, username } }));
        log(C.green, 'AUTH', `Login: ${username} → token issued`);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad request' }));
      }
    });
    return;
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    res.end();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('local-relay running\n');
});

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const id = `client-${++clientCounter}`;
  // No JWT check — accept everything for local testing
  clients.set(ws, { id, joinedRooms: new Set() });
  log(C.cyan, 'CONNECT', `${id} connected (total: ${wss.clients.size})`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const rawStr = raw.toString();
    const info = clients.get(ws);

    switch (msg.type) {

      case 'SYNC_TIME': {
        const response = JSON.stringify({ type: 'SYNC_TIME', clientTime: msg.clientTime, serverTime: Date.now() });
        ws.send(response);
        log(C.dim, 'SYNC', `${id} ↔ clock sync (offset calculable)`);
        break;
      }

      case 'JOIN_TALKGROUP': {
        const tg = msg.talkgroup;
        if (!tg) break;
        if (!rooms.has(tg)) rooms.set(tg, new Set());
        rooms.get(tg).add(ws);
        info.joinedRooms.add(tg);
        broadcastPresence(tg);
        const roomSize = rooms.get(tg).size;
        log(C.green, 'JOIN', `${id} joined talkgroup "${tg}" (${roomSize} in room)`);
        break;
      }

      case 'LEAVE_TALKGROUP': {
        const tg = msg.talkgroup;
        if (!tg) break;
        rooms.get(tg)?.delete(ws);
        info.joinedRooms.delete(tg);
        broadcastPresence(tg);
        log(C.yellow, 'LEAVE', `${id} left talkgroup "${tg}"`);
        break;
      }

      case 'PTT_START': {
        const tg = msg.talkgroup;
        if (!tg) break;
        if (typeof msg.sessionId === 'number') {
          sessionTalkgroup.set(msg.sessionId, tg);
        }
        const peers = fanOut(ws, tg, rawStr);
        log(C.magenta, 'PTT_START',
          `${id} | tg: "${tg}" | sessionId: 0x${msg.sessionId?.toString(16).toUpperCase()} | fanned to ${peers} peer(s)`);
        break;
      }

      case 'PTT_AUDIO': {
        const tg = sessionTalkgroup.get(msg.sessionId);
        if (!tg) {
          log(C.red, 'PTT_AUDIO', `DROPPED — sessionId ${msg.sessionId} not found (no PTT_START seen)`);
          break;
        }
        const peers = fanOut(ws, tg, rawStr);
        const dataBytes = msg.data ? Math.floor(msg.data.length * 3 / 4) : 0;
        log(C.blue, 'PTT_AUDIO',
          `${id} | chunk ${msg.chunk} | tg: "${tg}" | ${dataBytes}B Opus | fanned to ${peers} peer(s)`);
        break;
      }

      case 'PTT_END': {
        const tg = msg.talkgroup;
        if (typeof msg.sessionId === 'number') {
          sessionTalkgroup.delete(msg.sessionId);
        }
        const peers = fanOut(ws, tg, rawStr);
        log(C.magenta, 'PTT_END',
          `${id} | tg: "${tg}" | sessionId cleaned | fanned to ${peers} peer(s)`);
        break;
      }

      case 'PRESENCE': {
        // Client sending PRESENCE — old bug, just ignore gracefully
        log(C.dim, 'PRESENCE', `${id} sent PRESENCE (client-sent — ignored, server broadcasts on JOIN)`);
        break;
      }

      case 'TEXT_MSG': {
        const tg = msg.talkgroup;
        if (!tg) break;
        const peers = fanOut(ws, tg, rawStr);
        log(C.yellow, 'TEXT', `${id} → "${tg}": "${msg.text}" | fanned to ${peers} peer(s)`);
        break;
      }

      case 'GPS_UPDATE': {
        for (const tg of info.joinedRooms) {
          fanOut(ws, tg, rawStr);
        }
        log(C.dim, 'GPS', `${id} lat:${msg.lat?.toFixed(4)} lng:${msg.lng?.toFixed(4)}`);
        break;
      }

      default:
        log(C.dim, 'UNKNOWN', `${id} sent type="${msg.type}"`);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    for (const tg of info?.joinedRooms ?? []) {
      rooms.get(tg)?.delete(ws);
      broadcastPresence(tg);
    }
    clients.delete(ws);
    log(C.yellow, 'DISCONNECT', `${id} disconnected (total: ${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    log(C.red, 'ERROR', `${id}: ${err.message}`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`
${C.green}╔══════════════════════════════════════════════════════╗
║          ForbiddenLAN Local Relay  (port ${PORT})        ║
╚══════════════════════════════════════════════════════╝${C.reset}

${C.cyan}WebSocket:${C.reset} ws://localhost:${PORT}/ws  (no auth required)
${C.cyan}Auth stub:${C.reset} POST http://localhost:${PORT}/auth/login

${C.yellow}Setup (run in separate terminals):${C.reset}
  1. adb -s R58T41T27TR reverse tcp:${PORT} tcp:${PORT}
  2. Edit packages/mobile/.env.local:
       EXPO_PUBLIC_WS_URL=ws://localhost:${PORT}/ws
       EXPO_PUBLIC_API_URL=http://localhost:${PORT}
  3. Restart Metro:
       cd packages/mobile
       set -a && source .env.local && set +a
       npx expo start --port 8081 --clear
  4. Press r in Metro to reload phone bundle
  5. Press PTT — watch logs here

${C.dim}Ctrl+C to stop${C.reset}
`);
});
