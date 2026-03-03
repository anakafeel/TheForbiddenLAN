/**
 * SkyTalk app configuration.
 *
 * All integration points for switching mock ↔ real backend live here.
 * Change values via .env files — never hardcode in source.
 *
 * On React Native / Expo, environment variables are injected via
 * Expo's babel plugin at build time and available via process.env.
 * (Note: Vite's import.meta.env is web-only and crashes on native.)
 *
 * ─────────────────────────────────────────────────────────────────
 * MOCK MODE (current — no backend needed)
 * ─────────────────────────────────────────────────────────────────
 *   EXPO_PUBLIC_MOCK_MODE=true  (default)
 *   Uses MockRelaySocket. onRawMessage() used for loopback so you
 *   can hear your own voice echoed back.
 *
 * ─────────────────────────────────────────────────────────────────
 * SWITCHING TO REAL BACKEND
 * ─────────────────────────────────────────────────────────────────
 *   1. Create packages/mobile/.env with:
 *        EXPO_PUBLIC_MOCK_MODE=false
 *        EXPO_PUBLIC_WS_URL=ws://<server>:<port>
 *        EXPO_PUBLIC_API_URL=http://<server>:<port>
 *
 *   2. After login returns a JWT, call:
 *        import { connectComms } from './utils/socket';
 *        await connectComms(jwt);
 *
 *   3. That's it. No other code changes needed.
 * ─────────────────────────────────────────────────────────────────
 */

function _bool(envVal, fallback) {
  if (envVal === undefined || envVal === '') return fallback;
  return envVal !== 'false' && envVal !== '0';
}

/** Returns a stable device ID using Math.random (no localStorage on native). */
function _stableDeviceId() {
  // On native we can't use localStorage; a simple unique ID per app launch is fine
  // for hackathon/demo purposes. For production, use expo-secure-store.
  return 'dev-' + Math.random().toString(36).slice(2, 10);
}

// Expo injects EXPO_PUBLIC_* vars via process.env at bundle time.
// Falls back to the older VITE_* names for backwards compat (ignored on native).
export const CONFIG = {
  // ── Core switch ───────────────────────────────────────────────────────────
  MOCK_MODE: _bool(process.env.EXPO_PUBLIC_MOCK_MODE ?? process.env.VITE_MOCK_MODE, true),

  // ── Network ───────────────────────────────────────────────────────────────
  WS_URL:     process.env.EXPO_PUBLIC_WS_URL     ?? process.env.VITE_WS_URL     ?? 'ws://localhost:9999',
  API_URL:    process.env.EXPO_PUBLIC_API_URL    ?? process.env.VITE_API_URL    ?? 'http://localhost:3000',
  DLS140_URL: process.env.EXPO_PUBLIC_DLS140_URL ?? process.env.VITE_DLS140_URL ?? 'http://192.168.111.1:3000',

  // ── Identity ──────────────────────────────────────────────────────────────
  DEVICE_ID:  process.env.EXPO_PUBLIC_DEVICE_ID  ?? _stableDeviceId(),
  TALKGROUP:  process.env.EXPO_PUBLIC_TALKGROUP  ?? process.env.VITE_TALKGROUP  ?? 'alpha',

  // ── Mock-only ─────────────────────────────────────────────────────────────
  MOCK_JWT:   process.env.EXPO_PUBLIC_MOCK_JWT   ?? 'fake-jwt',
};

export default CONFIG;
