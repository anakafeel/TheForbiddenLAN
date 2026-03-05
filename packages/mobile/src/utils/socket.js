// socket.js — PTT signaling bridge between UI and ForbiddenLANComms.
// LoginScreen calls connectComms(jwt) after authenticating with the backend.
import {
  comms,
  initComms,
  notifyTxStart,
  notifyTxEnd,
  getFloorState,
} from "./comms";

/**
 * Connect to the relay server with a JWT obtained from POST /auth/login.
 * Call this once after successful login — idempotent, safe to await.
 *
 * @param {string} jwt - JWT returned by POST /auth/login
 * @returns {Promise<void>}
 */
export function connectComms(jwt) {
  return initComms(jwt);
}

export function subscribeToUserActivity(callback) {
  comms.onMessage((msg) => {
    if (msg.type === "PRESENCE" && Array.isArray(msg.online)) {
      callback({ id: msg.talkgroup, name: msg.talkgroup, talking: false });
    }
  });
}

export function joinChannel(channelId) {
  if (channelId) {
    comms.joinTalkgroup(channelId);
  }
}

export function emitStartTalking(userId, channelId) {
  // Walk-on prevention: check if someone else holds the floor
  const floorState = getFloorState();
  if (floorState.busy && floorState.holder !== userId) {
    console.warn(
      `[comms] PTT BLOCKED — channel busy (held by ${floorState.holder})`,
    );
    return false; // signal to UI that PTT was denied
  }
  console.log(`[comms] PTT start — device: ${userId} | channel: ${channelId}`);
  // Dynamically join the active UI channel before transmitting
  if (channelId) comms.joinTalkgroup(channelId);
  notifyTxStart(); // tell comms.js RX pipeline we are transmitting (half-duplex + loopback)
  comms.startPTT();
  return true; // signal to UI that PTT was accepted (server may still deny)
}

export function emitStopTalking(userId, channelId) {
  console.log(`[comms] PTT stop — device: ${userId} | channel: ${channelId}`);
  comms.stopPTT();
  // Notify RX pipeline that TX ended — triggers loopback playback if enabled
  notifyTxEnd();
}

export function disconnect() {
  comms.disconnect();
}

export default null;
