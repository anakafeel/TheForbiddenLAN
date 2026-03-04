/**
 * SkyTalk app configuration.
 *
 * All values come from EXPO_PUBLIC_* environment variables set in .env.
 * Change values via .env files — never hardcode in source.
 *
 * On React Native / Expo, environment variables are injected via
 * Expo's babel plugin at build time and available via process.env.
 *
 * After login returns a JWT, call:
 *   import { connectComms } from './utils/socket';
 *   await connectComms(jwt);
 */

/** Returns a stable device ID using Math.random (no localStorage on native). */
function _stableDeviceId() {
  // On native we can't use localStorage; a simple unique ID per app launch is fine.
  // For production, use expo-secure-store.
  return 'dev-' + Math.random().toString(36).slice(2, 10);
}

export const CONFIG = {
  // ── Network ───────────────────────────────────────────────────────────────
  WS_URL:     process.env.EXPO_PUBLIC_WS_URL     ?? 'ws://134.122.32.45:3000/ws',
  API_URL:    process.env.EXPO_PUBLIC_API_URL     ?? 'http://134.122.32.45:3000',
  DLS140_URL: process.env.EXPO_PUBLIC_DLS140_URL  ?? 'http://192.168.111.1:3000',

  // ── Identity ──────────────────────────────────────────────────────────────
  DEVICE_ID:  process.env.EXPO_PUBLIC_DEVICE_ID   ?? _stableDeviceId(),
  TALKGROUP:  process.env.EXPO_PUBLIC_TALKGROUP   ?? undefined,
};

export default CONFIG;
