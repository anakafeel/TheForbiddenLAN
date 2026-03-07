// @forbiddenlan/server — Fastify relay server entry point
import 'dotenv/config';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { authRoutes } from './routes/auth.js';
import { talkgroupRoutes } from './routes/talkgroups.js';
import { deviceRoutes } from './routes/devices.js';
import { keyRoutes } from './routes/keys.js';
import { userRoutes } from './routes/users.js';
import { tleRoutes } from './routes/tle.js';
import { monitoringRoutes } from './routes/monitoring.js';
import { registerHub, startUdpServer } from './ws/hub.js';
import { AVATARS_DIR } from './constants.js';

const app = Fastify({ logger: true });

await app.register(fastifyCors, { origin: true });
await app.register(fastifyJwt, { secret: process.env.JWT_SECRET ?? 'dev-secret' });
await app.register(fastifyWebsocket);
await app.register(fastifyStatic, { root: AVATARS_DIR, prefix: '/avatars/' });

app.get('/ping', async () => ({ pong: true }));

// REST routes
await app.register(authRoutes,       { prefix: '/auth' });
await app.register(talkgroupRoutes,  { prefix: '/talkgroups' });
await app.register(deviceRoutes,     { prefix: '/devices' });
await app.register(keyRoutes,        { prefix: '/keys' });
await app.register(userRoutes,       { prefix: '/users' });
await app.register(tleRoutes,        { prefix: '/tle' });
await app.register(monitoringRoutes, { prefix: '/monitoring' });

// WebSocket hub
await registerHub(app);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`ForbiddenLAN relay server listening on :${port}`);

startUdpServer({ port });
