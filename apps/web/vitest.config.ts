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
  esbuild: { jsx: 'automatic' },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', passWithNoTests: true },
})
