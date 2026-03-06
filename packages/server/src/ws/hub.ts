// WebSocket hub — fan-out relay. Receives messages, routes to talkgroup members.
// Includes server-authoritative floor control to prevent walk-ons.
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';
import type { WebSocket } from 'ws';
import dgram from 'dgram';

// talkgroup ID → set of connected raw WebSockets
const rooms = new Map<string, Set<WebSocket>>();
// raw WebSocket → { userId, deviceId, senderDeviceId }
// userId = JWT sub (database ID), deviceId = DB device_id, senderDeviceId = CONFIG.DEVICE_ID from mobile
const socketUser = new Map<WebSocket, { userId: string; deviceId: string | null; senderDeviceId: string | null }>();
// raw WebSocket → set of talkgroup IDs the socket has joined
const socketRooms = new Map<WebSocket, Set<string>>();
// sessionId (4-byte int from PTT_START) → talkgroup — used to route PTT_AUDIO
// without requiring talkgroup on every audio chunk (bandwidth optimisation)
const sessionTalkgroup = new Map<number, string>();
// Reverse lookup: senderDeviceId → WebSocket (for matching UDP registrations to WS connections)
const deviceIdToSocket = new Map<string, WebSocket>();

/**
 * Force close all active WebSocket sessions for a given JWT user id.
 * Used by admin user deletion so removed users are disconnected immediately.
 */
export function disconnectUserSessions(userId: string, reason = 'user_removed') {
  let disconnected = 0;
  for (const [socket, userMeta] of socketUser.entries()) {
    if (userMeta.userId !== userId) continue;
    disconnected += 1;
    try {
      socket.close(1008, reason);
    } catch (_) {
      // ignore close errors — close event cleanup still handles map cleanup when possible
    }
  }
  if (disconnected > 0) {
    console.log(`[hub] disconnected ${disconnected} socket(s) for removed user ${userId}`);
  }
  return disconnected;
}

// ── UDP Transport Layer ───────────────────────────────────────────────────────
export const udpServer = dgram.createSocket('udp4');
// userId → remote UDP address/port
export const udpClients = new Map<string, dgram.RemoteInfo>();

let udpAudioRelayCount = 0;

export function startUdpServer(options: { port: number }) {
  udpServer.on('message', (msg, rinfo) => {
    let parsed: any;
    try { parsed = JSON.parse(msg.toString()); } catch { return; }

    if (parsed.type === 'UDP_REGISTER') {
      if (parsed.userId) {
        const isNew = !udpClients.has(parsed.userId);
        udpClients.set(parsed.userId, rinfo);
        if (isNew) {
          console.log(`[hub] UDP_REGISTER: userId=${parsed.userId} from ${rinfo.address}:${rinfo.port} (total: ${udpClients.size})`);
        }
        // Also register by the WS userId if we can resolve it
        // (senderDeviceId from PTT_START → WebSocket → JWT userId)
        const ws = deviceIdToSocket.get(parsed.userId);
        if (ws) {
          const wsUser = socketUser.get(ws);
          if (wsUser && wsUser.userId !== parsed.userId) {
            udpClients.set(wsUser.userId, rinfo);
            console.log(`[hub] UDP_REGISTER: also mapped JWT userId=${wsUser.userId} → ${rinfo.address}:${rinfo.port}`);
          }
        }
      }
      return;
    }

    if (parsed.type === 'PTT_AUDIO') {
      // DEBUG: Log what we received
      if (parsed.chunk <= 2) {
        console.log(`[hub] UDP PTT_AUDIO received: session=0x${((parsed.sessionId as number) || 0).toString(16)} chunk=${parsed.chunk} sender=${parsed.sender || 'MISSING'} talkgroup=${parsed.talkgroup || 'MISSING'}`);
      }
      
      let tg = sessionTalkgroup.get(parsed.sessionId as number);

      // ── Fallback: recover talkgroup from message if session lookup misses ──
      // This catches race conditions (UDP arrives before WS PTT_START is processed)
      // and server-restart scenarios (in-memory sessionTalkgroup map was cleared).
      if (!tg && parsed.talkgroup) {
        tg = parsed.talkgroup as string;
        if (typeof parsed.sessionId === 'number') {
          sessionTalkgroup.set(parsed.sessionId, tg);
        }
        console.warn(`[hub] UDP PTT_AUDIO: session 0x${((parsed.sessionId as number) || 0).toString(16)} not in map — recovered tg from message: ${tg}`);
      }

      if (!tg) {
        if (parsed.chunk <= 2) console.warn(`[hub] UDP PTT_AUDIO: DROPPED chunk=${parsed.chunk} — no talkgroup (session=0x${((parsed.sessionId as number) || 0).toString(16)})`);
        return;
      }

      const holder = talkgroupFloor.get(tg);
      if (!holder) {
        if (parsed.chunk <= 2) console.warn(`[hub] UDP PTT_AUDIO: DROPPED chunk=${parsed.chunk} — no floor holder for tg=${tg}`);
        return;
      }

      if (holder.sessionId !== parsed.sessionId) {
        // Session mismatch — verify sender by UDP address or by sender field in the message
        const holderUdp = udpClients.get(holder.senderId);
        const senderMatchByUdp = holderUdp && holderUdp.address === rinfo.address && holderUdp.port === rinfo.port;
        // Also check if sender field in message matches holder
        const senderMatchById = parsed.sender && (parsed.sender === holder.senderId);
        
        if (!senderMatchByUdp && !senderMatchById) {
          if (parsed.chunk <= 2) console.warn(`[hub] UDP PTT_AUDIO: DROPPED chunk=${parsed.chunk} — session mismatch (holder=0x${(holder.sessionId || 0).toString(16)} vs pkt=0x${((parsed.sessionId as number) || 0).toString(16)}) and sender mismatch (holder=${holder.senderId} vs msg.sender=${parsed.sender || 'none'})`);
          return;
        }
        // Same sender, update session
        sessionTalkgroup.delete(holder.sessionId);
        if (typeof parsed.sessionId === 'number') {
          sessionTalkgroup.set(parsed.sessionId, tg);
          holder.sessionId = parsed.sessionId;
        }
        console.warn(`[hub] UDP PTT_AUDIO: session updated for holder ${holder.senderId} → 0x${((parsed.sessionId as number) || 0).toString(16)}`);
      }

      // Update sender's UDP address just in case
      udpClients.set(holder.senderId, rinfo);

      const room = rooms.get(tg);
      if (!room) return;

      let wsRelayed = 0;
      let udpRelayed = 0;
      for (const peer of room) {
        const user = socketUser.get(peer);
        if (!user) continue;
        // Skip the sender — compare by both JWT userId AND senderDeviceId
        if (user.userId === holder.senderId || user.senderDeviceId === holder.senderId) continue;

        // Look up peer's UDP endpoint by senderDeviceId first, then JWT userId
        const peerUdp = (user.senderDeviceId ? udpClients.get(user.senderDeviceId) : undefined)
          || udpClients.get(user.userId);
        
        if (peerUdp) {
          udpAudioRelayCount++;
          udpRelayed++;
          if (udpAudioRelayCount <= 5 || udpAudioRelayCount % 500 === 0) {
            console.log(`[hub] UDP relay #${udpAudioRelayCount}: chunk=${parsed.chunk} → ${user.senderDeviceId || user.userId} (${peerUdp.address}:${peerUdp.port})`);
          }
          udpServer.send(new Uint8Array(msg), peerUdp.port, peerUdp.address);
        } else {
          // Log when peer has no UDP registered - this is a common failure point
          if (parsed.chunk <= 2) {
            console.warn(`[hub] UDP PTT_AUDIO: NO UDP endpoint for peer ${user.senderDeviceId || user.userId} (registered: ${Array.from(udpClients.keys()).join(', ')})`);
          }
        }
        // Always deliver via WebSocket too — guarantees receipt if UDP is blocked by NAT.
        // Client deduplicates by sessionId+chunk so double delivery is silent.
        if (peer.readyState === 1) {
          peer.send(msg.toString());
          wsRelayed++;
        }
      }

      // Log relay summary for first few chunks and periodically
      if (parsed.chunk <= 2 || parsed.chunk % 200 === 0) {
        console.log(`[hub] PTT_AUDIO relay: chunk=${parsed.chunk} → UDP:${udpRelayed} WS:${wsRelayed} | room=${room.size} | session=0x${((parsed.sessionId as number) || 0).toString(16)} | holder=${holder.senderId}`);
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
      // Look up peer's UDP endpoint by senderDeviceId first, then JWT userId
      const peerUdp = user
        ? ((user.senderDeviceId ? udpClients.get(user.senderDeviceId) : undefined) || udpClients.get(user.userId))
        : undefined;

      // If it's an audio message and the peer has a registered UDP address, also send via UDP
      if (isAudio && peerUdp) {
        udpServer.send(raw, peerUdp.port, peerUdp.address);
      }
      // Always deliver via WebSocket — guarantees receipt if UDP is blocked by NAT.
      // Client deduplicates by sessionId+chunk so double delivery is silent.
      if (peer.readyState === 1) {
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

    // Look up device_id for GPS writes and ensure user still exists.
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { device_id: true },
      });
      if (!user) {
        socket.close(1008, 'user_not_found');
        return;
      }
      deviceId = user?.device_id ?? null;
    } catch {
      socket.close(1011, 'server_error');
      return;
    }

    socketUser.set(socket, { userId, deviceId, senderDeviceId: null });
    socketRooms.set(socket, new Set());

    // Start the floor watchdog on first connection
    startFloorWatchdog();

    socket.on('message', async (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const rawStr = raw.toString();

      // Track sender device ID from any message that includes a 'sender' field.
      // This bridges the CONFIG.DEVICE_ID (used in UDP_REGISTER) with the JWT userId
      // (used in socketUser) so the UDP relay can find the correct peer endpoint.
      if (msg.sender && typeof msg.sender === 'string') {
        const existingUser = socketUser.get(socket);
        if (existingUser) {
          const isNewSenderId = existingUser.senderDeviceId !== msg.sender;
          existingUser.senderDeviceId = msg.sender;
          deviceIdToSocket.set(msg.sender, socket);
          
          // Bridge any existing UDP registration for this deviceId to the JWT userId
          const existingUdp = udpClients.get(msg.sender);
          if (existingUdp && existingUser.userId !== msg.sender) {
            udpClients.set(existingUser.userId, existingUdp);
            console.log(`[hub] Bridged UDP endpoint: ${msg.sender} → JWT userId ${existingUser.userId} (addr: ${existingUdp.address}:${existingUdp.port})`);
          } else if (isNewSenderId) {
            console.log(`[hub] Sender device updated: ${msg.sender} for JWT userId ${existingUser.userId}`);
          }
        }
      }

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

          // Track the sender's device ID (CONFIG.DEVICE_ID from mobile app)
          // so we can bridge it with the JWT userId for UDP relay lookups
          const senderDeviceId = msg.sender || userId;
          const existingUser = socketUser.get(socket);
          if (existingUser && msg.sender) {
            existingUser.senderDeviceId = msg.sender;
            deviceIdToSocket.set(msg.sender, socket);
            // If we already have a UDP registration for this device ID,
            // also register it under the JWT userId for future lookups
            const existingUdp = udpClients.get(msg.sender);
            if (existingUdp && existingUser.userId !== msg.sender) {
              udpClients.set(existingUser.userId, existingUdp);
              console.log(`[hub] Bridged UDP endpoint: ${msg.sender} → JWT userId ${existingUser.userId}`);
            }
          }

          talkgroupFloor.set(tg, {
            socket,
            senderId: senderDeviceId,
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
          console.log(`[hub] State: sessions=${sessionTalkgroup.size}, udpClients=${udpClients.size}, room[${tg}]=${rooms.get(tg)?.size ?? 0}, deviceIdToSocket=${deviceIdToSocket.size}`);
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
      const closingUser = socketUser.get(socket);
      if (closingUser?.senderDeviceId) {
        deviceIdToSocket.delete(closingUser.senderDeviceId);
      }
      for (const tg of socketRooms.get(socket) ?? []) {
        rooms.get(tg)?.delete(socket);
        broadcastPresence(tg);
      }
      socketRooms.delete(socket);
      socketUser.delete(socket);
    });
  });
}
