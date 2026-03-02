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
  server: {
    port: 5173,
    watch: {
      // Use polling to avoid EMFILE (inotify limit) on Linux in large monorepos.
      // Raise OS limit permanently instead if CPU polling is a concern:
      //   echo "fs.inotify.max_user_instances=8192" | sudo tee /etc/sysctl.d/99-inotify.conf
      //   sudo sysctl -p /etc/sysctl.d/99-inotify.conf
      usePolling: true,
      interval: 300,
    },
  },
  build: { outDir: 'dist' },
});
