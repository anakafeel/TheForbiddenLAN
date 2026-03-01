// @forbiddenlan/server — Fastify relay server entry point
import 'dotenv/config';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { authRoutes } from './routes/auth.js';
import { talkgroupRoutes } from './routes/talkgroups.js';
import { deviceRoutes } from './routes/devices.js';
import { keyRoutes } from './routes/keys.js';
import { registerHub } from './ws/hub.js';

const app = Fastify({ logger: true });

await app.register(fastifyCors, { origin: true });
await app.register(fastifyJwt, { secret: process.env.JWT_SECRET ?? 'dev-secret' });
await app.register(fastifyWebsocket);

// REST routes
await app.register(authRoutes,       { prefix: '/auth' });
await app.register(talkgroupRoutes,  { prefix: '/talkgroups' });
await app.register(deviceRoutes,     { prefix: '/devices' });
await app.register(keyRoutes,        { prefix: '/keys' });

// WebSocket hub
await registerHub(app);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`ForbiddenLAN relay server listening on :${port}`);
