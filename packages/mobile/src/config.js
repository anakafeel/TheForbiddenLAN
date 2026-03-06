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

/** Returns a stable device ID that survives Fast Refresh / hot reload. */
function _stableDeviceId() {
  // Persist on global so Metro Fast Refresh doesn't generate a new ID each cycle.
  // For production, use expo-secure-store.
  if (!global.__DEVICE_ID__) {
    global.__DEVICE_ID__ = "dev-" + Math.random().toString(36).slice(2, 10);
  }
  return global.__DEVICE_ID__;
}

export const CONFIG = {
  // ── Network ───────────────────────────────────────────────────────────────
  // LOCAL DEV: hardcoded to local server for UDP testing.
  // Production: ws://134.122.32.45:3000/ws, http://134.122.32.45:3000
  WS_URL: process.env.EXPO_PUBLIC_WS_URL ?? "ws://192.168.2.133:3000/ws",
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.2.133:3000",
  DLS140_URL: process.env.EXPO_PUBLIC_DLS140_URL ?? "http://192.168.111.1:3000",

  // ── Identity ──────────────────────────────────────────────────────────────
  DEVICE_ID: process.env.EXPO_PUBLIC_DEVICE_ID ?? _stableDeviceId(),
  TALKGROUP: process.env.EXPO_PUBLIC_TALKGROUP ?? undefined,

  // ── Integrations ──────────────────────────────────────────────────────────
  DISCORD_GUILD_ID: process.env.EXPO_PUBLIC_DISCORD_GUILD_ID ?? undefined,
  DISCORD_CHANNEL_MAP: process.env.EXPO_PUBLIC_DISCORD_CHANNEL_MAP ?? undefined,
  DISCORD_INVITE_URL: process.env.EXPO_PUBLIC_DISCORD_INVITE_URL ?? undefined,
};

export default CONFIG;
