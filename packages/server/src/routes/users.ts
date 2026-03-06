// User routes — admin view of all users
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';
import { disconnectUserSessions } from '../ws/hub.js';

export async function userRoutes(app: FastifyInstance) {
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

  // GET /users — list all users (admin only, never returns password_hash)
  app.get('/', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const users = await prisma.user.findMany({
      select: { id: true, username: true, role: true, created_at: true, device_id: true },
    });
    return { users };
  });

  const removeUserById = async (req: any, reply: any) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const requesterId = (req.user as any).sub;
    const { id } = req.params as any;
    if (!id) return reply.code(400).send({ error: 'missing_user_id' });
    if (String(id) === String(requesterId)) {
      return reply.code(400).send({ error: 'cannot_delete_self' });
    }

    const existing = await prisma.user.findUnique({
      where: { id: String(id) },
      select: { id: true, username: true },
    });
    if (!existing) return reply.code(404).send({ error: 'user_not_found' });

    const disconnectedSessions = disconnectUserSessions(existing.id);

    await prisma.$transaction([
      prisma.membership.deleteMany({ where: { user_id: existing.id } }),
      prisma.user.delete({ where: { id: existing.id } }),
    ]);

    return {
      ok: true,
      removed: {
        id: existing.id,
        username: existing.username,
      },
      disconnectedSessions,
    };
  };

  // DELETE /users/:id — permanently remove a user (admin only)
  app.delete('/:id', removeUserById);

  // POST /users/:id/remove — compatibility fallback for clients/environments
  // where DELETE requests are blocked/intercepted.
  app.post('/:id/remove', removeUserById);
}
