// Device routes — list, activate/disable devices (admin), GPS read/write
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';

export async function deviceRoutes(app: FastifyInstance) {
  // All routes require JWT
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: 'unauthorized' }); }
  });

  // GET /devices — list all registered devices (admin only)
  app.get('/', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const devices = await prisma.device.findMany();
    return { devices };
  });

  // PATCH /devices/:id/status — activate or disable a device (admin only)
  app.patch('/:id/status', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const { id } = req.params as any;
    const { active } = req.body as any;
    if (typeof active !== 'boolean') return reply.code(400).send({ error: 'active_must_be_boolean' });

    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) return reply.code(404).send({ error: 'device_not_found' });

    const updated = await prisma.device.update({ where: { id }, data: { active } });
    return { device: updated };
  });

  // GET /devices/:id/gps — last known GPS for a device
  app.get('/:id/gps', async (req, reply) => {
    const { id } = req.params as any;

    const gps = await prisma.gpsUpdate.findFirst({
      where: { device_id: id },
      orderBy: { updated_at: 'desc' },
    });
    if (!gps) return reply.code(404).send({ error: 'no_gps_data' });
    return { gps };
  });

  // POST /devices/:id/gps — store a GPS update for a device
  app.post('/:id/gps', async (req, reply) => {
    const { id } = req.params as any;
    const { lat, lng, alt } = req.body as any;
    if (lat == null || lng == null || alt == null) {
      return reply.code(400).send({ error: 'missing_fields' });
    }

    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) return reply.code(404).send({ error: 'device_not_found' });

    const gps = await prisma.gpsUpdate.create({
      data: { device_id: id, lat, lng, alt },
    });
    return { gps };
  });
}
