/**
 * ws shim for React Native
 *
 * The `ws` npm package is a Node.js server-side WebSocket library.
 * It depends on Node built-ins (stream, net, tls) that don't exist in React Native.
 *
 * React Native has a built-in WebSocket implementation that follows the browser API.
 * This shim re-exports the global WebSocket so any import of 'ws' in a shared
 * package (@forbiddenlan/comms) works transparently on native.
 */
const WS = global.WebSocket || globalThis.WebSocket;
module.exports = WS;
module.exports.default = WS;
module.exports.WebSocket = WS;
