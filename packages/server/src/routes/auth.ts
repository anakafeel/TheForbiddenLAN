// Auth routes — register device, login, return JWT
import type { FastifyInstance } from 'fastify';
import { supabase } from '../db/supabase.js';
import { createHash } from 'crypto';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const { username, password, serial } = req.body as any;
    if (!username || !password || !serial) return reply.code(400).send({ error: 'missing_fields' });
    const hash = createHash('sha256').update(password).digest('hex');
    const { data, error } = await supabase
      .from('users').insert({ username, password_hash: hash }).select().single();
    if (error) return reply.code(500).send({ error: error.message });
    const jwt = app.jwt.sign({ sub: data.id, username, role: 'operator' });
    return { jwt };
  });

  app.post('/login', async (req, reply) => {
    const { username, password } = req.body as any;
    const hash = createHash('sha256').update(password ?? '').digest('hex');
    const { data } = await supabase
      .from('users').select().eq('username', username).eq('password_hash', hash).single();
    if (!data) return reply.code(401).send({ error: 'invalid_credentials' });
    const jwt = app.jwt.sign({ sub: data.id, username, role: data.role });
    return { jwt };
  });
}
