// Key routes — rotation counter for group key derivation
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';

export async function keyRoutes(app: FastifyInstance) {
  // All routes require JWT
  app.addHook('onRequest', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const userId = (req.user as any)?.sub;
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });

    const activeUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!activeUser) return reply.code(401).send({ error: 'user_not_found' });
  });

  // GET /keys/rotation?talkgroupId=x — get current rotation counter for a talkgroup
  app.get('/rotation', async (req, reply) => {
    const { talkgroupId } = req.query as any;
    if (!talkgroupId) return reply.code(400).send({ error: 'missing_talkgroupId' });

    const talkgroup = await prisma.talkgroup.findUnique({
      where: { id: talkgroupId },
      select: { rotation_counter: true },
    });
    if (!talkgroup) return reply.code(404).send({ error: 'talkgroup_not_found' });

    return { talkgroupId, counter: talkgroup.rotation_counter };
  });

  // POST /keys/rotate — increment rotation counter (admin only)
  // Uses a transaction: increment counter + write audit log atomically
  app.post('/rotate', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const { talkgroupId } = req.body as any;
    if (!talkgroupId) return reply.code(400).send({ error: 'missing_talkgroupId' });

    const talkgroup = await prisma.talkgroup.findUnique({ where: { id: talkgroupId } });
    if (!talkgroup) return reply.code(404).send({ error: 'talkgroup_not_found' });

    const newCounter = await prisma.$transaction(async (tx) => {
      const updated = await tx.talkgroup.update({
        where: { id: talkgroupId },
        data: { rotation_counter: { increment: 1 } },
      });
      await tx.keyRotation.create({
        data: { talkgroup_id: talkgroupId, counter: updated.rotation_counter },
      });
      return updated.rotation_counter;
    });

    return { counter: newCounter };
  });
}
