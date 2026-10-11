import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': here('.'),
      // `server-only` throws outside the react-server condition; its own no-op entry lets tests import server modules.
      'server-only': here('./node_modules/server-only/empty.js'),
    },
  },
  // tsconfig keeps JSX for Next ("preserve"); tests that render components need the automatic runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    // Only with `--coverage` (CI): a summary for the PR report and a text total for the log.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      // Every source file counts, including ones no test imports (content/ holds only Markdown).
      include: ['{app,features,lib,shared}/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', 'next-env.d.ts', '.next/**'],
    },
  },
})
