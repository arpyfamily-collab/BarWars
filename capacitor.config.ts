import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arpyfamily.barwars',
  appName: 'BarWars',
  webDir: 'out',
  server: {
    url: 'https://barwars-codebase-int-yu8l.bolt.host',
    cleartext: false,
  },
};

export default config;
