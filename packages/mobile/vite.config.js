import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, 'node_modules/react-native-web'),
      'react-native/Libraries/Utilities/codegenNativeComponent': path.resolve(__dirname, 'src/shims/codegenNativeComponent.js'),
      'react-native/Libraries/vendor/emitter/EventEmitter': path.resolve(__dirname, 'node_modules/react-native-web/Libraries/vendor/emitter/EventEmitter'),
    },
    extensions: ['.web.js', '.web.jsx', '.web.ts', '.web.tsx', '.js', '.jsx', '.ts', '.tsx'],
  },
  optimizeDeps: {
    exclude: ['react-native-webrtc', 'react-native-vector-icons', 'react-native-safe-area-context', 'react-native-screens', 'socket.io-client'],
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
        '.jsx': 'jsx',
      },
    },
  },
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
