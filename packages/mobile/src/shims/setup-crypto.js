// setup-crypto.js — Polyfill Web Crypto API for React Native
// This must be imported before any code that uses crypto.subtle (including @forbiddenlan/comms)
//
// For MVP/MOCK_MODE: Provides pass-through "encryption" (no actual crypto)
// TODO: Implement real AES-GCM using a pure-JS library like @noble/ciphers for production

import 'react-native-get-random-values';

// Initialize global.crypto if not present
if (typeof global.crypto === 'undefined') {
  global.crypto = {};
}

// Ensure crypto.getRandomValues is available
if (typeof global.crypto.getRandomValues === 'undefined') {
  // react-native-get-random-values should provide this
  // Fallback to Math.random if not available
  global.crypto.getRandomValues = (array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  };
}

// Polyfill crypto.subtle with pass-through "encryption" for MVP
// In production, replace this with a real AES-GCM implementation
if (typeof global.crypto.subtle === 'undefined') {
  global.crypto.subtle = {
    async importKey(format, keyData, algorithm, extractable, usages) {
      // Return a mock CryptoKey - no actual key import in MVP mode
      console.log('[crypto.subtle] importKey called (MVP pass-through)');
      return {
        type: 'secret',
        extractable,
        algorithm,
        usages,
        _mockKey: true,
      };
    },

    async encrypt(algorithm, key, data) {
      // Pass-through "encryption" for MVP - just prepend the IV to the data
      // This allows the app to work but provides NO actual security
      console.log('[crypto.subtle] encrypt called (MVP pass-through - NO REAL ENCRYPTION)');
      const combined = new Uint8Array(algorithm.iv.length + data.byteLength);
      combined.set(new Uint8Array(algorithm.iv), 0);
      combined.set(new Uint8Array(data), algorithm.iv.length);
      return combined.buffer;
    },

    async decrypt(algorithm, key, data) {
      // Pass-through "decryption" for MVP - just strip the IV
      console.log('[crypto.subtle] decrypt called (MVP pass-through - NO REAL DECRYPTION)');
      const combined = new Uint8Array(data);
      const ivLength = 12; // Standard GCM IV length
      const decrypted = combined.slice(ivLength);
      return decrypted.buffer;
    },
  };
}

console.log('[crypto] Web Crypto API polyfill installed (MVP mode - no real encryption)');
console.log('[crypto] WARNING: This is a pass-through implementation for testing only!');
