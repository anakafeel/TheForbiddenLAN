// Talkgroup routes — CRUD for talkgroups, membership management
import type { FastifyInstance } from 'fastify';
import { supabase } from '../db/supabase.js';
import { randomBytes } from 'crypto';

export async function talkgroupRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: 'unauthorized' }); }
  });

  app.get('/', async (req) => {
    const user = (req.user as any).sub;
    const { data } = await supabase
      .from('memberships').select('talkgroup_id, talkgroups(*)').eq('user_id', user);
    return data ?? [];
  });

  app.post('/', async (req, reply) => {
    const { name } = req.body as any;
    if (!name) return reply.code(400).send({ error: 'missing_name' });
    const master_secret = randomBytes(32);
    const { data, error } = await supabase
      .from('talkgroups').insert({ name, master_secret, rotation_counter: 0 }).select().single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  app.post('/:id/join', async (req) => {
    const user = (req.user as any).sub;
    const { id } = req.params as any;
    await supabase.from('memberships').upsert({ user_id: user, talkgroup_id: id });
    return { ok: true };
  });

  app.get('/:id/members', async (req) => {
    const { id } = req.params as any;
    const { data } = await supabase
      .from('memberships').select('user_id, users(username)').eq('talkgroup_id', id);
    return data ?? [];
  });
}
