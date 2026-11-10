import { defineConfig, devices } from '@playwright/test';

// Runs against the production build served by server.mjs (the same server Railway uses).
// Locally, PW_CHANNEL=chrome uses an installed Chrome instead of downloaded browsers.
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: channel
    ? [{ name: channel, use: { ...devices['Desktop Chrome'], channel } }]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      ],
  webServer: { command: 'npm run build && PORT=4173 node server.mjs', url: 'http://localhost:4173/healthz', reuseExistingServer: !process.env.CI },
});
