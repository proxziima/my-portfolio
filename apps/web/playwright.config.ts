import { defineConfig, devices } from '@playwright/test'

// The worktree's server runs beside the main checkout's (3000): `PORT=3100 bun run test:e2e`.
const port = Number(process.env.PORT ?? 3000)
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: 'tests/e2e',
  // the tests share one dev server and one read-only CMS; a Next dev server compiles routes lazily,
  // so a handful of workers keeps the first hit from timing out
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  // needs the CMS on :3001 with the seed data; an already-running dev server on `port` is reused
  webServer: { command: 'bun run dev', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
})
