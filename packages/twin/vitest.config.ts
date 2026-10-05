import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node', setupFiles: ['./src/testing/network-guard.ts'] },
})
