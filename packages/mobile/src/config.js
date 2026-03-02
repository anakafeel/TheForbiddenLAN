/**
 * SkyTalk app configuration.
 *
 * All integration points for switching mock ↔ real backend live here.
 * Change values via .env files — never hardcode in source.
 *
 * ─────────────────────────────────────────────────────────────────
 * MOCK MODE (current — no backend needed)
 * ─────────────────────────────────────────────────────────────────
 *   VITE_MOCK_MODE=true  (default)
 *   Uses MockRelaySocket. onRawMessage() used for loopback so you
 *   can hear your own voice echoed back in the browser.
 *
 * ─────────────────────────────────────────────────────────────────
 * SWITCHING TO SHRI'S REAL BACKEND
 * ─────────────────────────────────────────────────────────────────
 *   1. Create packages/mobile/.env.local (gitignored) with:
 *        VITE_MOCK_MODE=false
 *        VITE_WS_URL=ws://<shri-server>:<port>
 *        VITE_API_URL=http://<shri-server>:<port>
 *
 *   2. After Shri's login returns a JWT, call:
 *        import { connectComms } from './utils/socket';
 *        await connectComms(jwt);
 *      The natural place for this is after a successful POST /auth/login
 *      (e.g. in ChannelContext.jsx or a new useAuth hook).
 *
 *   3. That's it. No other code changes needed.
 * ─────────────────────────────────────────────────────────────────
 */

function _bool(envVal, fallback) {
  if (envVal === undefined || envVal === '') return fallback;
  return envVal !== 'false' && envVal !== '0';
}

/** Returns a stable device ID persisted in localStorage across reloads. */
function _stableDeviceId() {
  try {
    const key = 'skytalk_device_id';
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    // Generate once and persist — crypto.randomUUID() is available in all modern browsers
    const id = 'dev-' + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10));
    localStorage.setItem(key, id);
    return id;
  } catch {
    return 'dev-fallback';
  }
}

export const CONFIG = {
  // ── Core switch ───────────────────────────────────────────────────────────
  // true  → MockRelaySocket, no backend, auto-connect with MOCK_JWT
  // false → Real WebSocket to Shri's server, JWT required via connectComms(jwt)
  MOCK_MODE: _bool(import.meta.env.VITE_MOCK_MODE, true),

  // ── Network ───────────────────────────────────────────────────────────────
  WS_URL:     import.meta.env.VITE_WS_URL     ?? 'ws://localhost:9999',
  API_URL:    import.meta.env.VITE_API_URL    ?? 'http://localhost:3000',
  DLS140_URL: import.meta.env.VITE_DLS140_URL ?? 'http://192.168.111.1:3000',

  // ── Identity ──────────────────────────────────────────────────────────────
  // Stable per-browser UUID, overridable via env for fixed test identities
  DEVICE_ID:  import.meta.env.VITE_DEVICE_ID  ?? _stableDeviceId(),
  TALKGROUP:  import.meta.env.VITE_TALKGROUP  ?? 'alpha',

  // ── Mock-only ─────────────────────────────────────────────────────────────
  // Ignored when MOCK_MODE=false
  MOCK_JWT:   import.meta.env.VITE_MOCK_JWT   ?? 'fake-jwt',
};

export default CONFIG;
