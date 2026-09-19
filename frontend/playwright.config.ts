import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 30000,
  use: { baseURL: 'http://localhost:3310', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' } }],
  webServer: { command: 'npm run start -- --hostname 127.0.0.1 --port 3310', url: 'http://localhost:3310/login', reuseExistingServer: false, timeout: 60000 },
});
