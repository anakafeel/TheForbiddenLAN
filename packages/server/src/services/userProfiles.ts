import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROFILE_STORE = path.resolve(__dirname, '../../data/user-profiles.json');
const PROFILE_STORE_PATH = process.env.USER_PROFILE_STORE_PATH
  ? path.resolve(process.env.USER_PROFILE_STORE_PATH)
  : DEFAULT_PROFILE_STORE;

const profiles = new Map<string, UserProfileSnapshot>();
let loaded = false;

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

function baseProfile(username: string): UserProfileSnapshot {
  return {
    display_name: username,
    callsign: fallbackCallsign(username),
    photo_url: '',
    status_message: '',
    updated_at: new Date().toISOString(),
  };
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;

  try {
    const raw = fs.readFileSync(PROFILE_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, Partial<UserProfileSnapshot>>;

    for (const [userId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue;

      profiles.set(userId, {
        display_name: cleanText(value.display_name, 64),
        callsign: cleanText(value.callsign, 16).toUpperCase(),
        photo_url: cleanText(value.photo_url, 2048),
        status_message: cleanText(value.status_message, 280),
        updated_at:
          typeof value.updated_at === 'string' && value.updated_at.trim()
            ? value.updated_at
            : new Date().toISOString(),
      });
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.warn('[userProfiles] Failed loading persisted profiles:', err);
    }
  }
}

function persistProfiles() {
  try {
    const dir = path.dirname(PROFILE_STORE_PATH);
    fs.mkdirSync(dir, { recursive: true });

    const serialized: Record<string, UserProfileSnapshot> = {};
    for (const [userId, profile] of profiles.entries()) {
      serialized[userId] = profile;
    }

    const tempPath = `${PROFILE_STORE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(serialized, null, 2), 'utf8');
    fs.renameSync(tempPath, PROFILE_STORE_PATH);
  } catch (err) {
    console.warn('[userProfiles] Failed persisting profiles:', err);
  }
}

export function getUserProfile(userId: string, username: string): UserProfileSnapshot {
  ensureLoaded();
  const stored = profiles.get(userId);
  if (!stored) return baseProfile(username);

  return {
    display_name: stored.display_name || username,
    callsign: stored.callsign || fallbackCallsign(username),
    photo_url: stored.photo_url || '',
    status_message: stored.status_message || '',
    updated_at: stored.updated_at || new Date().toISOString(),
  };
}

export function upsertUserProfile(userId: string, username: string, patch: UserProfilePatch): UserProfileSnapshot {
  ensureLoaded();
  const current = getUserProfile(userId, username);

  const next: UserProfileSnapshot = {
    display_name: cleanText(patch.display_name, 64) || current.display_name || username,
    callsign: cleanText(patch.callsign, 16).toUpperCase() || current.callsign || fallbackCallsign(username),
    photo_url: cleanText(patch.photo_url, 2048),
    status_message: cleanText(patch.status_message, 280),
    updated_at: new Date().toISOString(),
  };

  profiles.set(userId, next);
  persistProfiles();
  return next;
}

