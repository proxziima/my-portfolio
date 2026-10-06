import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig } from 'vitest/config'

// eve resolves the bare `workflow` specifier to its vendored Workflow SDK at build time
// (eve/workflow-modules); tests resolve it the same way.
const require = createRequire(import.meta.url)
const eveDir = dirname(require.resolve('eve/package.json'))

export default defineConfig({
  resolve: { alias: { workflow: join(eveDir, 'dist/src/compiled/@workflow/core/index.js') } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Any un-mocked real network call fails the test (see the guard for how stubs interact).
    setupFiles: [require.resolve('@repo/twin/testing/network-guard')],
    // Database tests boot PGlite (Postgres compiled to WebAssembly) per test, about 1.5 s each on a
    // CI runner, and several tests drive real queries through it: vitest's 5 s
    // default is sized for plain unit tests, not these.
    testTimeout: 30_000,
  },
})
