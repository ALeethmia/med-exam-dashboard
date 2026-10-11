import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';
export default defineConfig({
  testDir:'./tests/browser',
  fullyParallel:true,
  workers:2,
  timeout:30000,
  use:{baseURL:'http://127.0.0.1:3100', headless:true,
    launchOptions:{executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)}},
  webServer:{command:'PORT=3100 node server.js', url:'http://127.0.0.1:3100', reuseExistingServer:!process.env.CI}
});
