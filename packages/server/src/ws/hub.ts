// WebSocket hub — fan-out relay. Receives messages, routes to talkgroup members.
import type { FastifyInstance } from 'fastify';
import { supabase } from '../db/supabase.js';
import type { WebSocket } from 'ws';

// talkgroup ID → set of connected sockets
const rooms = new Map<string, Set<WebSocket>>();
// socket → device ID
const socketDevice = new WeakMap<WebSocket, string>();

export async function registerHub(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    // Auth via query param token
    const token = (req.query as any).token;
    let deviceId = 'unknown';
    try {
      const payload = app.jwt.verify(token) as any;
      deviceId = payload.sub;
    } catch {
      socket.close(1008, 'unauthorized');
      return;
    }
    socketDevice.set(socket, deviceId);

    socket.on('message', async (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // Track GPS updates into Supabase
      if (msg.type === 'GPS_UPDATE') {
        await supabase.from('gps_updates').upsert({
          device_id: deviceId, lat: msg.lat, lng: msg.lng, alt: msg.alt, updated_at: new Date(),
        });
      }

      // Fan out to everyone in talkgroup
      const tg = msg.talkgroup;
      if (!tg) return;
      if (!rooms.has(tg)) rooms.set(tg, new Set());
      rooms.get(tg)!.add(socket);

      for (const peer of rooms.get(tg)!) {
        if (peer !== socket && peer.readyState === 1) {
          peer.send(raw);
        }
      }
    });

    socket.on('close', () => {
      rooms.forEach(room => room.delete(socket));
    });
  });
}
