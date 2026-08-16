import { defineConfig, devices } from '@playwright/test';

process.env.NO_PROXY = [process.env.NO_PROXY, 'localhost', '127.0.0.1'].filter(Boolean).join(',');

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
    url: 'http://127.0.0.1:3002',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Use the bounded test model so browser tests remain deterministic.
    env: { PORT: '3002', CURIOSITY_TEST_MODEL: 'true', PLAYWRIGHT_TEST: 'true' },
  },
});
