import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests. Not run in CI (browsers are not installed there);
 * run locally with `./run.sh e2e`, which seeds the dev database and starts the
 * API (4104) and web (5104) servers.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: './test-results',
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  use: { baseURL: 'http://localhost:5104', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    cwd: '..',
    url: 'http://localhost:5104',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
