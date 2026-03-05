// GPS routes — minimal REST endpoint for admin portal to read GPS positions
import type { FastifyInstance } from 'fastify';
import prisma from '../db/client.js';

export async function gpsRoutes(app: FastifyInstance) {
  // All routes require JWT
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: 'unauthorized' }); }
  });

  // GET /gps/:deviceId — last known GPS for a device
  app.get('/:deviceId', async (req, reply) => {
    const { deviceId } = req.params as any;

    const gps = await prisma.gpsUpdate.findFirst({
      where: { device_id: deviceId },
      orderBy: { updated_at: 'desc' },
    });
    if (!gps) return reply.code(404).send({ error: 'no_gps_data' });
    return { gps };
  });
}
