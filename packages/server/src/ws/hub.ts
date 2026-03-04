// WebSocket hub — fan-out relay. Receives messages, routes to talkgroup members.
// Includes server-authoritative floor control to prevent walk-ons.
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';
import type { WebSocket } from 'ws';
import dgram from 'dgram';

// talkgroup ID → set of connected raw WebSockets
const rooms = new Map<string, Set<WebSocket>>();
// raw WebSocket → { userId, deviceId }
const socketUser = new Map<WebSocket, { userId: string; deviceId: string | null }>();
// raw WebSocket → set of talkgroup IDs the socket has joined
const socketRooms = new Map<WebSocket, Set<string>>();
// sessionId (4-byte int from PTT_START) → talkgroup — used to route PTT_AUDIO
// without requiring talkgroup on every audio chunk (bandwidth optimisation)
const sessionTalkgroup = new Map<number, string>();

// ── UDP Transport Layer ───────────────────────────────────────────────────────
export const udpServer = dgram.createSocket('udp4');
// userId → remote UDP address/port
export const udpClients = new Map<string, dgram.RemoteInfo>();

export function startUdpServer(options: { port: number }) {
  udpServer.on('message', (msg, rinfo) => {
    let parsed: any;
    try { parsed = JSON.parse(msg.toString()); } catch { return; }

    if (parsed.type === 'UDP_REGISTER') {
      if (parsed.userId) udpClients.set(parsed.userId, rinfo);
      return;
    }

    if (parsed.type === 'PTT_AUDIO') {
      const tg = sessionTalkgroup.get(parsed.sessionId as number);
      if (!tg) return;

      const holder = talkgroupFloor.get(tg);
      if (!holder || holder.sessionId !== parsed.sessionId) return;

      // Update sender's UDP address just in case
      udpClients.set(holder.senderId, rinfo);

      const room = rooms.get(tg);
      if (!room) return;

      for (const peer of room) {
        const user = socketUser.get(peer);
        if (!user || user.userId === holder.senderId) continue; // Don't echo to sender

        const peerUdp = udpClients.get(user.userId);
        if (peerUdp) {
          udpServer.send(new Uint8Array(msg), peerUdp.port, peerUdp.address);
        } else if (peer.readyState === 1) {
          peer.send(msg.toString());
        }
      }
    }
  });

  udpServer.on('listening', () => {
    const address = udpServer.address();
    console.log(`[hub] UDP server listening on ${address.address}:${address.port}`);
  });

  udpServer.bind(options.port);
}
// ──────────────────────────────────────────────────────────────────────────────


// ── Floor Control (Walk-On Prevention) ────────────────────────────────────────
// Server is the single source of truth for who holds the floor per talkgroup.
// Only ONE device may transmit on a talkgroup at a time.
// The server GRANTS or DENIES PTT_START and drops audio from non-holders.
interface FloorHolder {
  socket: WebSocket;
  senderId: string;
  sessionId: number;
  acquiredAt: number;
}
const talkgroupFloor = new Map<string, FloorHolder>();
const FLOOR_WATCHDOG_MS = 65_000; // auto-release floor after 65s (client MAX_TX_MS = 60s + margin)
let floorWatchdogInterval: ReturnType<typeof setInterval> | null = null;

function startFloorWatchdog() {
  if (floorWatchdogInterval) return;
  floorWatchdogInterval = setInterval(() => {
    const now = Date.now();
    for (const [tg, holder] of talkgroupFloor) {
      if (now - holder.acquiredAt > FLOOR_WATCHDOG_MS) {
        console.log(`[hub] floor watchdog: auto-releasing ${tg} held by ${holder.senderId} for ${now - holder.acquiredAt}ms`);
        releaseFloor(tg, holder.senderId);
      }
    }
  }, 10_000); // check every 10s
}

function releaseFloor(talkgroup: string, senderId?: string) {
  const holder = talkgroupFloor.get(talkgroup);
  if (!holder) return;
  // Only release if the requester is the actual holder (or force-release via watchdog/disconnect)
  if (senderId && holder.senderId !== senderId) return;
  sessionTalkgroup.delete(holder.sessionId);
  talkgroupFloor.delete(talkgroup);
  // Broadcast FLOOR_RELEASED so clients know the channel is free
  const releaseMsg = JSON.stringify({
    type: 'FLOOR_RELEASED',
    talkgroup,
    previousHolder: holder.senderId,
  });
  const room = rooms.get(talkgroup);
  if (room) {
    for (const peer of room) {
      if (peer.readyState === 1) peer.send(releaseMsg);
    }
  }
}

function releaseAllFloors(socket: WebSocket) {
  // Called on socket disconnect — release any floors held by this socket
  for (const [tg, holder] of talkgroupFloor) {
    if (holder.socket === socket) {
      console.log(`[hub] releasing floor for ${tg} (socket disconnected)`);
      releaseFloor(tg);
    }
  }
}
// ── End Floor Control ─────────────────────────────────────────────────────────

// Broadcast PRESENCE (list of online userIds) to all sockets in a talkgroup room
function broadcastPresence(talkgroup: string) {
  const room = rooms.get(talkgroup);
  if (!room || room.size === 0) return;

  const online = Array.from(room)
    .map(s => socketUser.get(s)?.userId)
    .filter(Boolean) as string[];

  const msg = JSON.stringify({ type: 'PRESENCE', talkgroup, online });
  for (const s of room) {
    if (s.readyState === 1) s.send(msg);
  }
}

// Send a message to everyone in a talkgroup except the sender
function fanOut(sender: WebSocket, talkgroup: string, raw: string, isAudio = false) {
  const room = rooms.get(talkgroup);
  if (!room) return;
  for (const peer of room) {
    if (peer !== sender) {
      const user = socketUser.get(peer);
      const peerUdp = user ? udpClients.get(user.userId) : undefined;

      // If it's an audio message and the peer has a registered UDP address, route via UDP
      if (isAudio && peerUdp) {
        udpServer.send(raw, peerUdp.port, peerUdp.address);
      } else if (peer.readyState === 1) {
        peer.send(raw);
      }
    }
  }
}

export async function registerHub(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, async (connection, req) => {
    // @fastify/websocket passes a SocketStream; the raw ws.WebSocket is at .socket
    const socket: WebSocket = (connection as any).socket;

    // Authenticate via query param: ws://host/ws?token=<jwt>
    const token = (req.query as any).token;
    let userId = '';
    let deviceId: string | null = null;

    try {
      const payload = app.jwt.verify(token) as any;
      userId = payload.sub;
    } catch {
      socket.close(1008, 'unauthorized');
      return;
    }

    // Look up device_id for GPS writes
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { device_id: true },
      });
      deviceId = user?.device_id ?? null;
    } catch {
      // DB lookup failed — continue without deviceId
    }

    socketUser.set(socket, { userId, deviceId });
    socketRooms.set(socket, new Set());

    // Start the floor watchdog on first connection
    startFloorWatchdog();

    socket.on('message', async (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const rawStr = raw.toString();

      switch (msg.type) {
        case 'GPS_UPDATE': {
          if (deviceId) {
            await prisma.gpsUpdate.create({
              data: { device_id: deviceId, lat: msg.lat, lng: msg.lng, alt: msg.alt },
            }).catch(() => {});
          }
          for (const tg of socketRooms.get(socket) ?? []) {
            fanOut(socket, tg, rawStr);
          }
          break;
        }

        case 'JOIN_TALKGROUP': {
          const tg: string = msg.talkgroup;
          if (!tg) break;
          if (!rooms.has(tg)) rooms.set(tg, new Set());
          rooms.get(tg)!.add(socket);
          socketRooms.get(socket)!.add(tg);
          broadcastPresence(tg);

          // If someone is already transmitting on this talkgroup,
          // notify the new joiner so they know the channel is busy.
          const currentHolder = talkgroupFloor.get(tg);
          if (currentHolder) {
            socket.send(JSON.stringify({
              type: 'FLOOR_GRANT',
              talkgroup: tg,
              winner: currentHolder.senderId,
              timestamp: currentHolder.acquiredAt,
            }));
          }
          break;
        }

        case 'LEAVE_TALKGROUP': {
          const tg: string = msg.talkgroup;
          if (!tg) break;
          rooms.get(tg)?.delete(socket);
          socketRooms.get(socket)?.delete(tg);
          broadcastPresence(tg);
          break;
        }

        case 'PTT_START': {
          const tg: string = msg.talkgroup;
          if (!tg) break;

          const existingHolder = talkgroupFloor.get(tg);

          // ── Walk-On Prevention ──────────────────────────────────────
          if (existingHolder) {
            if (existingHolder.socket === socket) {
              // Same device re-pressing PTT (idempotent) — update session
              sessionTalkgroup.delete(existingHolder.sessionId);
              if (typeof msg.sessionId === 'number') {
                sessionTalkgroup.set(msg.sessionId, tg);
                existingHolder.sessionId = msg.sessionId;
                existingHolder.acquiredAt = Date.now();
              }
              break;
            }
            // Floor is taken by another device → DENY this request
            console.log(`[hub] FLOOR_DENY: ${userId} denied on ${tg} (held by ${existingHolder.senderId})`);
            socket.send(JSON.stringify({
              type: 'FLOOR_DENY',
              talkgroup: tg,
              holder: existingHolder.senderId,
            }));
            break;
          }

          // Floor is free → GRANT
          if (typeof msg.sessionId === 'number') {
            sessionTalkgroup.set(msg.sessionId, tg);
          }
          talkgroupFloor.set(tg, {
            socket,
            senderId: msg.sender || userId,
            sessionId: msg.sessionId,
            acquiredAt: Date.now(),
          });

          // Send FLOOR_GRANT to the requester
          socket.send(JSON.stringify({
            type: 'FLOOR_GRANT',
            talkgroup: tg,
            winner: msg.sender || userId,
            timestamp: Date.now(),
          }));

          // Fan out PTT_START to all other peers in the talkgroup
          console.log(`[hub] FLOOR_GRANT: ${msg.sender || userId} on ${tg} (session 0x${(msg.sessionId || 0).toString(16).toUpperCase()})`);
          fanOut(socket, tg, rawStr);
          break;
        }

        case 'PTT_AUDIO': {
          // Audio chunks no longer include talkgroup — look it up from PTT_START
          const tg = sessionTalkgroup.get(msg.sessionId as number);
          if (!tg) break;

          // ── Walk-On Prevention: only relay audio from floor holder ──
          const holder = talkgroupFloor.get(tg);
          if (!holder || holder.socket !== socket) {
            // Drop audio from non-holder — this prevents walk-on audio
            break;
          }

          fanOut(socket, tg, rawStr, true); // true = isAudio, route over UDP if possible
          break;
        }

        case 'PTT_END': {
          const tg: string = msg.talkgroup;
          if (!tg) break;

          // ── Floor Release ──────────────────────────────────────────
          const holder = talkgroupFloor.get(tg);
          if (holder && holder.socket === socket) {
            releaseFloor(tg, holder.senderId);
            console.log(`[hub] floor released: ${tg} by ${holder.senderId}`);
          }
          // Clean up session routing entry (redundant safety — releaseFloor also does this)
          if (typeof msg.sessionId === 'number') {
            sessionTalkgroup.delete(msg.sessionId);
          }
          fanOut(socket, tg, rawStr);
          break;
        }

        case 'TEXT_MSG': {
          const tg: string = msg.talkgroup;
          if (!tg) break;
          fanOut(socket, tg, rawStr);
          break;
        }
      }
    });

    socket.on('close', () => {
      // Release any floors held by this socket before cleaning up
      releaseAllFloors(socket);
      for (const tg of socketRooms.get(socket) ?? []) {
        rooms.get(tg)?.delete(socket);
        broadcastPresence(tg);
      }
      socketRooms.delete(socket);
      socketUser.delete(socket);
    });
  });
}
