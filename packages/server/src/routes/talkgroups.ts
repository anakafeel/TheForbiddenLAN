// Talkgroup routes — CRUD for talkgroups, membership management
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';
import { randomBytes } from 'crypto';
import { getUserProfile } from '../services/userProfiles.js';

export async function talkgroupRoutes(app: FastifyInstance) {
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

  // GET /talkgroups — list talkgroups the authenticated user belongs to
  app.get('/', async (req) => {
    const userId = (req.user as any).sub;
    const role = (req.user as any).role;

    if (role === 'admin') {
      const talkgroups = await prisma.talkgroup.findMany();
      return { talkgroups };
    }

    const memberships = await prisma.membership.findMany({
      where: { user_id: userId },
      include: { talkgroup: true },
    });
    return { talkgroups: memberships.map(m => m.talkgroup) };
  });

  // POST /talkgroups — create a new talkgroup (admin only)
  app.post('/', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const { name } = req.body as any;
    if (!name) return reply.code(400).send({ error: 'missing_name' });

    const existing = await prisma.talkgroup.findUnique({ where: { name } });
    if (existing) return reply.code(409).send({ error: 'name_taken' });

    const talkgroup = await prisma.talkgroup.create({
      data: { name, master_secret: randomBytes(32), rotation_counter: 0 },
    });
    return { talkgroup };
  });

  // POST /talkgroups/:id/join — join a talkgroup
  app.post('/:id/join', async (req, reply) => {
    const userId = (req.user as any).sub;
    const { id } = req.params as any;

    const talkgroup = await prisma.talkgroup.findUnique({ where: { id } });
    if (!talkgroup) return reply.code(404).send({ error: 'talkgroup_not_found' });

    // Get site from user's device; fall back to 'unknown' if no device assigned
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { device: true },
    });
    const site = user?.device?.site ?? 'unknown';

    const membership = await prisma.membership.upsert({
      where: { user_id_talkgroup_id: { user_id: userId, talkgroup_id: id } },
      update: {},
      create: { user_id: userId, talkgroup_id: id, site },
    });
    return { membership };
  });

  // DELETE /talkgroups/:id/leave — leave a talkgroup
  app.delete('/:id/leave', async (req, reply) => {
    const userId = (req.user as any).sub;
    const { id } = req.params as any;

    await prisma.membership.deleteMany({
      where: { user_id: userId, talkgroup_id: id },
    });
    return { ok: true };
  });

  // GET /talkgroups/:id/members — list members of a talkgroup
  app.get('/:id/members', async (req, reply) => {
    const requesterId = (req.user as any).sub;
    const requesterRole = (req.user as any).role;
    const { id } = req.params as any;

    const talkgroup = await prisma.talkgroup.findUnique({ where: { id } });
    if (!talkgroup) return reply.code(404).send({ error: 'talkgroup_not_found' });

    if (requesterRole !== 'admin') {
      const membership = await prisma.membership.findUnique({
        where: { user_id_talkgroup_id: { user_id: requesterId, talkgroup_id: id } },
        select: { user_id: true },
      });
      if (!membership) return reply.code(403).send({ error: 'forbidden' });
    }

    const memberships = await prisma.membership.findMany({
      where: { talkgroup_id: id },
      include: { user: { select: { id: true, username: true, role: true } } },
    });
    return {
      members: memberships.map((membership) => ({
        ...membership.user,
        profile: getUserProfile(membership.user.id, membership.user.username),
      })),
    };
  });

  // POST /talkgroups/:id/members — admin adds a user to a talkgroup
  app.post('/:id/members', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const { id } = req.params as any;
    const { userId } = req.body as any;
    if (!userId) return reply.code(400).send({ error: 'missing_userId' });

    const talkgroup = await prisma.talkgroup.findUnique({ where: { id } });
    if (!talkgroup) return reply.code(404).send({ error: 'talkgroup_not_found' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { device: true },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const site = user.device?.site ?? 'unknown';

    const membership = await prisma.membership.upsert({
      where: { user_id_talkgroup_id: { user_id: userId, talkgroup_id: id } },
      update: {},
      create: { user_id: userId, talkgroup_id: id, site },
    });
    return { membership };
  });

  // DELETE /talkgroups/:id/members/:userId — admin removes a user from a talkgroup
  app.delete('/:id/members/:userId', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const { id, userId } = req.params as any;

    await prisma.membership.deleteMany({
      where: { user_id: userId, talkgroup_id: id },
    });
    return { ok: true };
  });

  // DELETE /talkgroups/:id — delete a talkgroup (admin only)
  app.delete('/:id', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const { id } = req.params as any;

    const talkgroup = await prisma.talkgroup.findUnique({ where: { id } });
    if (!talkgroup) return reply.code(404).send({ error: 'talkgroup_not_found' });

    await prisma.talkgroup.delete({ where: { id } });
    return { ok: true };
  });
}
