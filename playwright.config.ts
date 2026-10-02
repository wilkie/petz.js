import { defineConfig, devices } from '@playwright/test';

/* The viewer, in a real browser, served by the dev server: which reads the
 * oracle's files where it is built, and asks for them where it is not. */
export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  use: { baseURL: 'http://localhost:5791' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5791/viewer.html',
    reuseExistingServer: true,
  },
});
