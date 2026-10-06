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
    // Only with `--coverage` (CI): a summary for the PR report and a text total for the log.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      // Every source file counts, including ones no test imports; the test helpers aren't product code.
      include: ['src/**/*.ts'],
      exclude: ['src/testing/**'],
    },
  },
})
