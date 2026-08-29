import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'outsider-ui.spec.mjs',
  fullyParallel: false,
  reporter: 'list',
  timeout: 180_000,
  use: {
    baseURL: process.env.CLOAKSCAN_TARGET_URL ?? 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    ...devices['Desktop Chrome'],
  },
});
