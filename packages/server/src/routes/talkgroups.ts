// Talkgroup routes — CRUD for talkgroups, membership management
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';
import { randomBytes } from 'crypto';

export async function talkgroupRoutes(app: FastifyInstance) {
  // All routes require JWT
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: 'unauthorized' }); }
  });

  // GET /talkgroups — list talkgroups the authenticated user belongs to
  app.get('/', async (req) => {
    const userId = (req.user as any).sub;
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
    const { id } = req.params as any;

    const talkgroup = await prisma.talkgroup.findUnique({ where: { id } });
    if (!talkgroup) return reply.code(404).send({ error: 'talkgroup_not_found' });

    const memberships = await prisma.membership.findMany({
      where: { talkgroup_id: id },
      include: { user: { select: { id: true, username: true, role: true } } },
    });
    return { members: memberships.map(m => m.user) };
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
