import type { FastifyInstance } from 'fastify';
import {
  getMonitoringStartedAtISO,
  getMonitoringUptimeSeconds,
  listMonitoringEvents,
} from '../services/monitoring.js';
import { getHubMonitoringMetrics } from '../ws/hub.js';

function clampLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 150;
  return Math.max(10, Math.min(500, Math.floor(parsed)));
}

export async function monitoringRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const role = (req.user as any)?.role;
    if (role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden' });
    }
  });

  app.get('/snapshot', async (req) => {
    const limit = clampLimit((req.query as any)?.limit);
    return {
      generated_at: new Date().toISOString(),
      started_at: getMonitoringStartedAtISO(),
      uptime_seconds: getMonitoringUptimeSeconds(),
      metrics: getHubMonitoringMetrics(),
      logs: listMonitoringEvents(limit),
    };
  });

  app.get('/logs', async (req) => {
    const limit = clampLimit((req.query as any)?.limit);
    return { logs: listMonitoringEvents(limit) };
  });
}
