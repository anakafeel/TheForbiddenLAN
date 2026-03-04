const fs = require('fs');
const filepath = 'packages/mobile/src/utils/socket.js';
let code = fs.readFileSync(filepath, 'utf8');

// replace mock simulated presence
code = code.replace(
  `export function subscribeToUserActivity(callback) {\n  // Simulated presence keeps the UI lively while no real backend is connected\n  _simulatePresence(callback);`,
  `export function subscribeToUserActivity(callback) {
  // Simulated presence keeps the UI lively while no real backend is connected
  // _simulatePresence(callback);`
);

// replace auto connect
code = code.replace(
  `// MVP Testing: auto-connect on import using the fake JWT from config.\n// In production, this should be removed and connectComms(jwt) called explicitly after auth.\ninitComms(CONFIG.MOCK_JWT).catch(err => console.warn('[comms] init error:', err));`,
  `// MVP Testing: auto-connect on import using the fake JWT from config.
// In production, this should be removed and connectComms(jwt) called explicitly after auth.
// initComms(CONFIG.MOCK_JWT).catch(err => console.warn('[comms] init error:', err));`
);

fs.writeFileSync(filepath, code);
