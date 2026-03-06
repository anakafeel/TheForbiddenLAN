// Talkgroup routes — REST shim over the operation log.
// Returns the same response shapes as the old CRUD routes so the mobile app works unchanged.
// Reads materialize from the op log; writes append operations.
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';
import { materializeState } from '../services/materialize.js';
import { randomBytes } from 'crypto';

// appendOp — duplicated here to avoid circular dependency with hub.ts.
// When the REST shim is removed (after mobile gets SQLite), this goes away too.
async function appendOp(type: string, payload: any, issuedBy: string, signature: string) {
  const op = await prisma.operation.create({
    data: { type, payload, issued_by: issuedBy, signature },
  });
  console.log(`[shim] op seq=${op.seq} type=${op.type} by=${issuedBy}`);
  return op;
}

export async function talkgroupRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: 'unauthorized' }); }
  });

  // GET /talkgroups — admins see all talkgroups; users see only their own
  app.get('/', async (req) => {
    const userId = (req.user as any).sub;
    const role = (req.user as any).role;
    const state = await materializeState();

    if (role === 'admin') {
      return { talkgroups: Array.from(state.talkgroups.values()) };
    }

    const talkgroups: any[] = [];
    for (const [tgId, members] of state.memberships) {
      if (members.has(userId)) {
        const tg = state.talkgroups.get(tgId);
        if (tg) talkgroups.push(tg);
      }
    }
    return { talkgroups };
  });

  // POST /talkgroups — create a new talkgroup (admin only)
  app.post('/', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const userId = (req.user as any).sub;
    const { name } = req.body as any;
    if (!name) return reply.code(400).send({ error: 'missing_name' });

    // Check for duplicate name
    const state = await materializeState();
    for (const tg of state.talkgroups.values()) {
      if (tg.name === name) return reply.code(409).send({ error: 'name_taken' });
    }

    const talkgroupId = crypto.randomUUID();
    const masterSecret = randomBytes(32).toString('base64');

    const op = await appendOp('ADMIN_CREATE_TALKGROUP', { talkgroupId, name, masterSecret }, userId, 'auto');
    // Auto-add the creator as a member
    await appendOp('ADMIN_ADD_MEMBER', { talkgroupId, userId, site: 'HQ' }, userId, 'auto');

    return {
      talkgroup: {
        id: talkgroupId,
        name,
        master_secret: Buffer.from(masterSecret, 'base64'),
        rotation_counter: 0,
        created_at: op.issued_at,
      },
    };
  });

  // POST /talkgroups/:id/join — join a talkgroup
  app.post('/:id/join', async (req) => {
    const userId = (req.user as any).sub;
    const { id } = req.params as any;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { device: true },
    });
    const site = (user as any)?.device?.site ?? 'unknown';

    await appendOp('ADMIN_ADD_MEMBER', { talkgroupId: id, userId, site }, userId, 'auto');

    return { membership: { user_id: userId, talkgroup_id: id, site } };
  });

  // DELETE /talkgroups/:id/leave — leave a talkgroup
  app.delete('/:id/leave', async (req) => {
    const userId = (req.user as any).sub;
    const { id } = req.params as any;

    await appendOp('ADMIN_REMOVE_MEMBER', { talkgroupId: id, userId }, userId, 'auto');

    return { ok: true };
  });

  // GET /talkgroups/:id/members — list members of a talkgroup
  app.get('/:id/members', async (req, reply) => {
    const { id } = req.params as any;
    const state = await materializeState();

    if (!state.talkgroups.has(id)) return reply.code(404).send({ error: 'talkgroup_not_found' });

    const memberIds = state.memberships.get(id) ?? new Set<string>();
    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(memberIds) } },
      select: { id: true, username: true, role: true },
    });

    return { members: users };
  });

  // POST /talkgroups/:id/members — admin adds a user to a talkgroup
  app.post('/:id/members', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const adminId = (req.user as any).sub;
    const { id } = req.params as any;
    const { userId } = req.body as any;
    if (!userId) return reply.code(400).send({ error: 'missing_userId' });

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { device: true } });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const site = (user as any).device?.site ?? 'unknown';

    await appendOp('ADMIN_ADD_MEMBER', { talkgroupId: id, userId, site }, adminId, 'auto');

    return { membership: { user_id: userId, talkgroup_id: id, site } };
  });

  // DELETE /talkgroups/:id/members/:userId — admin removes a user from a talkgroup
  app.delete('/:id/members/:userId', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const adminId = (req.user as any).sub;
    const { id, userId } = req.params as any;

    await appendOp('ADMIN_REMOVE_MEMBER', { talkgroupId: id, userId }, adminId, 'auto');

    return { ok: true };
  });

  // DELETE /talkgroups/:id — delete a talkgroup (admin only)
  app.delete('/:id', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const adminId = (req.user as any).sub;
    const { id } = req.params as any;

    const state = await materializeState();
    if (!state.talkgroups.has(id)) return reply.code(404).send({ error: 'talkgroup_not_found' });

    await appendOp('ADMIN_DELETE_TALKGROUP', { talkgroupId: id }, adminId, 'auto');

    return { ok: true };
  });
}