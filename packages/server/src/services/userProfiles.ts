import prisma from '../db/client.js';

export interface UserProfileSnapshot {
  display_name: string;
  callsign: string;
  photo_url: string;
  status_message: string;
  updated_at: string;
}

interface UserProfilePatch {
  display_name?: unknown;
  callsign?: unknown;
  photo_url?: unknown;
  status_message?: unknown;
}

function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function fallbackCallsign(username: string): string {
  return username
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 8);
}

export async function getUserProfile(userId: string, username: string): Promise<UserProfileSnapshot> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        display_name: true,
        callsign: true,
        photo_url: true,
        status_message: true,
        profile_updated_at: true,
      },
    });

    return {
      display_name: row?.display_name || username,
      callsign: row?.callsign || fallbackCallsign(username),
      photo_url: row?.photo_url || '',
      status_message: row?.status_message || '',
      updated_at: row?.profile_updated_at?.toISOString() ?? new Date().toISOString(),
    };
  } catch {
    // Profile columns not yet in DB — return safe defaults until migration runs.
    return {
      display_name: username,
      callsign: fallbackCallsign(username),
      photo_url: '',
      status_message: '',
      updated_at: new Date().toISOString(),
    };
  }
}

export async function upsertUserProfile(
  userId: string,
  username: string,
  patch: UserProfilePatch,
): Promise<UserProfileSnapshot> {
  const current = await getUserProfile(userId, username);

  const display_name = cleanText(patch.display_name, 64) || current.display_name || username;
  const callsign =
    cleanText(patch.callsign, 16).toUpperCase() || current.callsign || fallbackCallsign(username);
  const photo_url = cleanText(patch.photo_url, 4096);
  const status_message = cleanText(patch.status_message, 280);
  const now = new Date();

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { display_name, callsign, photo_url, status_message, profile_updated_at: now },
    });
  } catch (err: any) {
    // If the profile columns don't exist yet (migration not run), surface a clear error
    // instead of a cryptic Prisma crash.
    const msg: string = err?.message ?? '';
    if (
      msg.includes('column') ||
      msg.includes('Unknown argument') ||
      msg.includes('does not exist')
    ) {
      throw Object.assign(new Error('Profile columns missing — run: prisma db push'), {
        statusCode: 503,
      });
    }
    throw err;
  }

  return { display_name, callsign, photo_url, status_message, updated_at: now.toISOString() };
}

