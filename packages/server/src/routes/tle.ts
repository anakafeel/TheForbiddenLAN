import type { FastifyPluginAsync } from 'fastify';
import prisma from '../db/client.js';
import { getIridiumTles } from '../services/tleFetcher.js';

export const tleRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /tle/iridium
  // Returns the raw TLE text file from Celestrak (cached by the server for 12h)
  fastify.get('/iridium', async (request, reply) => {
    try {
      // Must be authenticated to access TLEs
      await request.jwtVerify();
      const userId = (request.user as any)?.sub;
      if (!userId) return reply.status(401).send({ error: 'unauthorized' });

      const activeUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!activeUser) return reply.status(401).send({ error: 'user_not_found' });

      const tles = await getIridiumTles();
      return reply.type('text/plain').send(tles);
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to fetch TLEs' });
    }
  });
};
