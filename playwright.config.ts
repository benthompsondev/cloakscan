import { defineConfig, devices } from '@playwright/test';

/**
 * Desktop e2e tests run against the production build served by `vite preview`
 * on 127.0.0.1 only. Default viewport is 1440x900; viewports.spec.ts also
 * exercises 1280x720 and 1920x1080.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 900 },
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
