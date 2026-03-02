// WebSocket hub — fan-out relay. Receives messages, routes to talkgroup members.
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';
import type { WebSocket } from 'ws';

// talkgroup ID → set of connected sockets
const rooms = new Map<string, Set<WebSocket>>();
// socket → { userId, deviceId }
const socketUser = new Map<WebSocket, { userId: string; deviceId: string | null }>();
// socket → set of talkgroup IDs the socket has joined
const socketRooms = new Map<WebSocket, Set<string>>();

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
function fanOut(sender: WebSocket, talkgroup: string, raw: string) {
  const room = rooms.get(talkgroup);
  if (!room) return;
  for (const peer of room) {
    if (peer !== sender && peer.readyState === 1) {
      peer.send(raw);
    }
  }
}

export async function registerHub(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, async (socket, req) => {
    // Authenticate via query param: ws://host/ws?token=<jwt>
    const token = (req.query as any).token;
    let userId = '';
    let deviceId: string | null = null;

    try {
      const payload = app.jwt.verify(token) as any;
      userId = payload.sub; // sub = userId (see auth.ts)
    } catch {
      socket.close(1008, 'unauthorized');
      return;
    }

    // Look up device_id — needed to write GPS updates to the correct device row
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { device_id: true },
      });
      deviceId = user?.device_id ?? null;
    } catch {
      // DB lookup failed — continue without deviceId; GPS writes will be skipped
    }

    socketUser.set(socket, { userId, deviceId });
    socketRooms.set(socket, new Set());

    socket.on('message', async (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const rawStr = raw.toString();

      switch (msg.type) {
        case 'GPS_UPDATE': {
          // Persist to DB (best-effort — never crash the hub on a GPS write failure)
          if (deviceId) {
            await prisma.gpsUpdate.create({
              data: { device_id: deviceId, lat: msg.lat, lng: msg.lng, alt: msg.alt },
            }).catch(() => {});
          }
          // Fan out to all talkgroups this socket has joined so others can update their map
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

        // PTT and text messages: relay to all other members of the talkgroup
        case 'PTT_START':
        case 'PTT_AUDIO':
        case 'PTT_END':
        case 'TEXT_MSG': {
          const tg: string = msg.talkgroup;
          if (!tg) break;
          fanOut(socket, tg, rawStr);
          break;
        }

        // Unknown message types are silently ignored
      }
    });

    socket.on('close', () => {
      // Remove from all rooms and notify remaining members
      for (const tg of socketRooms.get(socket) ?? []) {
        rooms.get(tg)?.delete(socket);
        broadcastPresence(tg);
      }
      socketRooms.delete(socket);
      socketUser.delete(socket);
    });
  });
}
