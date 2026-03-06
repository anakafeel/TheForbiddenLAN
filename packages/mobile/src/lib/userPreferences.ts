import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { ConnectionMode } from '../store';

const STORAGE_KEY = 'forbiddenlan:user-preferences:v1';
const STORAGE_FILE = 'forbiddenlan-user-preferences.json';

export interface UserPreferencesSnapshot {
  preferredConnection: ConnectionMode;
}

function getStorageUri(): string | null {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? null;
  if (!baseDir) return null;
  return `${baseDir}${STORAGE_FILE}`;
}

function normalizeSnapshot(value: unknown): UserPreferencesSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;

  const preferredConnection =
    payload.preferredConnection === 'satellite' ? 'satellite' : 'cellular';

  return {
    preferredConnection,
  };
}

export async function loadUserPreferences(): Promise<UserPreferencesSnapshot | null> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeSnapshot(JSON.parse(raw));
    }

    const uri = getStorageUri();
    if (!uri) return null;

    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;

    const raw = await FileSystem.readAsStringAsync(uri);
    if (!raw) return null;

    return normalizeSnapshot(JSON.parse(raw));
  } catch (err) {
    console.warn('[userPreferences] Failed to load preferences:', err);
    return null;
  }
}

export async function saveUserPreferences(snapshot: UserPreferencesSnapshot): Promise<void> {
  try {
    const raw = JSON.stringify(snapshot);

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, raw);
      return;
    }

    const uri = getStorageUri();
    if (!uri) return;
    await FileSystem.writeAsStringAsync(uri, raw);
  } catch (err) {
    console.warn('[userPreferences] Failed to save preferences:', err);
  }
}
