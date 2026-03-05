// Key routes — REST shim over the operation log.
// Rotation counter is materialized from ADMIN_ROTATE_KEY operations.
// Rotate writes a new operation instead of updating a Talkgroup row.
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';
import { materializeState } from '../services/materialize.js';

async function appendOp(type: string, payload: any, issuedBy: string, signature: string) {
  const op = await prisma.operation.create({
    data: { type, payload, issued_by: issuedBy, signature },
  });
  console.log(`[shim] op seq=${op.seq} type=${op.type} by=${issuedBy}`);
  return op;
}

export async function keyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: 'unauthorized' }); }
  });

  // GET /keys/rotation?talkgroupId=x — get current rotation counter for a talkgroup
  app.get('/rotation', async (req, reply) => {
    const { talkgroupId } = req.query as any;
    if (!talkgroupId) return reply.code(400).send({ error: 'missing_talkgroupId' });

    const state = await materializeState();
    const tg = state.talkgroups.get(talkgroupId);
    if (!tg) return reply.code(404).send({ error: 'talkgroup_not_found' });

    return { talkgroupId, counter: tg.rotation_counter };
  });

  // POST /keys/rotate — increment rotation counter (admin only)
  app.post('/rotate', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const adminId = (req.user as any).sub;
    const { talkgroupId } = req.body as any;
    if (!talkgroupId) return reply.code(400).send({ error: 'missing_talkgroupId' });

    const state = await materializeState();
    const tg = state.talkgroups.get(talkgroupId);
    if (!tg) return reply.code(404).send({ error: 'talkgroup_not_found' });

    const newCounter = tg.rotation_counter + 1;
    await appendOp('ADMIN_ROTATE_KEY', { talkgroupId, newCounter }, adminId, 'auto');

    return { counter: newCounter };
  });
}
