// Key routes — rotation counter for group key derivation
import type { FastifyInstance } from 'fastify';
import { supabase } from '../db/supabase.js';

export async function keyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: 'unauthorized' }); }
  });

  app.get('/rotation', async (req) => {
    const { talkgroup_id } = req.query as any;
    const { data } = await supabase
      .from('talkgroups').select('rotation_counter').eq('id', talkgroup_id).single();
    return { counter: data?.rotation_counter ?? 0 };
  });

  app.post('/rotate', async (req) => {
    const { talkgroup_id } = req.body as any;
    const { data } = await supabase
      .rpc('increment_rotation_counter', { tg_id: talkgroup_id });
    return { counter: data };
  });
}
