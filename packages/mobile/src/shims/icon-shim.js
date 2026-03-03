/**
 * icon-shim.js — React Native icon shim for Expo Go
 *
 * react-native-vector-icons requires native linking (not available in Expo Go).
 * This shim provides a minimal no-op Icon component so the app doesn't crash.
 * For production, use @expo/vector-icons which is built into Expo Go.
 */
// Pure CommonJS — no ES module import/export mixing.
// Mixing `import` with `module.exports` overwrites the `__esModule: true`
// marker Babel sets, causing callers to receive `{ default: IconShim }`
// instead of IconShim when doing require(...).default or import default.
const React = require('react');
const { Text } = require('react-native');

const IconShim = ({ name, size = 16, color = '#000', style }) =>
  React.createElement(Text, { style: [{ fontSize: size, color }, style] }, '⬜');

IconShim.getImageSource = () => Promise.resolve(null);
IconShim.loadFont = () => Promise.resolve();

module.exports = IconShim;
module.exports.default = IconShim;
