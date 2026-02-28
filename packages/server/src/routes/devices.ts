// Device routes — list, activate, disable devices (admin only)
import type { FastifyInstance } from 'fastify';
import { supabase } from '../db/supabase.js';

export async function deviceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: 'unauthorized' }); }
  });

  app.get('/', async () => {
    const { data } = await supabase.from('devices').select('*');
    return data ?? [];
  });

  app.patch('/:id/status', async (req, reply) => {
    const { id } = req.params as any;
    const { active } = req.body as any;
    const { data, error } = await supabase
      .from('devices').update({ active }).eq('id', id).select().single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  app.get('/:id/gps', async (req) => {
    const { id } = req.params as any;
    const { data } = await supabase
      .from('gps_updates').select('*').eq('device_id', id).single();
    return data ?? null;
  });
}
