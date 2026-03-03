// WebSocket hub — fan-out relay. Receives messages, routes to talkgroup members.
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';
import type { WebSocket } from 'ws';

// talkgroup ID → set of connected raw WebSockets
const rooms = new Map<string, Set<WebSocket>>();
// raw WebSocket → { userId, deviceId }
const socketUser = new Map<WebSocket, { userId: string; deviceId: string | null }>();
// raw WebSocket → set of talkgroup IDs the socket has joined
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

        case 'PTT_START':
        case 'PTT_AUDIO':
        case 'PTT_END':
        case 'TEXT_MSG': {
          const tg: string = msg.talkgroup;
          if (!tg) break;
          fanOut(socket, tg, rawStr);
          break;
        }
      }
    });

    socket.on('close', () => {
      for (const tg of socketRooms.get(socket) ?? []) {
        rooms.get(tg)?.delete(socket);
        broadcastPresence(tg);
      }
      socketRooms.delete(socket);
      socketUser.delete(socket);
    });
  });
}
