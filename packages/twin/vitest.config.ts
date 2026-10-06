import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./src/testing/network-guard.ts'],
    // Database tests boot PGlite (Postgres compiled to WebAssembly) per test, about 1.5 s each on a
    // CI runner, and the migration test applies every migration on a fresh instance: vitest's 5 s
    // default is sized for plain unit tests, not these.
    testTimeout: 30_000,
  },
})
