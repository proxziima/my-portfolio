import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  // the tests share one dev server and one read-only CMS; a Next dev server compiles routes lazily,
  // so a handful of workers keeps the first hit from timing out
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  // needs the CMS on :3001 with the seed data; an already-running dev server is reused
  webServer: { command: 'bun run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
})
