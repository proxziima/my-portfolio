import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as { scripts: Record<string, string> }

describe('dev script', () => {
  // Visitors reach `eve dev` through the Messenger; the bundled self-modification extension would
  // give them a subagent that edits the twin's own source.
  it('runs eve dev without the bundled extensions', () => {
    expect(pkg.scripts.dev).toMatch(/eve dev\b.*--no-default-extensions/)
  })
})
