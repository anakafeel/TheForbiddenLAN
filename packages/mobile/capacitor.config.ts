import { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.forbiddenlan.app',
  appName: 'ForbiddenLAN',
  webDir: 'dist',
  server: { androidScheme: 'https' },
};
export default config;
