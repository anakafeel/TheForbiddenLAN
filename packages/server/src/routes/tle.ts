import type { FastifyPluginAsync } from 'fastify';
import { getIridiumTles } from '../services/tleFetcher.js';

export const tleRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /tle/iridium
  // Returns the raw TLE text file from Celestrak (cached by the server for 12h)
  fastify.get('/iridium', async (request, reply) => {
    try {
      // Must be authenticated to access TLEs
      await request.jwtVerify();
      const tles = await getIridiumTles();
      reply.type('text/plain').send(tles);
    } catch (err) {
      reply.status(500).send({ error: 'Failed to fetch TLEs' });
    }
  });
};
