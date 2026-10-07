import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Vite 8 resolves tsconfig `paths` (e.g. `@payload-config`) natively.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Only with `--coverage` (CI): a summary for the PR report and a text total for the log.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      // Every source file counts, including ones no test imports. Left out: generated migrations,
      // Payload's generated admin routes and import map (src/app holds only `(payload)`, whose
      // parentheses a glob would read as a group), type declarations and the pure-data seed.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/migrations/**', 'src/app/**', '**/*.d.ts', 'src/seed/data.ts'],
    },
  },
})
