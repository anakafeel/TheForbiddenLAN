// User routes — admin view of all users
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: 'unauthorized' }); }
  });

  // GET /users — list all users (admin only, never returns password_hash)
  app.get('/', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const users = await prisma.user.findMany({
      select: { id: true, username: true, role: true, created_at: true, device_id: true },
    });
    return { users };
  });
}
