// User routes — admin view of all users
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import prisma from '../db/client.js';
import { disconnectUserSessions } from '../ws/hub.js';
import { getUserProfile, upsertUserProfile } from '../services/userProfiles.js';
import { AVATARS_DIR } from '../constants.js';

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const userId = (req.user as any)?.sub;
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });

    const activeUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!activeUser) return reply.code(401).send({ error: 'user_not_found' });
  });

  // GET /users/me/profile — current user's profile details used by user panel
  app.get('/me/profile', async (req, reply) => {
    const userId = (req.user as any).sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    return { profile: await getUserProfile(user.id, user.username) };
  });

  // POST /users/me/profile/avatar — scoped multipart upload, returns { avatar_url }
  // We register @fastify/multipart only inside this nested scope so it does NOT
  // interfere with the JSON body parser used by the other routes in this plugin.
  await app.register(async (scope) => {
    await scope.register(fastifyMultipart, { limits: { fileSize: 5 * 1024 * 1024 } });

    scope.post('/me/profile/avatar', async (req, reply) => {
      const userId = (req.user as any).sub;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true },
      });
      if (!user) return reply.code(404).send({ error: 'user_not_found' });

      const file = await (req as any).file();
      if (!file) return reply.code(400).send({ error: 'no_file' });

      const ext = ALLOWED_MIME[file.mimetype];
      if (!ext) return reply.code(400).send({ error: 'unsupported_image_type' });

      const filename = `${user.id}.${ext}`;
      const dest = path.join(AVATARS_DIR, filename);

      const buffer = await file.toBuffer();
      fs.writeFileSync(dest, buffer);

      // Remove any old avatar with a different extension
      for (const old of Object.values(ALLOWED_MIME)) {
        if (old === ext) continue;
        const oldPath = path.join(AVATARS_DIR, `${user.id}.${old}`);
        try { fs.unlinkSync(oldPath); } catch { /* not found, ignore */ }
      }

      const avatar_url = `/avatars/${filename}`;
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const photo_url = host ? `${proto}://${host}${avatar_url}` : avatar_url;
      const profile = await upsertUserProfile(user.id, user.username, {
        photo_url,
      });
      return { avatar_url, profile };
    });
  });

  // PUT /users/me/profile — update profile details (display name, callsign, photo, status)
  app.put('/me/profile', async (req, reply) => {
    const userId = (req.user as any).sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const body = (req.body ?? {}) as any;
    const profile = await upsertUserProfile(user.id, user.username, {
      display_name: body.display_name,
      callsign: body.callsign,
      photo_url: body.photo_url,
      status_message: body.status_message,
    });

    return { profile };
  });

  // GET /users — list all users (admin only, never returns password_hash)
  app.get('/', async (req, reply) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    // Try selecting profile columns; fall back to base columns if migration hasn't run yet.
    let rawUsers: any[];
    try {
      rawUsers = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          created_at: true,
          device_id: true,
          display_name: true,
          callsign: true,
          photo_url: true,
          status_message: true,
          profile_updated_at: true,
        },
      });
    } catch {
      rawUsers = await prisma.user.findMany({
        select: { id: true, username: true, role: true, created_at: true, device_id: true },
      });
    }

    const users = rawUsers.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      created_at: u.created_at,
      device_id: u.device_id,
      profile: {
        display_name: u.display_name || u.username,
        callsign: u.callsign || u.username.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8),
        photo_url: u.photo_url || '',
        status_message: u.status_message || '',
        updated_at: (u.profile_updated_at ?? u.created_at)?.toISOString?.() ?? new Date().toISOString(),
      },
    }));
    return { users };
  });

  const removeUserById = async (req: any, reply: any) => {
    const role = (req.user as any).role;
    if (role !== 'admin') return reply.code(403).send({ error: 'forbidden' });

    const requesterId = (req.user as any).sub;
    const { id } = req.params as any;
    if (!id) return reply.code(400).send({ error: 'missing_user_id' });
    if (String(id) === String(requesterId)) {
      return reply.code(400).send({ error: 'cannot_delete_self' });
    }

    const target = String(id);
    let existing = await prisma.user.findUnique({
      where: { id: target },
      select: { id: true, username: true },
    });
    if (!existing) {
      existing = await prisma.user.findUnique({
        where: { username: target },
        select: { id: true, username: true },
      });
    }
    if (!existing) return reply.code(404).send({ error: 'user_not_found' });
    if (existing.id === requesterId) {
      return reply.code(400).send({ error: 'cannot_delete_self' });
    }

    const disconnectedSessions = disconnectUserSessions(existing.id);

    for (const ext of Object.values(ALLOWED_MIME)) {
      const avatarPath = path.join(AVATARS_DIR, `${existing.id}.${ext}`);
      try {
        fs.unlinkSync(avatarPath);
      } catch {
        // Avatar file may not exist; ignore cleanup misses.
      }
    }

    // Profile columns are deleted automatically with the user row.
    await prisma.$transaction([
      prisma.membership.deleteMany({ where: { user_id: existing.id } }),
      prisma.user.delete({ where: { id: existing.id } }),
    ]);

    return {
      ok: true,
      removed: {
        id: existing.id,
        username: existing.username,
      },
      disconnectedSessions,
    };
  };

  // DELETE /users/:id — permanently remove a user (admin only)
  app.delete('/:id', removeUserById);

  // POST /users/:id/remove — compatibility fallback for clients/environments
  // where DELETE requests are blocked/intercepted.
  app.post('/:id/remove', removeUserById);
}
