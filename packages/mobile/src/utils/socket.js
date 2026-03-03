// socket.js — PTT signaling via ForbiddenLANComms.
// Exports the same API as Annie's original mock socket so no UI code needs to change.
//
// ── Integration point for Shri's backend ─────────────────────────────────────
// When MOCK_MODE=false, call connectComms(jwt) after Shri's login:
//
//   import { connectComms } from './utils/socket';
//   const jwt = await fetch(`${CONFIG.API_URL}/auth/login`, { ... }).then(r => r.json()).then(d => d.jwt);
//   await connectComms(jwt);
//
// The natural place for this is inside ChannelContext.jsx (or a new useAuth hook)
// once Shri's /auth/login endpoint is live. See BACKEND_INTEGRATION.md for details.
// ─────────────────────────────────────────────────────────────────────────────
import { comms, initComms } from './comms';
import { CONFIG } from '../config';

// MVP Testing: auto-connect on import using the fake JWT from config.
// In production, this should be removed and connectComms(jwt) called explicitly after auth.
// initComms(CONFIG.MOCK_JWT).catch(err => console.warn('[comms] init error:', err));

/**
 * Connect to Shri's real relay with a JWT obtained from his /auth/login endpoint.
 * Call this once after successful login — idempotent, safe to await.
 *
 * @param {string} jwt - JWT returned by POST /auth/login
 * @returns {Promise<void>}
 */
export function connectComms(jwt) {
  return initComms(jwt);
}

// ── Mock user presence — keeps Annie's Channels/UserStatus UI lively ─────────
const MOCK_USERS = [
  { id: 'user1', name: 'Alice',   talking: false },
  { id: 'user2', name: 'Bob',     talking: false },
  { id: 'user3', name: 'Charlie', talking: false },
];
let _currentTalkingUser = null;

function _simulatePresence(callback) {
  setInterval(() => {
    const randomUser = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
    if (Math.random() < 0.3) {
      _currentTalkingUser = _currentTalkingUser === randomUser.id ? null : randomUser.id;
    }
    MOCK_USERS.forEach(user => callback({
      id: user.id, name: user.name, talking: user.id === _currentTalkingUser,
    }));
  }, 3000);
}

export function subscribeToUserActivity(callback) {
  // Simulated presence keeps the UI lively while no real backend is connected
  // _simulatePresence(callback);
  
  // Real PRESENCE messages from the relay also surface here
  comms.onMessage((msg) => {
    if (msg.type === 'PRESENCE' && Array.isArray(msg.online)) {
      callback({ id: msg.talkgroup, name: msg.talkgroup, talking: false });
    }
  });
}

export function emitStartTalking(userId) {
  console.log(`[comms] PTT start — device: ${userId}`);
  comms.startPTT();
}

export function emitStopTalking(userId) {
  console.log(`[comms] PTT stop — device: ${userId}`);
  comms.stopPTT();
}

export function disconnect() {
  comms.disconnect();
}

export default null;
