// Crypto shim for React Native — re-exports the global crypto object
// The actual crypto polyfill (react-native-quick-crypto) is installed in index.js
// before any modules are loaded. This shim just provides a reference for Metro
// when code imports 'crypto'.

if (typeof global.crypto === 'undefined') {
  console.error('[crypto shim] global.crypto is undefined! Did react-native-quick-crypto fail to install?');
  module.exports = {};
} else {
  module.exports = global.crypto;
}

