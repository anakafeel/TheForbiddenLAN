import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import prisma from '../db/client.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const { username, password, deviceSerial, site } = req.body as any;
    if (!username || !password) return reply.code(400).send({ error: 'missing_fields' });

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return reply.code(409).send({ error: 'username_taken' });

    const password_hash = await bcrypt.hash(password, 10);

    let deviceId: string | undefined;
    if (deviceSerial) {
      const device = await prisma.device.upsert({
        where:  { serial: deviceSerial },
        update: {},
        create: { serial: deviceSerial, name: username, site: site ?? '', active: true },
      });
      deviceId = device.id;
    }

    const role = username === 'admin' ? 'admin' : 'user';
    const user = await prisma.user.create({
      data: { username, password_hash, role, device_id: deviceId },
    });

    const jwt = app.jwt.sign({ sub: user.id, username, role: user.role });
    return { jwt, userId: user.id };
  });

  app.post('/login', async (req, reply) => {
    const { username, password } = req.body as any;
    if (!username || !password) return reply.code(400).send({ error: 'missing_fields' });

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return reply.code(401).send({ error: 'invalid_credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return reply.code(401).send({ error: 'invalid_credentials' });

    const jwt = app.jwt.sign({ sub: user.id, username, role: user.role });
    return { jwt };
  });

  app.post('/changepassword', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'unauthorized' }); }

    const { oldpassword, newpassword } = req.body as any;
    if (!newpassword) return reply.code(400).send({ error: 'missing_fields' });

    const userId = (req.user as any).sub;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    if (oldpassword) {
      const valid = await bcrypt.compare(oldpassword, user.password_hash);
      if (!valid) return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const password_hash = await bcrypt.hash(newpassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { password_hash } });
    return { ok: true };
  });
}
