import { CONFIG } from '../config';

let socket = null;

// Only import socket.io-client when not in mock mode
if (!CONFIG.MOCK_MODE) {
  import('socket.io-client').then(({ default: io }) => {
    socket = io(CONFIG.SOCKET_URL);
  }).catch(err => {
    console.warn('socket.io-client not available:', err);
  });
}

// Mock user activity data for testing
const MOCK_USERS = [
  { id: 'user1', name: 'Alice', talking: false },
  { id: 'user2', name: 'Bob', talking: false },
  { id: 'user3', name: 'Charlie', talking: false },
];

let currentTalkingUser = null;

// Simulate user talking activity
function simulateUserActivity(callback) {
  if (!CONFIG.MOCK_MODE) return;
  
  setInterval(() => {
    // Randomly pick a user to talk
    const randomUser = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
    
    // 30% chance to start/stop talking
    if (Math.random() < 0.3) {
      currentTalkingUser = currentTalkingUser === randomUser.id ? null : randomUser.id;
    }
    
    // Send updated activity for all users
    MOCK_USERS.forEach(user => {
      callback({
        id: user.id,
        name: user.name,
        talking: user.id === currentTalkingUser,
      });
    });
  }, 3000);
}

export function subscribeToUserActivity(callback) {
  if (CONFIG.MOCK_MODE) {
    simulateUserActivity(callback);
  } else if (socket) {
    socket.on('user-activity', callback);
  }
}

export function emitStartTalking(userId) {
  if (CONFIG.MOCK_MODE) {
    currentTalkingUser = userId;
    console.log(`[MOCK] ${userId} started talking`);
  } else if (socket) {
    socket.emit('start-talking', { userId });
  }
}

export function emitStopTalking(userId) {
  if (CONFIG.MOCK_MODE) {
    if (currentTalkingUser === userId) {
      currentTalkingUser = null;
    }
    console.log(`[MOCK] ${userId} stopped talking`);
  } else if (socket) {
    socket.emit('stop-talking', { userId });
  }
}

export function disconnect() {
  if (socket) {
    socket.disconnect();
  }
}

export default socket;
