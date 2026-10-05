import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig } from 'vitest/config'

// eve resolves the bare `workflow` specifier to its vendored Workflow SDK at build time
// (eve/workflow-modules); tests resolve it the same way.
const eveDir = dirname(createRequire(import.meta.url).resolve('eve/package.json'))

export default defineConfig({
  resolve: { alias: { workflow: join(eveDir, 'dist/src/compiled/@workflow/core/index.js') } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
