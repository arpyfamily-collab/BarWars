import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arpyfamily.barwars',
  appName: 'BarWars',
  webDir: 'out',
  server: {
    url: 'https://app.barwars.app',
    cleartext: false,
  },
};

export default config;
